---
name: slide-templates
description: Browse, select, and grow a library of 40+ editable HTML slide-deck templates. Works as a companion to `frontend-slides-editable` — pick a template here, generate a deck there. Supports cloning style from a URL into a new preset.
---

# slide-templates

The library skill for [`editable-slide-templates`](https://github.com/dora-dotcom/editable-slide-templates) — a curated, growing collection of HTML slide-deck templates that all share the editable runtime contract from [`frontend-slides-editable`](https://github.com/dora-dotcom/frontend-slides-editable).

## What this skill does

1. **Browse** the 40-preset gallery, filterable by vibe, mood, category, light/dark.
2. **Select** a template and hand its `template.html` over to the user (or to `/frontend-slides-editable` for deck generation).
3. **Clone** a visual style from any web URL into a new draft preset (auto-populates `template.html` + `preset.md` + `meta.json` for review).
4. **Maintain** — refresh `INDEX.json`, regenerate screenshots, validate `meta.json` against the schema.

## When to invoke this skill

- The user asks to **browse** or **see** what templates are available.
- The user mentions a specific preset by name (`bold-poster`, `scatterbrain`, etc.) — open and inspect it.
- The user has a URL they like the look of and wants something similar.
- `/frontend-slides-editable` reached its Phase 2 Style Path and the user chose "Browse the template gallery".
- The user wants to **contribute** a new preset (port from somewhere or design from scratch).

## Repo location resolution

The skill needs to find the templates repo. Try in order:

1. **Local sibling clone** (preferred):
   - `~/editable-slide-templates/`
   - `~/Desktop/Projects/editable-slide-templates/`
   - `~/code/editable-slide-templates/`
   - `~/work/editable-slide-templates/`
2. **Environment override** — if `EDITABLE_SLIDE_TEMPLATES_DIR` is set, use that path.
3. **GitHub raw fallback**:
   `https://raw.githubusercontent.com/dora-dotcom/editable-slide-templates/main/...`
   (use WebFetch for `INDEX.json`, individual files, etc.)

Cache the resolved path for the session.

## Phase 1 — Browse

Read `INDEX.json` from the resolved repo. It has shape:
```json
{
  "schemaVersion": 1,
  "generated": "2026-05-15",
  "count": 40,
  "presets": [
    {
      "id": "bold-poster",
      "name": "Bold Poster",
      "vibe": ["bold", "editorial", "energetic", "indie"],
      "mood": ["impressed", "excited"],
      "category": "bold-poster",
      "lightDark": "light",
      "typography": { "display": "Shrikhand", "body": "Libre Baskerville" },
      "source": "zarazhangrui/beautiful-html-templates",
      "paths": {
        "template": "presets/bold-poster/template.html",
        "preset": "presets/bold-poster/preset.md",
        "meta": "presets/bold-poster/meta.json",
        "screenshot": "presets/bold-poster/screenshot.png",
        "thumb": "presets/bold-poster/thumb.png"
      }
    },
    ...
  ]
}
```

### How to present the gallery

When the user wants to browse:

1. **If they gave a filter** ("show me dark editorial ones"), filter the `presets[]` list by `vibe`, `mood`, `category`, or `lightDark`. Use case-insensitive contains-match.
2. **Show 4-8 candidates** at a time. For each: `name`, top 2 `vibe` tags, `category`, the `template.html` path. Include the thumbnail path so a host with image support can render it.
3. If a host supports it, use `open <thumb-path>` to flash the image, or `open <template-path>` to open the live deck.
4. Let the user say "show me more" / "open `<name>`" / "I want a different vibe".

### Categories at a glance (cheat sheet)

| Category | Examples |
|---|---|
| `brutalism` | `block-frame`, `raw-grid`, `neo-grid-bold` |
| `bold-poster` | `bold-poster`, `studio`, `pink-script`, `coral`, `biennale-yellow`, `broadside` |
| `editorial` | `cartesian`, `cobalt-grid`, `dark-botanical`, `editorial-forest`, `editorial-tri-tone`, `long-table`, `notebook-tabs`, `paper-and-ink`, `vintage-editorial` |
| `mid-century` | `grove`, `mat` |
| `minimal` | `monochrome`, `stencil-tablet` |
| `modular` | `capsule` |
| `playful` | `daisy-days`, `pastel-geometry`, `playful`, `split-pastel` |
| `handwriting` | `pin-and-paper`, `scatterbrain` |
| `retro-pixel` | `8-bit-orbit`, `retro-windows` |
| `retro-zine` | `retro-zine`, `sakura-chroma` |
| `activist` | `peoples-platform` |
| `specialty` | `creative-voltage`, `neon-cyber`, `swiss-modern`, `terminal-green` |
| `dark` / `light` | `bold-signal` / `electric-studio` |

## Phase 2 — Select & open

When the user picks a template (by id or by name):

1. Resolve `presets/<id>/template.html` from the repo path.
2. **If the user wants to generate a deck**: tell them to invoke `/frontend-slides-editable` and mention the chosen preset's path. The editable skill knows to copy `template.html` as the seed and customize it with the user's content.
3. **If the user just wants to look**: `open presets/<id>/template.html` (browser) and `open presets/<id>/preset.md` (spec).
4. **If the user wants to one-off copy**: `cp presets/<id>/template.html <destination>`; tell them how to enter edit mode (`E` key) and export.

## Phase 3 — Clone a URL into a new preset

When the user says "I want a deck that looks like `<URL>`" or "extract the style from `<URL>`":

1. Run the extraction script:
   ```bash
   python3 <repo>/scripts/extract_style_from_url.py --url "<URL>" --id "<draft-id>"
   ```
   The script will:
   - Fetch the URL (HTML + computed CSS via headless Chrome if available).
   - Parse for palette tokens (hex colors), font families, key heading sizes.
   - Take a 1280×720 reference screenshot.
   - Generate a **draft preset** at `presets/<draft-id>/` with `template.html`, `preset.md`, `meta.json`, plus a `_source.png` reference image.
   - Mark `meta.json.source.origin` as `"url:<URL>"` and `meta.json.ported.notes` as `"Draft from URL — review before publishing"`.

2. **Review the draft** with the user:
   - Open `presets/<draft-id>/template.html` and `presets/<draft-id>/_source.png` side by side.
   - Read aloud the extracted `preset.md` — fonts, palette, layout signatures.
   - Ask: "Does this capture the style? Anything to adjust?"

3. **Refine** based on feedback:
   - Tweak `meta.json` (vibe / mood / category / lightDark).
   - Edit `preset.md` signature elements.
   - Adjust `template.html` colors or slide layouts.

4. **Publish** when the user is happy:
   ```bash
   python3 <repo>/scripts/snapshot_screenshots.py --preset <draft-id>
   python3 <repo>/scripts/generate_index.py
   ```
   This refreshes `screenshot.png` / `thumb.png` and adds the new preset to `INDEX.json`.

5. **Offer to commit** via git in the repo: stage the new `presets/<draft-id>/` folder + updated `INDEX.json`, suggest a commit message like `Clone <draft-id> from <source-url>`.

## Phase 4 — Maintenance & inspection

Operations the skill should know how to run on the repo:

| Need | Command |
|---|---|
| Refresh INDEX after manual edits | `python3 scripts/generate_index.py` |
| Regenerate one screenshot | `python3 scripts/snapshot_screenshots.py --preset <id>` |
| Regenerate all screenshots | `python3 scripts/snapshot_screenshots.py --all` |
| Validate every `meta.json` | inline Python: `for p in presets/*/meta.json: jsonschema.validate(json.load(open(p)), json.load(open('schema.json')))` |
| Port an external skill HTML | `python3 scripts/port_to_editable.py --source <in> --output <out>` |
| Swap runtime in a skill-built HTML | `python3 scripts/migrate_from_skill.py --source <in> --id <preset-id>` |

## Integration with frontend-slides-editable

`/frontend-slides-editable` (the deck-generator skill) already knows about this library:

- When its Phase 1 finds no `design.md`, its Phase 2 Style Path offers "Browse the template gallery" — that hands off to this skill.
- When this skill returns a chosen preset, `/frontend-slides-editable` Phase 3 uses `presets/<id>/template.html` as the seed and customizes the user's content into it (preserving `[data-slide-object]` structure and `data-oid` attributes).

In a single conversation, the flow can be:

```
user: I want a brutalism-style deck about Q3 results
↓
/frontend-slides-editable invoked
↓ Phase 1 (no design.md, brutalism style preference noted)
↓ Phase 2 Style Path → "Browse the template gallery"
↓ delegates to /slide-templates
↓ filter: vibe=brutalism → 3 candidates (block-frame / raw-grid / neo-grid-bold)
↓ user picks block-frame
↓ returns presets/block-frame/template.html
↓ back in /frontend-slides-editable Phase 3
↓ customize with user's Q3 results content
↓ Phase 5 deliver
```

## Future capabilities (planned)

- **Smart search** — natural-language query against the corpus ("90s magazine vibe with cyan accents") returning top-3 matches by similarity.
- **Visual diff** — given two preset ids, render side-by-side and highlight differences.
- **Style fusion** — combine two presets into a new draft (e.g. `block-frame` borders + `monochrome` typography).
- **Auto-refresh** — periodically WebFetch the upstream repo to mirror new presets locally.

## Supporting files

- [`runtime/`](runtime/) in the templates repo — the canonical runtime contract (chrome HTML/CSS, runtime JS, viewport base) shared with `frontend-slides-editable`.
- [`schema.json`](schema.json) in the templates repo — JSON Schema v1 for `meta.json`.
- [`ATTRIBUTIONS.md`](ATTRIBUTIONS.md) in the templates repo — credits for ported templates.
- [`docs/porting-guide.md`](docs/porting-guide.md) in the templates repo — how to port an external HTML template, including known pitfalls (`</script>` in comments, IIFE scope).
