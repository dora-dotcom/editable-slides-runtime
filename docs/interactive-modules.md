# Interactive modules — where this is going, and why

**Status: half built. The read half is in and shipped; the write half is not.**
This is the design record, so the next session does not have to re-derive it.

## The problem

A consulting slide often is not a picture of a model — it *is* the model. Two
sliders, a margin table, a breakeven line, and the sentence "drag the levers to
see it". The `lever` object and `data-calc` (see CONTRACT.md, "Slides that
compute") cover that one pattern well.

But that is one pattern, and there are many: a toggle that reveals the detail
behind a claim, tabs across three scenarios, a stepper, a progress bar, a
conditional caption. Building each one into the runtime by hand does not scale —
and skills that generate decks are already writing this kind of markup
themselves. The runtime needs a general answer, not a longer list of widgets.

## The two ways we break such a deck today

Established by reading the code, not by guessing:

1. **HTML export keeps a deck's own `<script>`** — only PDF export and the
   filmstrip thumbnails strip scripts, and both are right to. So a deck with its
   own interactive JavaScript works the first time it is opened.
2. **The browser-storage restore rebuilds a slide with
   `parent.innerHTML = deckHtml`, and `innerHTML` never executes scripts.** So
   that same module is dead after a reload: the markup is there, the code is not.
3. **The editor steals the clicks.** Only `text` and `lever` objects are dragged
   by their grip rather than their body, so a button inside anything else starts
   a drag instead of being pressed.

## The decision

**A declarative binding layer, and no execution of code that arrived in a deck.**

The second half is the load-bearing one. Interactive HTML may come from anywhere
— another skill, a colleague, a page someone found — and a deck is a file that
gets forwarded. So the runtime must never be the thing that makes a stranger's
code run. Nothing here helps a deck's `<script>`; the restore path's inability to
run one is a property to keep rather than a bug to fix, and
`port_to_editable.py` already strips scripts when it wraps an outside deck.

What replaces it: a deck *declares* its interactivity in attributes, and the
runtime — which already has an expression evaluator with no side effects and no
reach into the DOM — animates it. A declared module is safe by construction. It
cannot navigate, fetch, or touch anything except the state and the bindings
below.

The cost is honest: this covers the interactive modules a deck actually wants,
not arbitrary programs. Anything genuinely needing to run code belongs in a
sandboxed iframe, which is a separate, explicitly opt-in thing, and is not built.

## The shape

State is named numbers, scoped to a slide, resolved in this order — later wins:

| Where | Meaning |
|---|---|
| `data-vars` on the `<section>` | What the author declared: the model's starting position |
| `data-state` on the `<section>` | What has happened since; written by the runtime |
| A lever's own `data-value` | A lever *is* its value, so it owns its name |

Splitting the author's numbers from the session's is what makes "put it back"
possible: clear `data-state` and the slide is as written.

Bindings any element in a deck may declare:

| Attribute | Effect |
|---|---|
| `data-bind-text="expr"` | Its text, through `data-format` |
| `data-calc="expr"` | The same thing; kept because it shipped and reads better in a sentence |
| `data-bind-show="expr"` | Sets `hidden` unless the expression is true — so a deck without the runtime still hides what the author hid |
| `data-bind-class="on: expr; muted: expr"` | A class per condition |
| `data-bind-style-width="expr"` | Any CSS property; unit from `data-bind-unit`, defaulting to `%` for lengths and `px` otherwise |
| `data-bind-value="name"` | An input that *is* that piece of state (this is what a lever is made of) |
| `data-on-click="x = x + 1"` | Assignments, on click / input / change |

Assignments only. The expression language has no side effects, so there is
nothing else to permit. Assigning to a lever's name moves the lever, clamped to
its own range, so a button saying `R = 99` cannot put the model somewhere the
slider cannot express.

## What is built

- `calcVars` / `stateSet` / `runStatements` — the state model, including
  `data-state` on the section and lever-aware writes.
- `applyBindings` — text, `show`, `class`, `style-*`, `value`, called from
  `recalc(slide)`, which already runs on a lever drag, on slide change, and on
  load.
- Everything the calculator already had, now going through the general path:
  1948 assertions still pass, so the read half is a refactor plus new
  capability, not a change in behaviour.

## What is left

1. **Events.** Delegated `click` / `input` / `change` on `[data-on-*]`, one undo
   entry per interaction (the lever's pointerdown/pointerup pattern generalises).
2. **The editor's click rule.** Generalise the lever exception: if the press is
   inside `[data-on-click]`, `[data-bind-value]`, `input`, `button`, `select`,
   `textarea` or `a`, select the object and let the control have the event.
   One rule, and every interactive module works while editing.
3. **A panel affordance.** At minimum, showing what state a slide has and what
   it currently holds; a "reset to as-written" button is nearly free once
   `data-state` is the only mutable thing.
4. **The lever, rebuilt on top.** It stays as an object type and a panel section,
   because it is the ergonomic 90% case, but its markup should be
   `data-bind-value` + `data-bind-text` rather than special-cased painting.
5. **CONTRACT.md** — the table above, once the write half is real.
6. **Tests** — b22: a toggle, tabs, a stepper, a progress bar, undo, `data-state`
   surviving save/export, and the hostile cases (an assignment to a name that is
   a lever, out-of-range values, a formula in `data-on-click` that cannot parse).

## Open questions

- **Deck-level state.** Everything is per-slide today. A model that spans slides
  (a scenario picked on slide 3 that changes the numbers on slide 7) would need
  state on `<html>` or `.slides-offset`. Cheap to add, easy to regret — it makes
  a slide no longer self-contained. Wait for a real need.
- **Strings.** The engine is numeric. `data-bind-class` sidesteps it by naming
  the class in the attribute, but a bound *label* ("Costs" / "Revenue") has no
  answer yet other than `data-bind-show` on two spans. Probably fine, and much
  simpler than adding a string type.
- **A reset control.** Almost free, and the moment someone drags a shared deck
  around, someone will want it.
