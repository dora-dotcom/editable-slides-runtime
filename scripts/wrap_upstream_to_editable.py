"""Wrap an upstream zarazhangrui template HTML into our editable runtime contract,
preserving 100% of the original visual design.

Strategy: each upstream `<div class="slide slide-N active">` becomes one
`<section class="slide" id="slide-N">` containing ONE big slide-object that
wraps the entire upstream slide markup. The user keeps:
- inline text editing (contentEditable on text after entering edit mode)
- Pages sidebar (reorder / delete / add slides)
- per-slide background replace
- font size A+/A−
- Save / Export HTML / Export PDF

What the user gives up: per-element drag-and-drop repositioning. This is the
right trade for a template library — preserves visual fidelity, edits stay
within designed layout.

Namespace collisions: upstream's `.slide` class would collide with our
runtime's `.slide`. We rename upstream's bare `.slide` → `.zara-slide`
both in CSS and HTML class attributes (only the bare token, not `.slide-inner`
or `.slide-header`).

Usage:
    python3 scripts/wrap_upstream_to_editable.py --id capsule
    python3 scripts/wrap_upstream_to_editable.py --id capsule --upstream /tmp/capsule.html
"""

import argparse
import pathlib
import re
import sys
import urllib.request
from bs4 import BeautifulSoup, NavigableString

REPO = pathlib.Path.home() / 'Desktop/Projects/editable-slide-templates'
RT   = REPO / 'runtime'
CACHE = REPO / '.audit-cache/zarazhang-html'
UPSTREAM_URL = 'https://raw.githubusercontent.com/zarazhangrui/beautiful-html-templates/main/templates/{id}/template.html'


def load_runtime():
    return {
        'viewport':    (RT / 'viewport-base.css').read_text(),
        'chrome_css':  (RT / 'chrome.css').read_text(),
        'chrome_html': (RT / 'chrome.html').read_text(),
        'runtime_js':  (RT / 'runtime.js').read_text(),
    }


def fetch_upstream(template_id, override=None):
    if override:
        return pathlib.Path(override).read_text()
    cache_path = CACHE / f'{template_id}.html'
    if cache_path.exists():
        return cache_path.read_text()
    url = UPSTREAM_URL.format(id=template_id)
    print(f'fetching {url}')
    with urllib.request.urlopen(url) as r:
        body = r.read().decode('utf-8')
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(body)
    return body


def rename_bare_slide(css_or_html_text, is_css=False):
    """Rename bare `slide` token (not slide-inner, slide-header) to zara-slide."""
    if is_css:
        # In CSS, `.slide` followed by non-`-` char or end → rename
        return re.sub(r'\.slide\b(?!-)', '.zara-slide', css_or_html_text)
    # In HTML class attributes: replace "slide" when it appears as a class
    # token. Match: " slide ", " slide\"", "\"slide ", "\"slide\""
    def repl(m):
        return m.group(0).replace('slide', 'zara-slide')
    return re.sub(r'(?<=["\s])slide(?=["\s])', 'zara-slide', css_or_html_text)


def collect_upstream_css(soup):
    """Gather all <style> inline CSS + <link rel=stylesheet> hrefs from <head>."""
    inline = []
    fonts_links = []
    for tag in soup.head.find_all(['style', 'link', 'meta', 'title']):
        if tag.name == 'style':
            inline.append(tag.string or '')
        elif tag.name == 'link':
            # keep font / icon stylesheets
            href = tag.get('href', '')
            if 'font' in href.lower() or tag.get('rel') == ['stylesheet']:
                fonts_links.append(str(tag))
        # title / meta — we'll regenerate
    return inline, fonts_links


def build_wrapped_slide(slide_div, idx):
    """Take an upstream <div class="zara-slide ..."> and return a <section class="slide">."""
    # Strip any 'active' state and runtime-required classes
    classes = slide_div.get('class', [])
    classes = [c for c in classes if c not in ('active',)]
    slide_div['class'] = classes
    # Remove navigation-related attrs the upstream JS uses
    slide_div.attrs.pop('data-slide', None)

    inner_html = slide_div.decode_contents()

    sid = f'slide-{idx}'
    oid = f's{idx}-body'
    section_html = f'''<section class="slide" id="{sid}">
  <div class="slide-bg-container" style="position:absolute;inset:0;background-size:cover;background-position:center;background-repeat:no-repeat;pointer-events:none;z-index:0;"></div>
  <div class="slide-edit-layer">
    <div class="slide-object" data-slide-object data-oid="{oid}" data-object-type="text" style="left:0;top:0;width:100%;height:100%;padding:0;border-radius:0;">
      <button type="button" class="slide-object-move" aria-label="Move">⠿</button>
      <button type="button" class="slide-object-resize" aria-label="Resize"></button>
      <div class="slide-object-text" contenteditable="false">{slide_div_to_inner(slide_div)}</div>
    </div>
  </div>
  <div class="slide-bg-replace-anchor"><button type="button" class="slide-bg-replace-btn" data-bg-target="#{sid} .slide-bg-container">📷 Replace background</button></div>
</section>'''
    return section_html


def slide_div_to_inner(slide_div):
    """Re-emit the upstream slide div as the wrapped inner. Classes already
    renamed (zara-slide). Strip data-slide attr."""
    # Render as: <div class="...">{children}</div>
    return str(slide_div)


def build_template(template_id, args=None):
    rt = load_runtime()
    raw = fetch_upstream(template_id, override=(args.upstream if args else None))

    # Two passes of rename — once on CSS (inside <style>), once on HTML body
    # We do it on the full text so it covers both
    raw = rename_bare_slide(raw, is_css=False)  # html class= rename
    raw = rename_bare_slide(raw, is_css=True)   # css .slide rename
    soup = BeautifulSoup(raw, 'lxml')

    # Title (preserve upstream's)
    upstream_title = (soup.title.string if soup.title and soup.title.string else template_id).strip()

    # Collect head pieces
    inline_styles, font_links = collect_upstream_css(soup)
    upstream_inline_css = '\n\n'.join(inline_styles)
    fonts_block = '\n'.join(font_links)

    # Find slides — they're divs with class containing 'zara-slide' (bare, was 'slide')
    body = soup.body
    if not body:
        raise SystemExit(f'no <body> found in upstream')
    slide_divs = []
    for div in body.find_all('div', class_='zara-slide'):
        slide_divs.append(div)
    if not slide_divs:
        raise SystemExit(f'no slides found (looked for class="zara-slide")')

    print(f'found {len(slide_divs)} slides in upstream {template_id}')

    # Build new slides HTML (slide-0, slide-1, ...)
    new_slides_html = '\n\n'.join(
        build_wrapped_slide(div, i) for i, div in enumerate(slide_divs)
    )

    # Assemble final HTML
    deck_id = template_id
    final = f'''<!DOCTYPE html>
<html lang="en" data-deck-id="{deck_id}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{upstream_title} — Editable Slide Template</title>
  {fonts_block}
  <style>
/* === viewport-base.css (our editable runtime) === */
{rt['viewport']}

/* === Upstream {template_id} CSS (auto-renamed: .slide → .zara-slide) === */
{upstream_inline_css}

/* === Deck chrome CSS === */
{rt['chrome_css']}

/* === Bridge: the wrapped slide-object must let the upstream slide fill it === */
.slide-object[data-oid$="-body"] {{
  padding: 0;
  border-radius: 0;
}}
.slide-object[data-oid$="-body"] .slide-object-text {{
  width: 100%;
  height: 100%;
  display: block;
}}
/* Upstream uses absolute-positioned `.zara-slide` with opacity:0 + .active to
   toggle which single slide is visible. In our scroll-snap deck every slide
   has its own viewport, so neutralize the absolute stacking + reveal toggle. */
.slide-object[data-oid$="-body"] .slide-object-text > .zara-slide {{
  position: relative !important;
  inset: auto !important;
  width: 100% !important;
  height: 100% !important;
  opacity: 1 !important;
  pointer-events: auto !important;
  transition: none !important;
}}
/* Upstream nav dots / scroll-progress / filmstrip controls are global chrome
   that don't belong inside every wrapped slide. Hide them — our chrome
   handles navigation. */
.slide-object[data-oid$="-body"] .nav-dots,
.slide-object[data-oid$="-body"] .progress-bar,
.slide-object[data-oid$="-body"] .progress-container {{
  display: none !important;
}}
  </style>
</head>
<body>
{rt['chrome_html']}

<div class="slides-offset">

{new_slides_html}

</div>

<script>
{rt['runtime_js']}
</script>
</body>
</html>
'''

    out = REPO / 'presets' / template_id / 'template.html'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(final)
    print(f'wrote {out}  ({len(final):,} bytes)')
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--id', required=True, help='preset id (e.g. capsule)')
    ap.add_argument('--upstream', help='override upstream HTML path (default: fetch from github)')
    args = ap.parse_args()
    build_template(args.id, args)


if __name__ == '__main__':
    main()
