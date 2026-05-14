#!/usr/bin/env python3
"""Generate screenshot.png (1280x720) and thumb.png (320x180) for each preset.

Uses headless Chrome to render template.html, captures slide 0, downscales
for the list thumbnail. Run after editing a template:

    snapshot_screenshots.py --preset bold-poster
    snapshot_screenshots.py --all

Requires: Google Chrome (or Chromium) and ImageMagick `convert` OR macOS `sips`.
"""

import argparse
import shutil
import subprocess
import sys
import time
from pathlib import Path


CHROME_CANDIDATES = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    'google-chrome',
    'chromium',
    'chromium-browser',
]


def find_chrome() -> str:
    for c in CHROME_CANDIDATES:
        if Path(c).is_file():
            return c
        which = shutil.which(c)
        if which:
            return which
    sys.exit('ERROR: could not find Chrome/Chromium. Install Google Chrome or set PATH.')


def find_downscaler() -> tuple[str, str]:
    """Return (tool_name, command_path)."""
    if shutil.which('sips'):
        return ('sips', shutil.which('sips'))
    if shutil.which('convert'):
        return ('convert', shutil.which('convert'))
    sys.exit('ERROR: need sips (macOS) or ImageMagick convert for thumbnail downscaling.')


def screenshot(chrome: str, html_path: Path, out_path: Path,
               width: int = 1280, height: int = 720, wait_ms: int = 2500) -> bool:
    """Run headless Chrome to capture html_path → out_path. Returns success."""
    file_url = html_path.resolve().as_uri()
    cmd = [
        chrome,
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--hide-scrollbars',
        '--default-background-color=00000000',
        f'--window-size={width},{height}',
        f'--virtual-time-budget={wait_ms}',
        f'--screenshot={out_path}',
        file_url,
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    except subprocess.TimeoutExpired:
        print(f'  TIMEOUT capturing {html_path}', file=sys.stderr)
        return False
    if not out_path.is_file():
        print(f'  FAIL capturing {html_path}', file=sys.stderr)
        if result.stderr:
            print(result.stderr[-500:], file=sys.stderr)
        return False
    return True


def downscale(tool: str, cmd_path: str, src: Path, dst: Path, w: int, h: int) -> bool:
    if tool == 'sips':
        # sips -z height width — note arg order
        r = subprocess.run(
            [cmd_path, '-z', str(h), str(w), str(src), '--out', str(dst)],
            capture_output=True, text=True,
        )
    else:  # convert (ImageMagick)
        r = subprocess.run(
            [cmd_path, str(src), '-resize', f'{w}x{h}', str(dst)],
            capture_output=True, text=True,
        )
    return dst.is_file() and r.returncode == 0


def process_preset(preset_dir: Path, chrome: str, tool: str, cmd_path: str) -> bool:
    template = preset_dir / 'template.html'
    if not template.is_file():
        print(f'  SKIP {preset_dir.name}: no template.html')
        return False
    hero = preset_dir / 'screenshot.png'
    thumb = preset_dir / 'thumb.png'

    print(f'  {preset_dir.name} -> screenshot.png', end=' ', flush=True)
    if not screenshot(chrome, template, hero, 1280, 720):
        return False
    print('OK', end='  ', flush=True)

    print('thumb.png', end=' ', flush=True)
    if not downscale(tool, cmd_path, hero, thumb, 320, 180):
        print('FAIL')
        return False
    print('OK')
    return True


def main():
    p = argparse.ArgumentParser(description='Generate screenshot + thumb for presets.')
    group = p.add_mutually_exclusive_group(required=True)
    group.add_argument('--preset', help='Single preset id (folder name under presets/)')
    group.add_argument('--all', action='store_true', help='Process every preset')
    p.add_argument('--root', default=str(Path(__file__).parent.parent),
                   help='Repo root (default: parent of scripts/)')
    args = p.parse_args()

    root = Path(args.root)
    presets_dir = root / 'presets'
    if not presets_dir.is_dir():
        sys.exit(f'ERROR: {presets_dir} not found')

    if args.preset:
        target_dirs = [presets_dir / args.preset]
        if not target_dirs[0].is_dir():
            sys.exit(f'ERROR: preset folder not found: {target_dirs[0]}')
    else:
        target_dirs = sorted(
            d for d in presets_dir.iterdir()
            if d.is_dir() and (d / 'template.html').is_file()
        )
        if not target_dirs:
            sys.exit('No presets with template.html found.')

    chrome = find_chrome()
    tool, cmd_path = find_downscaler()
    print(f'Chrome:     {chrome}')
    print(f'Downscaler: {tool} ({cmd_path})')
    print(f'Presets:    {len(target_dirs)}')
    print()

    ok, fail = 0, 0
    t0 = time.time()
    for pd in target_dirs:
        if process_preset(pd, chrome, tool, cmd_path):
            ok += 1
        else:
            fail += 1
    dt = time.time() - t0
    print()
    print(f'Done in {dt:.1f}s — {ok} ok, {fail} failed')
    sys.exit(0 if fail == 0 else 1)


if __name__ == '__main__':
    main()
