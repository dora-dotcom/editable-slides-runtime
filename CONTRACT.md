# The runtime contract

**Bring your own design. The runtime makes it editable.**

This runtime does not care what a deck looks like. It is byte-identical across
all 43 presets in this repo, whose designs have nothing in common — brutalist,
pastel, terminal-green, editorial. What it needs is not a design, it is a
*structure*. Meet the structure below and the editor works: drag, resize, snap,
rich text, page management, tables, charts, shapes, speaker notes, export.

That means a deck built to your company's design system, to a `design.md`, to a
theme you found on GitHub, or generated from scratch by an agent, is editable
without borrowing anything from this repo. The presets here are examples, not a
dependency.

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
             data-oid="s0-title"       <!-- unique in the document, stable -->
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
   a document-unique `data-oid`, and a `data-object-type`.
3. **Geometry is percentages** in the inline `style`: `left`, `top`, `width`,
   and usually `height`. Percentages are what let a slide scale to any viewport
   and still land in the same place.
4. **Objects sit inside `.slide-edit-layer`.** Anything outside it is
   background: rendered, never selectable, never dragged.

The move and resize handles are added by the runtime; you do not write them.

---

## Object types

| `data-object-type` | Inner markup | Notes |
|---|---|---|
| `text` | `<div class="slide-object-text" contenteditable="true">` | The rich-text toolbar binds to this class |
| `graphic` | `.slide-object-graphic > img` | Double-click replaces the image |
| `shape` | `.slide-object-shape > svg`, plus `data-shape="rect\|ellipse\|line\|arrow"` | Inline SVG, `preserveAspectRatio="none"`, strokes marked `vector-effect="non-scaling-stroke"` |
| `table` | `.slide-object-table > table`, cells are `.slide-object-text[contenteditable]` | `table-layout:fixed`, or one filled cell claims the row |
| `chart` | `.slide-object-chart > svg`, plus `data-chart="bar\|line\|pie"` and `data-chart-data="Q1 12, Q2 18"` | Drawn by the runtime from the data attribute; no charting library |
| `media` | `.slide-object-media > video\|audio`, plus `data-media="video\|audio"` | Embedded as a data URI to keep the deck one file. A clip embeds at roughly 4/3 its size, so the editor warns above 8 MB — embed short, link long |

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

Motion is a viewing behaviour — none of it runs in edit mode, where it would
fight a drag — and all of it respects `prefers-reduced-motion`.

### Speaker notes

`data-notes` on the `<section>`. Notes live in the file, so they survive being
exported, emailed, and handed to an agent — which is the point.

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
python3 scripts/refresh_runtime.py --check    # what would change
python3 scripts/refresh_runtime.py            # do it
python3 scripts/refresh_runtime.py --id studio
```

---

## What the runtime deliberately does not do

- **Impose a design.** No opinion on typography, colour, spacing or layout.
- **Require these presets.** They are examples. Delete them and the runtime is
  unaffected.
- **Convert arbitrary decks by itself.** Meeting the structure is a decision
  about what should be editable, and that needs a person or a model in the loop.
  See `port_to_editable.py` for the mechanical half.

---

## One trap worth knowing

The pages sidebar renders **cloned** slides as thumbnails. A document-wide
`querySelectorAll('section.slide')` therefore counts every slide twice. Scope to
`.slides-offset > section.slide`, the way the runtime does — this has already
cost one debugging session.
