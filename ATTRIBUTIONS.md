# Attributions

**The designs listed here are no longer in this repository.** It now ships only
the editing runtime and the contract a deck must meet — designs belong to their
authors, and the runtime never needed them.

This file stays as the record of what was once vendored here and where it came
from, so the history is traceable and the credit is not lost.

**For the originals, go to the source:**
[zarazhangrui/beautiful-html-templates](https://github.com/zarazhangrui/beautiful-html-templates)
(MIT) — better maintained there than a fork could be. `port_to_editable.py`
will wrap any of them to the contract.

The Simular AI design moved to its own private repository, since it carries a
company's brand rather than an open-source design.

## Vendored code

One library ships inside the runtime, and therefore inside every deck built with
it.

| What | Where it lives | Version | License | Why |
|---|---|---|---|---|
| **Moveable** — [daybrush/moveable](https://github.com/daybrush/moveable) | `runtime/vendor/moveable.min.js` | 0.53.0 | MIT | Dragging, sizing and turning objects. It is what Bento uses for the same job, and four hand-written attempts at the same arithmetic were wrong in four different ways. See the `GestureRig` comment in `runtime/runtime.js`. |

It is inlined ahead of the runtime by `scripts/runtime_js.py`, which every
builder reads its JavaScript through, so a deck assembled any way carries the
same bundle. Upgrading it is: replace the file, run `refresh_runtime.py`.

---

This repository contains both original templates and templates derived from external open-source sources. All derived templates are credited below with links to their original location and license.

## Original templates

Templates authored for this repository.

| Preset ID | Notes |
|---|---|
| `bold-signal` | Migrated from `frontend-slides-editable` skill (built-in preset). |
| `electric-studio` | Migrated from `frontend-slides-editable` skill. |
| `creative-voltage` | Migrated from `frontend-slides-editable` skill. |
| `dark-botanical` | Migrated from `frontend-slides-editable` skill. |
| `notebook-tabs` | Migrated from `frontend-slides-editable` skill. |
| `pastel-geometry` | Migrated from `frontend-slides-editable` skill. |
| `split-pastel` | Migrated from `frontend-slides-editable` skill. |
| `vintage-editorial` | Migrated from `frontend-slides-editable` skill. |
| `neon-cyber` | Migrated from `frontend-slides-editable` skill. |
| `terminal-green` | Migrated from `frontend-slides-editable` skill. |
| `swiss-modern` | Migrated from `frontend-slides-editable` skill. |
| `paper-and-ink` | Migrated from `frontend-slides-editable` skill. |

## Ported from external sources

Templates adapted from external repositories. The visual design is credited to the original author; the editable runtime integration is this repo's contribution.

### From [zarazhangrui/beautiful-html-templates](https://github.com/zarazhangrui/beautiful-html-templates) (MIT)

| Preset ID | Original path | Status |
|---|---|---|
| `block-frame` | `templates/block-frame/template.html` | ✅ Ported 2026-05-15 (4 of 10 slides) |
| `raw-grid` | `templates/raw-grid/template.html` | ✅ Ported 2026-05-15 (3 slides) |
| `neo-grid-bold` | `templates/neo-grid-bold/template.html` | ✅ Ported 2026-05-15 (3 slides) |
| `8-bit-orbit` | `templates/8-bit-orbit/template.html` | ✅ Ported 2026-05-15 (3 slides) |
| `retro-windows` | `templates/retro-windows/template.html` | ✅ Ported 2026-05-15 (3 of 10 slides) |
| `retro-zine` | `templates/retro-zine/template.html` | ✅ Ported 2026-05-15 (3 slides) |
| `sakura-chroma` | `templates/sakura-chroma/template.html` | ✅ Ported 2026-05-15 (3 slides) |
| `scatterbrain` | `templates/scatterbrain/template.html` | ✅ Ported 2026-05-15 (3 of 10 slides) |
| `pin-and-paper` | `templates/pin-and-paper/template.html` | ✅ Ported 2026-05-15 (3 slides) |
| `daisy-days` | `templates/daisy-days/template.html` | ✅ Ported 2026-05-15 (3 slides) |
| `bold-poster` | `templates/bold-poster/template.html` | ✅ Ported 2026-05-15 (4 of 10 slides) |
| `studio` | `templates/studio/template.html` | ✅ Ported 2026-05-15 (3 slides) |
| `pink-script` | `templates/pink-script/template.html` | ✅ Ported 2026-05-15 (3 slides) |
| `coral` | `templates/coral/template.html` | ✅ Ported 2026-05-15 (3 slides) |
| `biennale-yellow` | `templates/biennale-yellow/template.html` | ✅ Ported 2026-05-15 (3 slides) |
| `peoples-platform` | `templates/peoples-platform/template.html` | ✅ Ported 2026-05-15 (3 slides) |
| `monochrome` | `templates/monochrome/template.html` | ✅ Ported 2026-05-15 (4 of 16 slides) |
| `stencil-tablet` | `templates/stencil-tablet/template.html` | ✅ Ported 2026-05-15 (3 slides) |
| `mat` | `templates/mat/template.html` | ✅ Ported 2026-05-15 (3 slides) |
| `grove` | `templates/grove/template.html` | ✅ Ported 2026-05-15 (3 slides) |
| `long-table` | `templates/long-table/template.html` | ✅ Ported 2026-05-15 (3 slides) |
| `editorial-forest` | `templates/editorial-forest/template.html` | ✅ Ported 2026-05-15 (3 slides) |
| `editorial-tri-tone` | `templates/editorial-tri-tone/template.html` | ✅ Ported 2026-05-15 (3 slides) |
| `cobalt-grid` | `templates/cobalt-grid/template.html` | ✅ Ported 2026-05-15 (3 slides) |
| `cartesian` | `templates/cartesian/template.html` | ✅ Ported 2026-05-15 (3 slides) |
| `capsule` | `templates/capsule/template.html` | ✅ Ported 2026-05-15 (3 slides) |
| `playful` | `templates/playful/template.html` | ✅ Ported 2026-05-15 (3 slides) |
| `broadside` | `templates/broadside/template.html` | ✅ Ported 2026-05-15 (3 slides) |

## Evaluated but not ported

Reviewed during the migration but excluded because they visually overlap with an existing preset. The originals remain freely available under MIT at the source link above.

| Source template | Overlaps with | Reason |
|---|---|---|
| `soft-editorial` | `paper-and-ink` | Warm cream paper + Cormorant Garamond — same aesthetic. |
| `emerald-editorial` | `vintage-editorial` | Magazine-cover editorial — same niche. |
| `signal` | `bold-signal` | Both institutional dark themes; name collision. |
| `vellum` | `paper-and-ink` | Warm-yellow italic Cormorant — same family. |
| `creative-mode` | `bold-signal` | Archivo Black + multi-color accents — too similar. |
| `blue-professional` | `electric-studio` | Cobalt blue + cream — same palette. |

