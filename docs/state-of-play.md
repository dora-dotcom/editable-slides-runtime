# State of play — 5 August 2026

Where this project stands, and what the next session should pick up. Written to
be read first.

## What shipped in the last stretch

| | |
|---|---|
| **Gestures** | Drag, resize and rotate handed to Moveable (MIT, vendored). Four hand-written attempts had been wrong in four different ways; the library is what Bento uses for the same job. The control box is drawn *into* the slide so the canvas zoom cancels, and nothing it reports is applied as a transform — distances come back in layout pixels and are written as percentages, so the deck's geometry stays what CONTRACT.md says |
| **Size** | Moveable travels deflated with tiny-inflate to unpack it: 245 KB of library for 99 KB in the file, inflated synchronously at parse time. `DecompressionStream` was tried and rejected — it is a stream, and under headless Chrome's virtual clock the promise never settled, so the page never finished loading |
| **The rotation bug** | Not the handle, ever. `body.deck-edit-mode [data-fx-enter] { transform: none !important }` was throwing away every rotation applied to an object with an entrance — which on a real deck is most of them. Entering the editor now cancels the animations the runtime started instead of overriding them in CSS |
| **Markdown while typing** | `**bold**`, `*italic*`, `` `code` ``, `~~strike~~`, revertible with ⌘Z, backslash escapes, and the same conversion on paste. `- ` makes a real `<ul>` and `1. ` a real `<ol>`, because this runtime has list DOM where Bento does not |
| **Charts** | Scatter added; stacked, smooth, area, doughnut, axis numbers on round values, bars growing from zero. Series get distinct colours derived from the deck's accent rather than one colour at falling opacity |
| **Arrange** | Align with one meaning for one object (the slide) and another for several (their own bounds), distribute, match size, one-step reorder, and grouping by attribute with ⌘G / ⇧⌘G |
| **Slides that compute** | A `lever` object, `data-calc` formulas anywhere text goes including table cells, `data-vars` constants on the section, `{formula}` inside chart data, a format spec (`n1`, `pct0`, `+$k`), colour by sign. Evaluated by a parser in the runtime — never `eval` — and live while presenting and in a reading copy |

Regression at the end of it: **1948 assertions across six decks, none failing.**

## Half built

**The general binding layer** — the read half is in and shipped, the write half
is not. `docs/interactive-modules.md` is the design record: the decision, the
three concrete ways we break a skill's interactive HTML today, what is built,
the six things left, and three open questions. Start there.

The decision worth not re-litigating: interactive HTML may arrive from anywhere
and a deck is a file that gets forwarded, so the runtime must never be the thing
that makes a stranger's code run. Declared, not programmed.

## Next, in the order I would do them

1. **Move the test suite into this repo.** It is the highest-value work here and
   it is not a feature. Roughly 1950 assertions across 21 suites currently live
   in a scratchpad under `/private/tmp`, driven by two shell runners. They are
   ephemeral, and nobody but the session that wrote them can run them — which
   means the project's quality guarantee is, today, unreproducible. `tests/` plus
   one `run.py` that builds the fixtures, injects each suite and reports counts.
2. **The write half of the binding layer** — events, the editor's click rule, a
   reset control. About half the work of the read half. Once it lands, a module
   a skill generated is interactive without a line of JavaScript.
3. **ShareHTML Phase B** — the runtime in ShareHTML's save path, plus
   `data-deck-host-chrome`. Same thread as adapting Liyang's slides skill: what
   makes a deck from *his* generator editable in ShareHTML is this layer.

## Loose ends, older than this stretch

- `simular-slide-template` is still private. Both repos were meant to be public.
- ShareHTML PR #43 is still a draft, waiting on acceptance.
- `docs/editable-slides-plan` branch was never pushed.
- The examples (`examples/*/how-it-works.html`, `story.html`) are build output and
  are deliberately untracked. Rebuild with `make_deck.py` then `dress.py`.

## How to verify anything

```bash
# a deck already on an older runtime picks up the current one
python3 scripts/refresh_runtime.py --file ~/Desktop/runtime-deck.html
python3 scripts/refresh_runtime.py --file '~/Downloads/*.html'   # globs, skips decks that are not ours

# build one from scratch
python3 scripts/make_deck.py --content outline.md --design brand.css --output deck.html
```

Suites are driven by headless Chrome with `--virtual-time-budget` and read back
through `--dump-dom`. Two things that have bitten repeatedly and will again:
a modal freezes the renderer, so every suite stubs `alert`/`confirm`/`prompt`;
and real async work (a Blob read, a stream) outruns the virtual clock, which is
why the library is inflated synchronously.
