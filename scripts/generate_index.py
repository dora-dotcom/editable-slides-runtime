#!/usr/bin/env python3
"""Scan presets/ and emit INDEX.json — the consumable index for skill integration.

Each preset's meta.json contributes one row. The resulting INDEX.json is a
single array of compact records suitable for:
  - Skill Phase 2 (style discovery) — to surface preset options with vibe/mood
  - Gallery rendering in README.md
  - External tools that want a one-shot snapshot of the library

Usage:
    generate_index.py [--root REPO_ROOT]
"""

import argparse
import json
import sys
from pathlib import Path
from datetime import date


def collect(root: Path) -> list[dict]:
    presets_dir = root / 'presets'
    if not presets_dir.is_dir():
        sys.exit(f'ERROR: {presets_dir} not found')

    rows = []
    for entry in sorted(presets_dir.iterdir()):
        if not entry.is_dir():
            continue
        meta_path = entry / 'meta.json'
        if not meta_path.is_file():
            continue
        meta = json.loads(meta_path.read_text(encoding='utf-8'))
        rel = f'presets/{entry.name}'
        row = {
            'id': meta['id'],
            'name': meta['name'],
            'vibe': meta.get('vibe', []),
            'mood': meta.get('mood', []),
            'category': meta.get('category'),
            'lightDark': meta.get('lightDark'),
            'typography': {
                'display': meta.get('typography', {}).get('display'),
                'body': meta.get('typography', {}).get('body'),
            },
            'source': meta.get('source', {}).get('origin'),
            'paths': {
                'template': f'{rel}/template.html',
                'preset': f'{rel}/preset.md',
                'meta': f'{rel}/meta.json',
                'screenshot': f'{rel}/screenshot.png' if (entry / 'screenshot.png').is_file() else None,
                'thumb': f'{rel}/thumb.png' if (entry / 'thumb.png').is_file() else None,
            },
        }
        rows.append(row)
    return rows


def main():
    p = argparse.ArgumentParser(description='Generate INDEX.json from presets/.')
    p.add_argument('--root', default=str(Path(__file__).parent.parent),
                   help='Repo root (default: parent of scripts/)')
    args = p.parse_args()
    root = Path(args.root)

    rows = collect(root)
    index = {
        'schemaVersion': 1,
        'generated': date.today().isoformat(),
        'count': len(rows),
        'presets': rows,
    }
    out = root / 'INDEX.json'
    out.write_text(json.dumps(index, indent=2) + '\n', encoding='utf-8')
    print(f'Wrote {out}  ({len(rows)} presets)')


if __name__ == '__main__':
    main()
