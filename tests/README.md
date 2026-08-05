# Tests

```bash
python3 tests/run.py                # everything: 40 suites × 3 fixtures
python3 tests/run.py b7 b8 three    # only those suites
python3 tests/run.py --deck nt      # only against that fixture
python3 tests/run.py --keep         # leave the built pages in tests/build/ to open by hand
```

Needs Google Chrome or Chromium. Nothing else — no npm, no test framework.

## What a suite is

A suite is a plain script that drives a real deck in a real browser. It waits
for the editor, clicks the chrome the way a person would, reads the DOM back,
and appends a `<pre>` of `PASS` / `FAIL` lines. `run.py` injects one suite into
one deck before `</body>`, runs headless Chrome over the result with
`--dump-dom`, and counts what comes back.

There is no assertion library and no runner protocol beyond that `<pre>`. A
suite that throws catches its own error and reports it as a failure, so a broken
suite reads as a failure rather than a hang.

## The three fixtures

The runtime's claim is that it has no opinion about how a deck looks, so every
suite runs against three unrelated designs:

| | |
|---|---|
| `deck` | The plain one — a couple of slides and the tokens the runtime reads |
| `acme` | A real design: serif display face, warm paper, an accent that is not the default blue. Generated once by `make_deck.py` from a `design.md` that named its colours in prose |
| `nt` | **Zero** CSS custom properties, in a design unlike anything this repo ships. An inserted table, chart or shape has no token to read, so it must fall back to `currentColor` and still land looking native |

`nt` is the one that keeps `CONTRACT.md` honest, and it is the one most likely
to be quietly ruined by someone being helpful. So it declares

```html
<!-- fixture-invariant: no-custom-properties -->
```

and `run.py` refuses to run if the file ever defines one. Without that, adding a
token would make the fixture stop testing the thing it exists to test, and
every suite would still pass.

### Fixtures are built, never committed

`tests/fixtures/` holds *sources* — about 9 KB in total, pre-injection. Each run
injects the current `runtime/` into them and writes the decks to `tests/build/`,
which is gitignored.

A deck carries its runtime inlined, because it has to be one file that opens
anywhere. That means a committed deck is a snapshot of the runtime it was built
with: the suites would keep passing while `runtime/` rotted underneath them.
Building every time is what makes a green run mean anything.

## Two traps, both of which have bitten more than once

**A modal freezes a headless renderer.** Every suite stubs `alert`, `confirm`
and `prompt` before it does anything. A new suite that reaches one without
stubbing will hang until the 180s timeout. Four suites (`five`, `rh2`, `three`,
`zoom2`) carry no stub because they touch no modal path — check before copying
one of them as a template.

**Real async work outruns the virtual clock.** `--virtual-time-budget` lets the
page's timers run as fast as they can be serviced, but a Blob read or a stream
settles on the real clock and never lands: the budget expires first and the DOM
is dumped without it. Suites capture at the point of construction instead —
`a1` stubs `window.Blob` to grab the exported HTML as it is built, rather than
reading the artefact back.

A third, found while moving these in: **do not pass `--user-data-dir`.** Pointing
Chrome at a fresh profile hangs it indefinitely under `--virtual-time-budget`,
and `--no-first-run` does not help. Without the flag, several `--dump-dom` runs
go concurrently against the default profile without contending, which is what
`--jobs` relies on.

## The number

A full run is **2208 assertions across 120 runs**, about three minutes at
`--jobs 6`.

The figure recorded before this suite moved into the repo was 1948. The
difference is coverage, not regression: the old shell runners ran a selective
matrix, and this runs all 40 suites against all 3 fixtures. Two suites had to
have their fixtures filled in to make that possible — `three` needs a
`[data-field="pages"]` on every slide, and `b17` needs at least one object
carrying `data-fx-enter`, both of which a real deck has and the two hand-written
fixtures were missing.

## Adding a suite

Drop a `.js` file in `tests/suites/`. `run.py` discovers it by filename and runs
it against every fixture. Copy the header of an existing suite — the modal stub
and the `whenReady` poll are the parts you cannot skip. Wait for
`deck-edit-mode` **and** `deck-sidebar-open` **and** a `.slide-edit-layer`:
`enterEditMode` opens the pages rail last, so the rail is the signal that
startup actually finished. Starting earlier means clicking Insert before the
editor is listening, which reads as a failure in whatever the suite tried first.
