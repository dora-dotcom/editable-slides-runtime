# The story deck

Fifteen slides: the problem, the bet, what you get, how to use it. Built with
nothing from this repo but the runtime.

```bash
python3 ../../scripts/make_deck.py \
  --content content.md --design design.css --output story.html
python3 dress.py story.html
```

`design.css` is Simular's light theme, copied out of the design system under
the names it uses there. `content.md` is a markdown outline. `dress.py` adds
what markdown cannot say — pictures, entrances, per-slide transitions, a mark
that morphs across three slides, numbers that count up, a table, a chart, a
link and speaker notes — as markup that conforms to `CONTRACT.md`.

## The pictures

They are the runtime's own screens, captured from a real deck with headless
Chrome (`cap.js`, `cap2.js`) and embedded as base64 so the deck stays one file.
Sixty-four-colour palette PNG: 113 KB for four screenshots, against 375 KB at
full depth, with no visible loss on flat UI.

Rebuild them from a deck of your own:

```bash
# take the shots
chrome --headless --screenshot=raw-edit.png    'file://…/deck.html#edit'
chrome --headless --screenshot=raw-present.png 'file://…/deck.html#present'
# then quantise and base64 them into images.json — see the note in dress.py
```

## What the build checks

`dress.py` fails loudly if a slide count or an object it is told to narrow is
missing, rather than silently doing nothing — the first version matched the
wrong attribute and the pages that looked fine only looked fine because their
bullets happened to be short. The deck is then verified end to end: no console
error, every picture decoded, no two objects overlapping, and the motion
actually running.
