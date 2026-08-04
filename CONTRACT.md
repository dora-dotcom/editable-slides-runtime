# The runtime contract

**Bring your own design. The runtime makes it editable.**

This runtime does not care what a deck looks like. It was byte-identical across
the 43 preset designs this repo used to vendor — brutalist, pastel,
terminal-green, editorial, nothing in common — which is why they were retired:
they were never a dependency. What the runtime needs is not a design, it is a
*structure*. Meet the structure below and it all works: drag, resize, snap, rich text, page
management, tables, charts, shapes, motion, presenting, a speaker view, and
export — with no server, from a file on a disk.

That means a deck built to your company's design system, to a `design.md`, to a
theme you found on GitHub, or generated from scratch by an agent, is editable
without borrowing anything from this repo. Verified rather than claimed: a deck
with **zero** CSS custom properties passes the whole test suite unchanged.

---

## The structure

```html
<html data-deck-id="my-deck">          <!-- names the browser-storage slot -->
<body>
  … editor chrome (injected) …

  <div class="slides-offset">          <!-- the deck root -->

    <section class="slide visible"     <!-- one slide; .visible marks the current one -->
             data-notes="What to say here.">
      <div class="slide-edit-layer">   <!-- objects live here -->

        <div class="slide-object"
             data-slide-object
             data-oid="s0-title"       <!-- unique within its slide, stable -->
             data-object-type="text"
             style="left:6%;top:20%;width:70%;height:14%;">
          <div class="slide-object-text" contenteditable="true">Your headline</div>
        </div>

      </div>
    </section>

    <section class="slide"> … </section>

  </div>
</body>
</html>
```

Four rules, and they are the whole contract:

1. **Slides are `section.slide`, direct children of `.slides-offset`.** Not
   nested in a wrapper — the runtime queries `:scope > section.slide`. Anything
   deeper is invisible to it.
2. **Every editable thing is a `.slide-object`** carrying `data-slide-object`,
   a `data-oid` unique *within its slide*, and a `data-object-type`. Reusing an
   oid on another slide is not a clash — it is how a morph is declared, so
   duplicating a slide deliberately keeps them.
3. **Geometry is percentages** in the inline `style`: `left`, `top`, `width`,
   and usually `height`. Percentages are what let a slide scale to any viewport
   and still land in the same place.
4. **Objects sit inside `.slide-edit-layer`.** Anything outside it is
   background: rendered, never selectable, never dragged.

The handles are added by the runtime; you do not write them. They are not part of
the object either — the runtime draws a control box into the slide, around
whatever is selected — so a deck's markup says nothing about them, and a deck
that arrived carrying handles from an older version has them taken out on load.

---

## Object types

| `data-object-type` | Inner markup | Notes |
|---|---|---|
| `text` | `<div class="slide-object-text" contenteditable="true">` | The rich-text toolbar binds to this class |
| `graphic` | `.slide-object-graphic > img` | Double-click replaces the image |
| `shape` | `.slide-object-shape > svg`, plus `data-shape="rect\|ellipse\|line\|arrow"` | Inline SVG, `preserveAspectRatio="none"`, strokes marked `vector-effect="non-scaling-stroke"` |
| `table` | `.slide-object-table > table`, cells are `.slide-object-text[contenteditable]` | `table-layout:fixed`, or one filled cell claims the row |
| `chart` | `.slide-object-chart > svg`, plus `data-chart="bar\|line\|pie\|scatter"` and `data-chart-data="Q1 12, Q2 18"` | Drawn by the runtime from the data attribute; no charting library. See the chart attributes below |
| `media` | `.slide-object-media > video\|audio`, plus `data-media="video\|audio"` | Embedded as a data URI to keep the deck one file. A clip embeds at roughly 4/3 its size, so the editor warns above 8 MB — embed short, link long |
| `lever` | `.slide-object-lever` holding a label, a readout and an `<input type="range">` | A named number the room can drag. See "Slides that compute" below |

You rarely need to write these by hand — the editor inserts them. Write them
only when generating a deck programmatically.

### Text roles

A text object may carry `data-role="title" | "subtitle" | "body" | "kicker"`.
A role says what the text *is*, so a layout can later be applied by matching
donor to target on role instead of on hand-kept ids. Optional, cheap, and worth
setting when you generate a deck.

### Dynamic fields

Inside any text object, `<span data-field="page">3</span>` keeps the *token* in
the attribute and the *resolved value* as text. The document stores the token,
so a page number follows its slide when pages are reordered. Available tokens:
`page`, `pages`, `title`, `date`, `time`.

### Charts

`data-chart-data` is the whole data model: comma-separated entries, each a label
then its numbers. Two numbers on an entry means two series. A scatter reads the
label as the x, so `10 8, 15 12` is two points.

| Attribute | Effect |
|---|---|
| `data-chart="bar \| line \| pie \| scatter"` | Which kind |
| `data-chart-labels` | Category labels along the bottom, or the key on a pie |
| `data-chart-values` | The number on each column or point; on a pie, the share |
| `data-chart-legend` | Which colour is which series |
| `data-chart-grid` | Lines across the back, on the same round numbers as the axis |
| `data-chart-axis` | Numbers up the side, on round values, with a gutter reserved for them |
| `data-chart-stack` | Bars: series piled into one column per entry |
| `data-chart-smooth` | Lines: curve through the points |
| `data-chart-area` | Lines: fill the space down to zero |
| `data-chart-donut` | Pie: a hole in the middle |
| `data-chart-names="Plan, Actual"` | Series names for the legend |
| `data-chart-colour="#a3e635"` | The seed colour. Series colours are derived from it |
| `data-chart-colours="#111, #777"` | Series colours stated outright, when derived ones are not what you want |

Bars grow from zero rather than from the bottom of the box, so a negative number
dips below the line. Series get distinct colours — the accent, a cool
counterpart, and a light and deep tint of each — because three opacities of one
colour is not a legend anybody can read.

### Slides that compute

The consulting pattern: levers you drag and numbers that follow. A margin table,
a breakeven line, a total — arithmetic over a few named inputs, where the point
is that you change one in the room and the table answers.

**A lever** is an object of type `lever`:

```html
<div class="slide-object" data-slide-object data-oid="s4-lever-r"
     data-object-type="lever"
     data-var="R" data-label="Users sharing one machine (R)"
     data-min="1" data-max="8" data-step="1" data-value="1" data-format="n"
     style="left:6%;top:18%;width:40%;height:9%;">
</div>
```

`data-var` is the name a formula calls it by; the control itself is built by the
runtime from the attributes, so the markup above is all a generated deck needs.

**A computed number** is a span in any text, including inside a table cell:

```html
Breakeven utilisation = <span data-calc="1 / (R * (1 + markup))" data-format="pct0">50%</span>
```

The formula lives in the attribute and the last value in the text — the same
split as a page number, and for the same reason: a deck opened anywhere, with or
without this runtime, shows the number it was last showing.

**Constants** — the parts of a model nobody drags — go on the slide:

```html
<section class="slide" data-vars="machine=50, tokens=0.25, explorers=700">
```

Levers win over constants of the same name, because a lever is the thing you are
allowed to change.

**Formulas** know numbers, the variables in scope, `+ - * / % ^`, parentheses,
comparisons (`< > <= >= == != && ||`, giving 1 or 0), and
`min max abs round floor ceil sqrt pow clamp if`. They are evaluated by a parser
in the runtime, never by `eval` or `new Function` — a deck is a file that gets
forwarded, and "the numbers move" must not mean "this document can run code on
whoever opens it". A formula that does not parse, or names a variable that is not
in scope, shows `—`.

**Formats** are a short spec in `data-format`, on a lever or a computed number:

| Spec | 4900 becomes | Notes |
|---|---|---|
| `n` | `4,900` | Thousands separated |
| `n1` | `4,900.0` | The digit is the decimal places |
| `k` | `4.9k` | Millions past a million: `1.3m` |
| `$k` | `$4.9k` | |
| `+$k` | `+$4.9k` | `+` always shows the sign; negatives always do |
| `pct0` | — | Multiplies by 100: `0.5` → `50%` |

Add `data-calc-colour` to a computed number and it takes `--calc-up` above zero
and `--calc-down` below, so a margin table reads at a glance. Both default to a
green and a red that hold up on light and dark, and both are overridable —
"good" is green in some decks and not in others.

**A chart can be part of the model too.** Any `{formula}` inside
`data-chart-data` is evaluated before the chart is drawn:

```html
data-chart-data="Explorer {explorers * ex * machine * (markup - 1) / R}, Operator {operators * op * machine * (markup - 1) / R}"
```

Everything recomputes when a lever moves, when a slide becomes current, and when
a deck loads. **Including while presenting, and including in a reading copy** —
which is the point of the whole thing: you send the calculator, not a picture of
one.

### Motion

All optional, all read off the object, all ignored while editing.

| Attribute | Effect |
|---|---|
| `data-fx-enter="fade \| fade-up \| fade-down \| slide-left \| slide-right \| slide-up \| slide-down"` | Entrance animation when the slide is reached |
| `data-fx-order="2"` | Stagger step within the entrance; equal values enter together |
| `data-fx-duration="0.75"` | Entrance duration in seconds; omit for the per-kind default |
| `data-fx-countup` | Animate every number in the object from zero. Walks the numbers in place, so "$12.4M in Q3" animates the 12.4 and leaves the rest |

**Morph needs no attribute at all.** Give an object the same `data-oid` on two
slides and it glides between them: arriving at the second one animates it from
the first one's box. Both frames are already stated by the two slides, so there
is nothing to infer and nothing to configure. Change the geometry between the
two and the motion designs itself.

Motion is a viewing behaviour — none of it runs in edit mode, where an entrance
still in flight would fight a drag. Entering the editor cancels the ones the
runtime started, rather than overriding their transform in CSS: an object with an
entrance has to stay something you can rotate. All of it respects
`prefers-reduced-motion`.

### Grouping

| Attribute | Effect |
|---|---|
| `data-group="anything"` | Objects sharing a value on the same slide select and move as one. Alt-click reaches a single member |

A group is an attribute rather than a container: nothing moves in the DOM, so
paint order, entrances, morph pairs and the percentage geometry are all
untouched, and a deck opened without this runtime renders exactly the same —
`data-group` means nothing to a browser.

### Speaker notes

`data-notes` on the `<section>`. Notes live in the file, so they survive being
exported, emailed, and handed to an agent — which is the point.

---

## Presenting

A deck presents itself. Press **P** to present: the chrome goes away, the deck
fills the window, arrow keys and space page it, **Esc** leaves. A control pill
sits at the bottom, faint until you reach for it.

Press **S** while presenting for the **speaker view** — current position, the
next slide's title, this slide's `data-notes`, and a timer you can click to
reset. It opens as a second window you drag to another screen.

It works from a local file, which is the point: the speaker window is opened by
handle and its DOM written directly, rather than synchronised by messaging.
Messaging between two `file://` windows does not work — they get opaque origins
and never see each other's channel — so a deck opened off a disk would have lost
its speaker view. Holding the handle sidesteps that entirely.

If pop-ups are blocked the deck says so in the console and carries on
presenting; nothing else depends on that window.

---

## Living inside another viewer

A deck carries its own chrome so that it works alone. Inside someone else's
app that chrome is a collision: two toolbars stacked on each other, two sets of
arrow-key handlers, two present modes.

So **when the runtime finds itself in an iframe it stands down**: it adds
`deck-stood-down` to `<html>`, hides every surface it injected — the edit
chrome, the pages sidebar, the text toolbar, the present bar, the per-object
handles — and stops answering navigation keys and wheel events. The document
is left as content, and the host owns paging.

A host that *wants* the chrome back asks for it:

```html
<html data-deck-host-chrome>
```

That is the handshake. A viewer embedding a deck read-only sets nothing and
gets a clean document; a viewer that wants to offer this editor sets the
attribute and gets the whole runtime, including its save path.

---

## Design tokens

Every token below is **optional**. The runtime falls back when one is missing,
so a deck with no custom properties at all still works — it just inherits.

**Read by inserted content**, so setting these makes new objects look native
rather than pasted in:

| Token | Used for | Fallback |
|---|---|---|
| `--text-primary` | Text colour, shape strokes, table text | `currentColor` |
| `--deck-chrome-accent` | Shape fills, chart series | `currentColor` |
| `--deck-chrome-border` | Table cell borders | `currentColor` |
| `--font-body` | Body text, table text | inherited |
| `--body-size`, `--small-size` | Inserted text and table sizing | `1rem` / `0.9rem` |

**Read by the editor UI** (toolbars, sidebar, notes panel). Set these to make
the chrome match your deck rather than fight it: `--deck-chrome-surface`,
`--deck-chrome-text`, `--deck-chrome-muted`, `--deck-chrome-bg`,
`--deck-chrome-border`, `--deck-chrome-shadow`, `--font-mono`.

Also honoured where present: `--font-display`, `--slide-padding`,
`--slide-bg-deep`.

---

## Generating a conforming deck

`scripts/make_deck.py` writes one from a design source and a markdown outline,
so you never have to hand-assemble the structure above:

```bash
python3 scripts/make_deck.py --content outline.md --design brand.md --output deck.html
```

The design source can be a tokens `.json`, a `.css` with a `:root` block, or a
`design.md` — for the prose case it reads the hex colours and font names it
finds, taking the darkest as ink, the lightest as paper and the most saturated
as the accent. That is a guess, not a parse; anything it gets wrong is one edit
away in the deck, and anything it misses falls back.

Output carries roles, entrance animations, a live page field and a chart where
the outline asks for one — a worked example of everything above.

## Making an existing deck conform

`scripts/port_to_editable.py` does the mechanical part on any HTML deck:

```bash
python3 scripts/port_to_editable.py --source your-deck.html --output editable.html
```

It strips existing scripts, injects the runtime CSS, chrome and JS, wraps the
body in `.slides-offset`, and reports what it could not do automatically —
typically renaming `div.slide` to `section.slide`, wrapping movable content as
`[data-slide-object]`, and any class collisions between your CSS and the
chrome's.

What it cannot decide for you is **which elements should be objects**. That is
a judgment call: a card with an icon, a heading and a paragraph might be one
object or three. Wrap what you want people to be able to move.

---

## Keeping the runtime current

The runtime is inlined into each deck, because a deck has to be a single file
that opens anywhere with nothing installed. That means a change here does not
reach a deck until it is re-injected:

```bash
python3 scripts/refresh_runtime.py --file deck.html --check   # what would change
python3 scripts/refresh_runtime.py --file deck.html           # do it
python3 scripts/refresh_runtime.py --file 'decks/*.html'      # globs work
```

---

## What the runtime deliberately does not do

- **Impose a design.** No opinion on typography, colour, spacing or layout.
- **Require any particular design.** The preset library that used to live here
  was deleted without the runtime noticing.
- **Convert arbitrary decks by itself.** Meeting the structure is a decision
  about what should be editable, and that needs a person or a model in the loop.
  See `port_to_editable.py` for the mechanical half.

---

## One trap worth knowing

The pages sidebar renders **cloned** slides as thumbnails. A document-wide
`querySelectorAll('section.slide')` therefore counts every slide twice. Scope to
`.slides-offset > section.slide`, the way the runtime does — this has already
cost one debugging session.
