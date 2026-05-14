# Contributing a preset

## Requirements

Every preset folder under `presets/<id>/` must contain:

1. **`preset.md`** — vibe, layout, typography, colors, signature elements (free-form Markdown spec).
2. **`template.html`** — a single self-contained HTML file using the `frontend-slides-editable` runtime. Must include:
   - The full editable deck runtime (HistoryStack, SlideDeck, SlideObjectEditor, SlideSidebar)
   - `viewport-base.css` inlined in `<style>`
   - Sidebar buttons: `#btnExport` (HTML) AND `#btnExportPdf` (PDF)
   - `exportPdf()` function (verbatim from the runtime reference)
   - Startup self-check that logs missing required elements
3. **`screenshot.png`** — 1280×720, hero shot of slide 0.
4. **`thumb.png`** — 320×180, list thumbnail.
5. **`meta.json`** — validates against [`schema.json`](../schema.json).

## Naming

- `id` is kebab-case, must match the folder name and `meta.json.id`.
- `name` is Title Case for display.

## Verifying

Before opening a PR:

```bash
# Validate the meta.json against the schema
python3 -c "
import json, jsonschema, sys, pathlib
schema = json.load(open('schema.json'))
ok = True
for p in pathlib.Path('presets').glob('*/meta.json'):
    try:
        jsonschema.validate(json.load(open(p)), schema)
    except jsonschema.ValidationError as e:
        print(f'FAIL {p}: {e.message}')
        ok = False
sys.exit(0 if ok else 1)
"

# Refresh INDEX.json
python3 scripts/generate_index.py
```

## Originality

- Original templates: set `meta.json.source.origin = "original"`.
- Derived templates: set `origin` to the upstream identifier, include `license` and `originalUrl`. Add a row to [`ATTRIBUTIONS.md`](../ATTRIBUTIONS.md).
- Do not re-host upstream files in this repo — only the ported `template.html` lives here.
