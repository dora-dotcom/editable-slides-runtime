# Schema versioning

`schema.json` defines the contract for `presets/<id>/meta.json`. The pinned version is exposed via the `schemaVersion` field.

## Current version

**v1** — initial schema.

## Compatibility policy

- **Additive changes** (new optional field, new enum value) do not require a version bump. Consumers should ignore unknown fields.
- **Breaking changes** (removing a field, changing a field's type, narrowing an enum) require:
  1. Bump `schemaVersion` constant in `schema.json`.
  2. Migrate every existing `meta.json` in one commit.
  3. Update the consumer skill (`frontend-slides-editable`) in lockstep.
  4. Document the change in this file's "Change log" section.

## Change log

- **v1** — Initial schema. Captures id, name, vibe, mood, category, lightDark, typography, colors, capabilities (pdfExport, imageUpload), source, ported, screenshot, thumb.
