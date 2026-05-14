# Editable Slide Templates

Visual templates for the [`frontend-slides-editable`](https://github.com/dora-dotcom/frontend-slides-editable) skill. Every template ships as a single self-contained HTML file with the full editable deck runtime — drag/resize objects, multi-select, undo/redo, Pages sidebar, save to localStorage, export HTML, export PDF.

## Status

🚧 **In development.** Repository scaffolded — templates are being migrated in.

## Structure

```
editable-slide-templates/
├── presets/                  ← one folder per template
│   └── <preset-id>/
│       ├── preset.md         ← vibe / layout / typography / colors / signature
│       ├── template.html     ← working sample with full editable runtime
│       ├── screenshot.png    ← 1280×720 hero
│       ├── thumb.png         ← 320×180 list thumbnail
│       └── meta.json         ← machine-readable metadata (see schema.json)
├── scripts/
│   ├── port_to_editable.py   ← convert external templates to the editable runtime
│   ├── generate_index.py     ← scan presets/ and emit INDEX.json
│   └── snapshot_screenshots.py
├── docs/
│   ├── porting-guide.md      ← how to adapt an external template
│   ├── contributing.md       ← preset submission rules
│   └── schema-versioning.md  ← schema evolution policy
├── ATTRIBUTIONS.md           ← original sources & licenses for ported templates
├── INDEX.json                ← generated index of all presets
└── schema.json               ← JSON Schema for meta.json (schemaVersion 1)
```

## Schema version

Current: **v1**. See [docs/schema-versioning.md](docs/schema-versioning.md).

## Adding a preset

1. Pick a unique `id` (kebab-case).
2. Create `presets/<id>/` with the five required files.
3. Validate `meta.json` against [schema.json](schema.json).
4. Add a row to [ATTRIBUTIONS.md](ATTRIBUTIONS.md) if the template is derived from an external source.
5. Run `python3 scripts/generate_index.py` to refresh `INDEX.json`.

## License

MIT — see [LICENSE](LICENSE). Templates derived from external MIT-licensed sources are credited in [ATTRIBUTIONS.md](ATTRIBUTIONS.md).
