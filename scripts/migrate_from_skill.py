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


def swap_runtime(src_html: str, runtime_js: str, chrome_html: str = '') -> str:
    """Refresh both runtime <script> AND deck chrome HTML.

    The chrome HTML region (between <body> opening and the FIRST
    <div class="slides-offset"> opening) holds buttons + file inputs the
    runtime expects. If the source skill repo's chrome is older than the
    runtime contract, A−/A+, + Add Image, and deckImgInput/deckBgInput
    can be missing — migrate must refresh chrome too, not just the script.
    """
    # 1) Strip every script block
    pat = re.compile(r'<script\b[^>]*>.*?</script>', re.DOTALL | re.IGNORECASE)
    if not pat.search(src_html):
        raise ValueError('No <script> block found in source — is this a valid skill preset?')
    out = pat.sub('', src_html)

    body_open = re.search(r'<body[^>]*>', out, re.IGNORECASE)
    body_close = re.search(r'</body>', out, re.IGNORECASE)
    if not body_open or not body_close:
        raise ValueError('No <body>/<\\/body> in source')

    # 2) Refresh deck chrome HTML if provided.
    # Find the REAL <div class="slides-offset"> — it can appear in chrome.html's
    # comment header text, so we take the LAST occurrence (the real opening tag).
    if chrome_html:
        positions = [m.start() for m in re.finditer(r'<div class="slides-offset">', out)]
        if positions:
            chrome_end = positions[-1]
            out = (
                out[:body_open.end()]
                + '\n' + chrome_html.rstrip() + '\n\n'
                + out[chrome_end:]
            )

    # 3) Inject fresh runtime <script> right before </body>
    body_close = re.search(r'</body>', out, re.IGNORECASE)
    injection = '\n<script>\n' + runtime_js + '\n</script>\n'
    return out[:body_close.start()] + injection + out[body_close.start():]


def migrate_one(src_path: Path, dst_dir: Path, runtime_js: str, chrome_html: str = '') -> bool:
    src_html = src_path.read_text(encoding='utf-8')
    try:
        out_html = swap_runtime(src_html, runtime_js, chrome_html=chrome_html)
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
    chrome_html = (root / 'runtime' / 'chrome.html').read_text(encoding='utf-8')

    if args.source:
        src_path = Path(args.source)
        preset_id = args.id or SKILL_FILENAME_TO_ID.get(src_path.stem) or src_path.stem
        dst = root / 'presets' / preset_id
        ok = migrate_one(src_path, dst, runtime_js, chrome_html=chrome_html)
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
        if migrate_one(src, dst, runtime_js, chrome_html=chrome_html):
            ok += 1
        else:
            fail += 1
    print(f'\nDone — {ok} migrated, {fail} failed/skipped')
    sys.exit(0 if fail == 0 else 1)


if __name__ == '__main__':
    main()
