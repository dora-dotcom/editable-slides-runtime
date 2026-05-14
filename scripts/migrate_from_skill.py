#!/usr/bin/env python3
"""Migrate a frontend-slides-editable skill preset HTML into this repo's format.

Skill presets ALREADY use the editable runtime contract (section.slide,
.slides-offset, .slide-edit-layer, [data-slide-object]) — they just embed an
older runtime that's missing later bug fixes (print-color-adjust, the
</script>-in-comment header bug, etc.).

This script:
  1. Reads the skill preset HTML
  2. Strips its existing <script>...</script> block(s)
  3. Injects the current runtime/runtime.js content as a fresh script tag
  4. Writes presets/<id>/template.html

Usage:
  migrate_from_skill.py --source SKILL_HTML --id PRESET_ID
  migrate_from_skill.py --source-dir SKILL_PRESETS_DIR --all
"""

import argparse
import re
import sys
from pathlib import Path


SKILL_FILENAME_TO_ID = {
    'bold-signal':       'bold-signal',
    'creative-voltage':  'creative-voltage',
    'dark-botanical':    'dark-botanical',
    'electric-studio':   'electric-studio',
    'neon-cyber':        'neon-cyber',
    'notebook-tabs':     'notebook-tabs',
    'paper-ink':         'paper-and-ink',
    'pastel-geometry':   'pastel-geometry',
    'split-pastel':      'split-pastel',
    'swiss-modern':      'swiss-modern',
    'terminal-green':    'terminal-green',
    'vintage-editorial': 'vintage-editorial',
}


def swap_runtime(src_html: str, runtime_js: str) -> str:
    """Replace all <script>...</script> with one fresh script containing runtime_js."""
    matches = list(re.finditer(r'<script\b[^>]*>.*?</script>', src_html, re.DOTALL | re.IGNORECASE))
    if not matches:
        raise ValueError('No <script> block found in source — is this a valid skill preset?')
    # Strip every script tag
    stripped = re.sub(r'<script\b[^>]*>.*?</script>', '', src_html, flags=re.DOTALL | re.IGNORECASE)
    # Insert fresh runtime before </body>
    body_close = re.search(r'</body>', stripped, re.IGNORECASE)
    if not body_close:
        raise ValueError('No </body> found in source')
    injection = '\n<script>\n' + runtime_js + '\n</script>\n'
    return stripped[:body_close.start()] + injection + stripped[body_close.start():]


def migrate_one(src_path: Path, dst_dir: Path, runtime_js: str) -> bool:
    src_html = src_path.read_text(encoding='utf-8')
    try:
        out_html = swap_runtime(src_html, runtime_js)
    except ValueError as e:
        print(f'  FAIL {src_path.name}: {e}')
        return False
    dst_dir.mkdir(parents=True, exist_ok=True)
    out_path = dst_dir / 'template.html'
    out_path.write_text(out_html, encoding='utf-8')
    print(f'  {src_path.name:24s} -> presets/{dst_dir.name}/template.html  ({len(out_html):,} bytes)')
    return True


def main():
    p = argparse.ArgumentParser(description='Migrate skill preset HTMLs into this repo.')
    grp = p.add_mutually_exclusive_group(required=True)
    grp.add_argument('--source', help='Single skill preset HTML')
    grp.add_argument('--source-dir', help='Skill presets directory (with --all)')
    p.add_argument('--id', help='Preset id when using --source')
    p.add_argument('--all', action='store_true', help='Migrate every recognized skill preset under --source-dir')
    p.add_argument('--repo-root', default=str(Path(__file__).parent.parent),
                   help='Templates repo root (default: parent of scripts/)')
    args = p.parse_args()

    root = Path(args.repo_root)
    runtime_js = (root / 'runtime' / 'runtime.js').read_text(encoding='utf-8')

    if args.source:
        src_path = Path(args.source)
        preset_id = args.id or SKILL_FILENAME_TO_ID.get(src_path.stem) or src_path.stem
        dst = root / 'presets' / preset_id
        ok = migrate_one(src_path, dst, runtime_js)
        sys.exit(0 if ok else 1)

    if not args.all:
        sys.exit('Use --all with --source-dir.')
    src_dir = Path(args.source_dir)
    if not src_dir.is_dir():
        sys.exit(f'ERROR: {src_dir} not found')
    ok, fail = 0, 0
    for stem, preset_id in SKILL_FILENAME_TO_ID.items():
        src = src_dir / f'{stem}.html'
        if not src.is_file():
            print(f'  SKIP {stem}.html — not found in {src_dir}')
            fail += 1
            continue
        dst = root / 'presets' / preset_id
        if migrate_one(src, dst, runtime_js):
            ok += 1
        else:
            fail += 1
    print(f'\nDone — {ok} migrated, {fail} failed/skipped')
    sys.exit(0 if fail == 0 else 1)


if __name__ == '__main__':
    main()
