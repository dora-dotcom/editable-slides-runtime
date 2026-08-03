# How the runtime works — a deck about itself

Built the way anyone would build one, with nothing from this repo but the
runtime:

```bash
python3 ../../scripts/make_deck.py \
  --content content.md --design design.css --output how-it-works.html
python3 dress.py how-it-works.html
```

`design.css` is Simular's light theme, reduced to the handful of custom
properties the runtime reads. `content.md` is a markdown outline. `dress.py`
adds what markdown cannot say: entrances, per-slide transitions, a pair of
objects that morph between two slides, a number that counts up, a table, a
multi-series chart, and speaker notes — all as markup that conforms to
`CONTRACT.md`, which is the point. There is no template and no component
library behind it.

Open the result and it is an editor. F5 presents, S opens the speaker view.
