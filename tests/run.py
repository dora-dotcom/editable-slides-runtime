#!/usr/bin/env python3
"""Run the deck suites.

Every suite is a plain script that drives a real deck in a real browser: it
enters the editor, clicks the chrome, reads the DOM back, and appends a `<pre>`
of `PASS`/`FAIL` lines. This runner builds the fixtures, injects one suite into
one deck, drives headless Chrome over the result and counts what comes back.

    python3 tests/run.py                    # everything
    python3 tests/run.py b7 b8              # only those suites
    python3 tests/run.py --deck nt          # only against that fixture
    python3 tests/run.py --keep             # leave the built pages to open by hand

Fixtures are *built*, never committed. A deck carries its runtime inlined, so a
committed deck is a snapshot of the runtime it was built with — it would keep
passing while runtime/ rotted underneath it. `tests/fixtures/` holds the small
sources instead, and every run re-injects the current runtime/.

Two things have bitten repeatedly and will again:

  * A modal freezes a headless renderer. Every suite stubs alert/confirm/prompt
    before it does anything; a new suite that forgets will hang until timeout.
  * Real async work outruns the virtual clock. `--virtual-time-budget` makes the
    page's timers run as fast as they can be serviced, but a Blob read or a
    stream settles on the real one and never lands. Suites capture at the point
    of construction instead of reading the artefact back.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import html
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TESTS = ROOT / "tests"
SUITES = TESTS / "suites"
FIXTURES = TESTS / "fixtures"
BUILD = TESTS / "build"

CHROME_CANDIDATES = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    shutil.which("google-chrome") or "",
    shutil.which("chromium") or "",
    shutil.which("chromium-browser") or "",
]

# How long the page's own clock may run before Chrome dumps the DOM. Virtual
# time, not wall clock: it is a budget for the deck's timers, and a suite that
# polls `whenReady` 60 times at 100ms needs at least 6s of it.
DEFAULT_BUDGET_MS = 30000


def find_chrome() -> str:
    for path in CHROME_CANDIDATES:
        if path and Path(path).exists():
            return path
    sys.exit(
        "no Chrome found. Install Google Chrome, or put chromium on PATH.\n"
        "Tried:\n  " + "\n  ".join(p for p in CHROME_CANDIDATES if p)
    )


# --------------------------------------------------------------------------
# fixtures


# A fixture may state what makes it worth having, and the runner holds it to it.
# nt exists only to be the deck with nothing to read; the day someone "fixes" it
# by adding a token, it stops testing the thing it was built to test and every
# suite still passes. That is the failure this catches.
INVARIANT_RE = re.compile(r"<!--\s*fixture-invariant:\s*([a-z-]+)\s*-->")
CUSTOM_PROP_RE = re.compile(r"--[a-zA-Z0-9-]+\s*:")


def check_invariants(name: str, html_text: str) -> None:
    for invariant in INVARIANT_RE.findall(html_text):
        if invariant == "no-custom-properties":
            # Comments are prose and may well mention `--something`; only a
            # declaration counts, so strip comments before looking.
            body = re.sub(r"<!--.*?-->", "", html_text, flags=re.S)
            found = sorted(set(CUSTOM_PROP_RE.findall(body)))
            if found:
                sys.exit(
                    f"fixture {name} declares 'no-custom-properties' but defines "
                    f"{len(found)}: {' '.join(found)}\n"
                    f"That fixture's whole job is to have nothing for the runtime "
                    f"to read. Put the token in a different fixture."
                )
        else:
            sys.exit(f"fixture {name}: unknown invariant {invariant!r}")


def build_fixtures(only: str | None = None) -> dict[str, Path]:
    """Inject the current runtime/ into each fixture source.

    Three decks, because the runtime's claim is that it does not care how a deck
    looks — same suites, three unrelated designs:

      deck  — the plain one, a couple of slides and the tokens the runtime reads
      acme  — a real design: serif display face, warm paper, an accent that is
              not the default blue. Generated once by make_deck.py from a
              design.md that named its colours in prose
      nt    — *zero* CSS custom properties, in a design unlike anything this
              repo ships. Inserted tables, charts and shapes have to fall back
              to currentColor and still land looking native. This is the fixture
              that keeps the CONTRACT.md claim honest

    The sources are stored pre-injection and are ~9 KB in total. Storing them
    built would be storing a snapshot of the runtime they were built with, and
    the suites would keep passing while runtime/ rotted underneath them.
    """
    sys.path.insert(0, str(ROOT / "scripts"))
    from port_to_editable import inject_body_wrappers, inject_css, load_parts

    BUILD.mkdir(exist_ok=True)
    parts = load_parts(ROOT / "runtime")
    built: dict[str, Path] = {}

    for source in sorted(FIXTURES.glob("*-source.html")):
        name = source.stem[: -len("-source")]
        if only and name != only:
            continue
        html_text = source.read_text(encoding="utf-8")
        check_invariants(name, html_text)
        html_text, css_status = inject_css(
            html_text, parts["viewport_css"], parts["chrome_css"]
        )
        html_text, body_status = inject_body_wrappers(
            html_text, parts["chrome_html"], parts["runtime_js"]
        )
        for status in (css_status, body_status):
            if str(status).startswith("failed"):
                sys.exit(f"fixture {name}: runtime injection failed: {status}")
        out = BUILD / f"{name}.html"
        out.write_text(html_text, encoding="utf-8")
        built[name] = out

    if not built and not only:
        sys.exit(f"no fixtures in {FIXTURES} (expected *-source.html)")
    return built


# --------------------------------------------------------------------------
# running one suite against one deck

# The suite's own <pre> is the last one carrying a verdict. Matching the last
# rather than the first matters: a deck may legitimately contain a <pre> of its
# own, and a suite that errors early appends a short one after a longer stub.
VERDICT_RE = re.compile(
    r"<pre[^>]*>((?:(?!</pre>).)*?(?:PASS|FAIL|ERROR)(?:(?!</pre>).)*)</pre>", re.S
)


def run_one(chrome: str, deck_path: Path, suite_path: Path, budget: int, keep: bool):
    """Inject one suite into one deck, run it, and return (passes, failures, lines)."""
    deck_html = deck_path.read_text(encoding="utf-8")
    suite_js = suite_path.read_text(encoding="utf-8")

    idx = deck_html.rfind("</body>")
    if idx == -1:
        return 0, 1, [f"ERROR {deck_path.name} has no </body> to inject before"]
    page = deck_html[:idx] + "<script>\n" + suite_js + "\n</script>" + deck_html[idx:]

    page_path = BUILD / f"{deck_path.stem}--{suite_path.stem}.html"
    page_path.write_text(page, encoding="utf-8")

    # No --user-data-dir. Pointing Chrome at a fresh profile directory hangs it
    # indefinitely under --virtual-time-budget: profile setup waits on the real
    # clock while the page's clock has already run out, and --no-first-run does
    # not avoid it. Without the flag it reuses the default profile, and several
    # --dump-dom runs go concurrently against it without contending — measured,
    # because the obvious worry is a singleton lock that would serialise them.
    proc = subprocess.run(
        [
            chrome,
            "--headless",
            "--disable-gpu",
            "--no-sandbox",
            f"--virtual-time-budget={budget}",
            "--window-size=1440,900",
            "--dump-dom",
            page_path.as_uri(),
        ],
        capture_output=True,
        text=True,
        timeout=180,
    )

    if not keep:
        page_path.unlink(missing_ok=True)

    matches = VERDICT_RE.findall(proc.stdout)
    if not matches:
        return 0, 1, [f"ERROR {suite_path.stem}/{deck_path.stem} produced no verdict"]

    text = html.unescape(matches[-1])
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    passes = sum(1 for ln in lines if ln.startswith("PASS"))
    fails = [ln for ln in lines if ln.startswith(("FAIL", "ERROR"))]
    return passes, len(fails), fails


# --------------------------------------------------------------------------
# main


def discover_suites(names: list[str]) -> list[Path]:
    found = sorted(SUITES.glob("*.js"))
    if not found:
        sys.exit(f"no suites in {SUITES}")
    if not names:
        return found
    by_stem = {p.stem: p for p in found}
    picked = []
    for n in names:
        n = n[:-3] if n.endswith(".js") else n
        if n not in by_stem:
            sys.exit(f"no such suite: {n}\navailable: {' '.join(sorted(by_stem))}")
        picked.append(by_stem[n])
    return picked


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("suites", nargs="*", help="suite names to run; default all")
    ap.add_argument("--deck", help="only this fixture (deck, acme, nt)")
    ap.add_argument("--budget", type=int, default=DEFAULT_BUDGET_MS,
                    help=f"virtual-time budget in ms (default {DEFAULT_BUDGET_MS})")
    ap.add_argument("--jobs", type=int, default=4, help="concurrent Chrome runs")
    ap.add_argument("--keep", action="store_true",
                    help="keep the injected pages in tests/build to open by hand")
    args = ap.parse_args()

    chrome = find_chrome()
    suites = discover_suites(args.suites)

    print(f"building fixtures against {ROOT / 'runtime'} …")
    decks = build_fixtures(args.deck)
    if not decks:
        sys.exit(f"no such fixture: {args.deck}")
    for name, path in decks.items():
        print(f"  {name:6s} {path.stat().st_size:>9,}B")

    jobs = [(d, s) for s in suites for d in decks.values()]
    print(f"\n{len(suites)} suites × {len(decks)} decks = {len(jobs)} runs, {args.jobs} at a time\n")

    started = time.monotonic()
    results: dict[tuple[str, str], tuple[int, int, list]] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.jobs) as pool:
        futures = {
            pool.submit(run_one, chrome, deck, suite, args.budget, args.keep): (suite.stem, deck.stem)
            for deck, suite in jobs
        }
        for fut in concurrent.futures.as_completed(futures):
            key = futures[fut]
            try:
                results[key] = fut.result()
            except subprocess.TimeoutExpired:
                results[key] = (0, 1, [f"ERROR {key[0]}/{key[1]} timed out"])
            except Exception as exc:  # a broken suite should not sink the run
                results[key] = (0, 1, [f"ERROR {key[0]}/{key[1]} {exc}"])
            p, f, _ = results[key]
            print(f"  {key[0]:>10s} / {key[1]:<5s} {p:4d} pass  {f:2d} fail" + ("  ✗" if f else ""))

    total_pass = sum(p for p, _, _ in results.values())
    total_fail = sum(f for _, f, _ in results.values())
    elapsed = time.monotonic() - started

    print(f"\n{'=' * 60}")
    print(f"{total_pass} passed, {total_fail} failed, {len(jobs)} runs in {elapsed:.0f}s")

    if total_fail:
        print(f"\nfailures:")
        for (suite, deck), (_, _, lines) in sorted(results.items()):
            for line in lines:
                print(f"  {suite}/{deck}: {line}")

    if not args.keep:
        for leftover in BUILD.glob("*--*.html"):
            leftover.unlink(missing_ok=True)

    return 1 if total_fail else 0


if __name__ == "__main__":
    raise SystemExit(main())
