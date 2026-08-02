#!/usr/bin/env python3
"""Re-inject the current runtime/ into every preset template.

The runtime is inlined into each preset, so a change under runtime/ reaches
nobody until the presets are rebuilt. port_to_editable.py ports an outside
template in; migrate_from_skill.py imports from the skill. Neither refreshes
what is already here — this does.

Each template carries three injected regions, each with a stable opening
marker:

    <style>   … preset CSS …
              /* === viewport-base.css === */      <-- CSS region starts
              … viewport-base.css + chrome.css …
    </style>                                       <-- CSS region ends

    <!-- Deck chrome HTML — extracted from …       <-- chrome region starts
    … chrome.html …
    <div class="slides-offset">                    <-- chrome region ends

    <script>
    // Editable deck runtime — extracted from …    <-- runtime region starts
    … runtime.js …
    </script>                                      <-- runtime region ends

Note the `slides-offset` boundary: the chrome comment mentions it in prose, so
the real element is the LAST match, not the first.

Usage:
    refresh_runtime.py                # refresh every preset
    refresh_runtime.py --check        # report what would change, write nothing
    refresh_runtime.py --id studio    # one preset
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

# The marker has been spelled two ways: the original, and the "(our editable
# runtime)" variant introduced by the in-progress re-wrap. Match both.
CSS_START_RE = re.compile(r'/\* === viewport-base\.css[^=]*=== \*/')
CSS_START = '/* === viewport-base.css === */'
CSS_END = '</style>'
CHROME_START = '<!-- Deck chrome HTML'
CHROME_END = '<div class="slides-offset">'
RUNTIME_START = '// Editable deck runtime'
RUNTIME_END = '</script>'


class RefreshError(Exception):
    pass


def _slice(html: str, start_marker, end_marker: str, *, end_is_last: bool) -> tuple[int, int]:
    """Return the [start, end) span to replace, or raise if the markers are missing."""
    if hasattr(start_marker, 'search'):
        m = start_marker.search(html)
        start = m.start() if m else -1
        label = start_marker.pattern
    else:
        start = html.find(start_marker)
        label = start_marker
    if start == -1:
        raise RefreshError(f'opening marker not found: {label!r}')
    end = html.rfind(end_marker) if end_is_last else html.find(end_marker, start)
    if end == -1 or end <= start:
        raise RefreshError(f'closing marker not found after the opening one: {end_marker!r}')
    return start, end


def refresh(html: str, runtime: dict[str, str]) -> str:
    css = (
        runtime['viewport_css'].rstrip()
        + '\n\n/* === deck chrome CSS === */\n'
        + runtime['chrome_css'].rstrip()
        + '\n'
    )
    if not css.lstrip().startswith(CSS_START):
        css = CSS_START + '\n' + css

    # Runtime region first: replacing earlier regions would shift its offsets.
    start, end = _slice(html, RUNTIME_START, RUNTIME_END, end_is_last=True)
    html = html[:start] + runtime['runtime_js'].rstrip() + '\n' + html[end:]

    start, end = _slice(html, CHROME_START, CHROME_END, end_is_last=True)
    html = html[:start] + runtime['chrome_html'].rstrip() + '\n\n' + html[end:]

    start, end = _slice(html, CSS_START_RE, CSS_END, end_is_last=False)
    html = html[:start] + css + html[end:]
    return html


def load_runtime(runtime_dir: Path) -> dict[str, str]:
    return {
        'viewport_css': (runtime_dir / 'viewport-base.css').read_text(encoding='utf-8'),
        'chrome_css': (runtime_dir / 'chrome.css').read_text(encoding='utf-8'),
        'chrome_html': (runtime_dir / 'chrome.html').read_text(encoding='utf-8'),
        'runtime_js': (runtime_dir / 'runtime.js').read_text(encoding='utf-8'),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--repo-root', default=str(Path(__file__).resolve().parent.parent))
    ap.add_argument('--id', help='refresh a single preset by id')
    ap.add_argument('--check', action='store_true', help='report changes without writing')
    args = ap.parse_args()

    root = Path(args.repo_root)
    runtime = load_runtime(root / 'runtime')
    presets = sorted((root / 'presets').iterdir())
    if args.id:
        presets = [p for p in presets if p.name == args.id]
        if not presets:
            print(f'no preset with id {args.id!r}', file=sys.stderr)
            return 2

    changed, skipped, failed = 0, 0, []
    for preset in presets:
        template = preset / 'template.html'
        if not template.is_file():
            continue
        before = template.read_text(encoding='utf-8')
        try:
            after = refresh(before, runtime)
        except RefreshError as exc:
            failed.append((preset.name, str(exc)))
            continue

        if after == before:
            skipped += 1
            continue
        changed += 1
        delta = len(after) - len(before)
        print(f'  {preset.name:<24} {delta:+d} bytes')
        if not args.check:
            template.write_text(after, encoding='utf-8')

    verb = 'would change' if args.check else 'refreshed'
    print(f'\n{verb}: {changed}   already current: {skipped}   failed: {len(failed)}')
    for name, why in failed:
        print(f'  FAILED {name}: {why}', file=sys.stderr)
    return 1 if failed else 0


if __name__ == '__main__':
    raise SystemExit(main())
