#!/usr/bin/env python3
"""Port an external HTML slide template to the frontend-slides-editable runtime.

Mechanical only. Does:
  1. Strip existing <script> blocks
  2. Inject viewport-base.css + deck chrome CSS into <style>
  3. Inject deck chrome HTML right after <body>
  4. Wrap remaining body content in <div class="slides-offset">
  5. Inject editable runtime <script> before </body>
  6. Detect CSS class / ID collisions between source and injected chrome — warn

Does NOT do (manual after running):
  - Rename <div class="slide"> → <section class="slide" id="slide-N">
  - Wrap movable content as [data-slide-object][data-oid] inside .slide-edit-layer
  - Add per-preset --deck-chrome-* tokens to :root (light vs dark contrast set)
  - Resolve any CSS class collisions (the script only warns)

Usage:
    port_to_editable.py --source IN.html --output OUT.html [--runtime DIR]
"""

import argparse
import re
import sys
from pathlib import Path


# Chrome class/ID names that the runtime depends on. If the source CSS or HTML
# already uses these, the human needs to disambiguate after porting.
CHROME_CLASSES = [
    'progress-bar', 'nav-dots', 'deck-left-hover-anchor', 'deck-left-row',
    'deck-edit-chrome', 'edit-toggle', 'sidebar-pages-toggle', 'deck-btn-save',
    'deck-btn-done', 'slide-sidebar', 'filmstrip-list', 'filmstrip-item',
    'filmstrip-thumb-host', 'filmstrip-num', 'filmstrip-actions',
    'rte-toolbar', 'rte-toolbar-group', 'rte-toolbar-meta',
    'slide-edit-layer', 'slide-object', 'slide-object-move',
    'slide-object-resize', 'slide-object-text', 'slide-object-graphic',
    'snap-line-v', 'snap-line-h', 'slides-offset',
]
CHROME_IDS = [
    'deckLeftHover', 'editToggle', 'pagesToggle', 'btnSave', 'btnUndo',
    'btnRedo', 'btnDoneEdit', 'deckEditChrome', 'deckImgInput', 'deckBgInput',
    'progressBar', 'navDots', 'slideSidebar', 'filmstripList',
    'btnAddImage', 'btnExport', 'btnExportPdf', 'rteToolbar',
]


def load_parts(runtime_dir: Path) -> dict:
    """Read the four runtime snapshot files."""
    return {
        'viewport_css': (runtime_dir / 'viewport-base.css').read_text(encoding='utf-8'),
        'chrome_css':   (runtime_dir / 'chrome.css').read_text(encoding='utf-8'),
        'chrome_html':  (runtime_dir / 'chrome.html').read_text(encoding='utf-8'),
        'runtime_js':   (runtime_dir / 'runtime.js').read_text(encoding='utf-8'),
    }


def strip_scripts(html: str):
    """Remove every <script>...</script> block (the upstream's nav runtime)."""
    pat = re.compile(r'<script\b[^>]*>.*?</script>', re.DOTALL | re.IGNORECASE)
    n = len(pat.findall(html))
    return pat.sub('', html), n


def inject_css(html: str, viewport_css: str, chrome_css: str):
    """Append viewport-base + chrome CSS into the last <style> block, or create one."""
    payload = (
        '\n\n/* === viewport-base.css (injected by port_to_editable.py) === */\n'
        + viewport_css
        + '\n\n/* === deck chrome CSS (injected by port_to_editable.py) === */\n'
        + chrome_css
        + '\n'
    )
    # Inject before the LAST </style> so it overrides earlier preset rules
    matches = list(re.finditer(r'</style>', html, re.IGNORECASE))
    if matches:
        idx = matches[-1].start()
        return html[:idx] + payload + html[idx:], 'appended-to-style'
    # No <style> — add a new one inside <head>
    head_close = re.search(r'</head>', html, re.IGNORECASE)
    if head_close:
        idx = head_close.start()
        return html[:idx] + f'<style>{payload}</style>\n' + html[idx:], 'created-new-style'
    return html, 'failed-no-head'


def inject_body_wrappers(html: str, chrome_html: str, runtime_js: str):
    """Place chrome HTML + slides-offset wrapper + runtime <script> inside <body>."""
    body_open = re.search(r'<body\b[^>]*>', html, re.IGNORECASE)
    body_close = re.search(r'</body>', html, re.IGNORECASE)
    if not body_open or not body_close:
        return html, 'failed-no-body'

    open_end = body_open.end()
    close_start = body_close.start()
    inner = html[open_end:close_start]

    new_inner = (
        '\n<!-- BEGIN injected deck chrome -->\n'
        + chrome_html.rstrip()
        + '\n<!-- END injected deck chrome -->\n\n'
        + '<div class="slides-offset">\n'
        + inner.lstrip('\n')
        + '\n</div><!-- /.slides-offset -->\n\n'
        + '<script>\n'
        + runtime_js
        + '\n</script>\n'
    )
    return html[:open_end] + new_inner + html[close_start:], 'ok'


def detect_collisions(src_html: str):
    """Find chrome class/ID names that already appear in the source."""
    cls_hits = []
    for cls in CHROME_CLASSES:
        # Match in class="..." attributes or CSS selectors
        pat_attr = re.compile(r'class\s*=\s*["\'][^"\']*\b' + re.escape(cls) + r'\b[^"\']*["\']', re.IGNORECASE)
        pat_css = re.compile(r'\.' + re.escape(cls) + r'\b')
        if pat_attr.search(src_html) or pat_css.search(src_html):
            cls_hits.append(cls)
    id_hits = []
    for ident in CHROME_IDS:
        pat_attr = re.compile(r'\bid\s*=\s*["\']' + re.escape(ident) + r'["\']', re.IGNORECASE)
        pat_css = re.compile(r'#' + re.escape(ident) + r'\b')
        if pat_attr.search(src_html) or pat_css.search(src_html):
            id_hits.append(ident)
    return cls_hits, id_hits


def detect_slide_markers(html: str):
    """Count <section class='slide'> vs <div class='slide'> for reporting."""
    section_slides = re.findall(
        r'<section\b[^>]*class\s*=\s*["\'][^"\']*\bslide\b[^"\']*["\']',
        html, re.IGNORECASE,
    )
    div_slides = re.findall(
        r'<div\b[^>]*class\s*=\s*["\'][^"\']*\bslide\b[^"\']*["\']',
        html, re.IGNORECASE,
    )
    return len(section_slides), len(div_slides)


def main():
    p = argparse.ArgumentParser(
        description='Port external HTML slide template to the editable runtime.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    p.add_argument('--source', required=True, help='Input HTML file')
    p.add_argument('--output', required=True, help='Output HTML file')
    p.add_argument(
        '--runtime',
        default=str(Path(__file__).parent.parent / 'runtime'),
        help='Directory containing chrome.css, chrome.html, runtime.js, viewport-base.css',
    )
    args = p.parse_args()

    src_path = Path(args.source)
    out_path = Path(args.output)
    rt_path = Path(args.runtime)

    if not src_path.is_file():
        sys.exit(f'ERROR: source not found: {src_path}')
    if not rt_path.is_dir():
        sys.exit(f'ERROR: runtime directory not found: {rt_path}')

    parts = load_parts(rt_path)
    src_original = src_path.read_text(encoding='utf-8')

    # Detect collisions BEFORE we inject anything
    cls_hits, id_hits = detect_collisions(src_original)
    section_n, div_n = detect_slide_markers(src_original)

    out = src_original
    out, n_scripts = strip_scripts(out)
    out, css_status = inject_css(out, parts['viewport_css'], parts['chrome_css'])
    out, body_status = inject_body_wrappers(out, parts['chrome_html'], parts['runtime_js'])

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(out, encoding='utf-8')

    # === Report ===
    print(f'PORTED: {src_path} -> {out_path}')
    print(f'  Scripts stripped:       {n_scripts}')
    print(f'  CSS injection:          {css_status}')
    print(f'  Body wrapping:          {body_status}')
    print(f'  Slides found:           section={section_n}  div={div_n}')
    if cls_hits:
        print(f'  CSS class collisions:   {", ".join(cls_hits)}')
    if id_hits:
        print(f'  ID collisions:          {", ".join(id_hits)}')
    print()
    print('MANUAL TODOs:')
    if div_n > 0:
        print(f'  - Rename {div_n} <div class="slide"> to <section class="slide" id="slide-N">')
    print('  - Wrap movable copy as [data-slide-object][data-oid][data-object-type] inside .slide-edit-layer')
    print('  - Add deck chrome tokens to :root — see frontend-slides-editable/STYLE_PRESETS.md')
    if cls_hits or id_hits:
        print('  - Resolve CSS/ID collisions listed above (rename source classes to avoid conflict)')
    print('  - Open in browser, press E, verify drag/select/PDF export')


if __name__ == '__main__':
    main()
