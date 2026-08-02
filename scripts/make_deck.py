#!/usr/bin/env python3
"""Build an editable deck from your design and your content.

Two inputs, neither of which is a template from this repo:

  --design    where the look comes from — a tokens .json, a .css with a :root
              block, or a design.md that names its colours and fonts in prose.
              Omit it and the deck inherits the browser's defaults, which still
              works: the runtime falls back on every token it reads.
  --content   what the deck says — markdown, one slide per heading.

The output conforms to CONTRACT.md, so it opens as a deck, presses E into an
editor, and exports as a single self-contained file.

    make_deck.py --content outline.md --design brand.md --output deck.html

Content format — deliberately the markdown an agent would write anyway:

    # Deck title              a title slide
    > kicker line             optional, above the title
    A subtitle paragraph.     optional, below it

    ## Slide heading          a content slide
    > kicker line
    - a bullet
    - another bullet
    chart: Q1 12, Q2 18, Q3 9 optional, draws a bar chart on the slide
"""

from __future__ import annotations

import argparse
import html as html_mod
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from port_to_editable import inject_body_wrappers, inject_css, load_parts  # noqa: E402

HEX_RE = re.compile(r'#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b')
ROOT_VAR_RE = re.compile(r'(--[a-z0-9-]+)\s*:\s*([^;}]+)', re.IGNORECASE)
FONT_NAME_RE = re.compile(
    r"font(?:-family)?\s*[:=]?\s*[\"']?([A-Z][A-Za-z0-9 ]{2,30}?)[\"']?\s*(?:,|;|$)",
    re.MULTILINE,
)

# Everything the runtime reads, with a sane default so a deck is never broken
# by a design source that simply does not mention one of them.
DEFAULTS = {
    '--font-body': 'system-ui, -apple-system, "Segoe UI", sans-serif',
    '--font-display': 'Georgia, "Times New Roman", serif',
    '--font-mono': 'ui-monospace, SFMono-Regular, Menlo, monospace',
    '--text-primary': '#14171c',
    '--text-secondary': '#5b6472',
    '--slide-bg': '#ffffff',
    '--deck-chrome-accent': '#2f5aff',
    '--deck-chrome-border': 'rgba(0,0,0,0.16)',
    '--deck-chrome-surface': '#ffffff',
    '--deck-chrome-text': '#14171c',
    '--deck-chrome-muted': '#6b7280',
    '--body-size': '20px',
    '--small-size': '14px',
    '--title-size': 'clamp(38px, 6vw, 84px)',
    '--slide-padding': '6%',
}


# --------------------------------------------------------------------------
# design


def tokens_from_json(text: str) -> dict:
    """Accept either a flat {"--x": "y"} map or a nested {"colors": {...}} one."""
    data = json.loads(text)
    out = {}

    def walk(node, prefix=''):
        if isinstance(node, dict):
            for k, v in node.items():
                if isinstance(v, (dict, list)):
                    walk(v, prefix)
                elif str(k).startswith('--'):
                    out[str(k)] = str(v)
                else:
                    out['--' + re.sub(r'[^a-z0-9]+', '-', f'{prefix}{k}'.lower()).strip('-')] = str(v)

    walk(data)
    return out


def tokens_from_css(text: str) -> dict:
    block = re.search(r':root\s*\{(.*?)\}', text, re.DOTALL)
    scope = block.group(1) if block else text
    return {m.group(1): m.group(2).strip() for m in ROOT_VAR_RE.finditer(scope)}


def tokens_from_markdown(text: str) -> dict:
    """Best-effort read of a design.md: the colours and fonts it names.

    A design.md is prose, so this is a guess, not a parse. Anything it gets
    wrong is one edit away in the deck — and everything it misses falls back.
    """
    out = {}
    explicit = {m.group(1): m.group(2).strip() for m in ROOT_VAR_RE.finditer(text)}
    out.update(explicit)

    colours = [c.lower() for c in HEX_RE.findall(text)]
    seen = list(dict.fromkeys(colours))
    if seen:
        # Darkest reads as ink, lightest as paper, the most saturated as accent.
        def lum(h):
            h = h.lstrip('#')
            if len(h) == 3:
                h = ''.join(c * 2 for c in h)
            r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
            return 0.2126 * r + 0.7152 * g + 0.0722 * b

        def sat(h):
            h = h.lstrip('#')
            if len(h) == 3:
                h = ''.join(c * 2 for c in h)
            r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
            return max(r, g, b) - min(r, g, b)

        by_lum = sorted(seen, key=lum)
        out.setdefault('--text-primary', by_lum[0])
        out.setdefault('--slide-bg', by_lum[-1])
        out.setdefault('--deck-chrome-accent', max(seen, key=sat))

    fonts = [f.strip() for f in FONT_NAME_RE.findall(text)]
    fonts = [f for f in dict.fromkeys(fonts) if f.lower() not in {'family', 'size', 'weight'}]
    if fonts:
        out.setdefault('--font-display', f'"{fonts[0]}", serif')
        out.setdefault('--font-body', f'"{fonts[1 if len(fonts) > 1 else 0]}", sans-serif')
    return out


def load_tokens(path: Path | None) -> tuple[dict, str]:
    tokens = dict(DEFAULTS)
    if path is None:
        return tokens, 'defaults only'
    text = path.read_text(encoding='utf-8')
    suffix = path.suffix.lower()
    if suffix == '.json':
        found = tokens_from_json(text)
    elif suffix == '.css':
        found = tokens_from_css(text)
    else:
        found = tokens_from_markdown(text)
    tokens.update({k: v for k, v in found.items() if v})
    return tokens, f'{len(found)} from {path.name}'


# --------------------------------------------------------------------------
# content


def parse_content(text: str) -> list[dict]:
    slides: list[dict] = []
    current: dict | None = None

    for raw in text.splitlines():
        line = raw.rstrip()
        stripped = line.strip()
        if not stripped:
            continue

        heading = re.match(r'^(#{1,2})\s+(.*)$', stripped)
        if heading:
            current = {
                'title': heading.group(2).strip(),
                'cover': len(heading.group(1)) == 1,
                'kicker': '', 'subtitle': '', 'bullets': [], 'chart': '',
            }
            slides.append(current)
            continue
        if current is None:
            continue

        if stripped.startswith('>'):
            current['kicker'] = stripped.lstrip('> ').strip()
        elif stripped.startswith(('- ', '* ')):
            current['bullets'].append(stripped[2:].strip())
        elif stripped.lower().startswith('chart:'):
            current['chart'] = stripped.split(':', 1)[1].strip()
        elif not current['subtitle']:
            current['subtitle'] = stripped
        else:
            current['subtitle'] += ' ' + stripped

    return slides


# --------------------------------------------------------------------------
# rendering


def obj(oid: str, kind: str, geom: str, inner: str, role: str = '', extra: str = '') -> str:
    role_attr = f' data-role="{role}"' if role else ''
    return (
        f'      <div class="slide-object" data-slide-object data-oid="{oid}" '
        f'data-object-type="{kind}"{role_attr}{extra} style="{geom}">\n'
        f'        {inner}\n'
        f'      </div>\n'
    )


def text_obj(oid: str, geom: str, body: str, role: str, style: str, fx: str = '') -> str:
    inner = f'<div class="slide-object-text" contenteditable="true" style="{style}">{body}</div>'
    return obj(oid, 'text', geom, inner, role, fx)


def render_slide(slide: dict, i: int) -> str:
    e = html_mod.escape
    out = [f'  <section class="slide{" visible" if i == 0 else ""}" id="slide-{i}">\n',
           '    <div class="slide-edit-layer">\n']

    kicker_style = ('font-family:var(--font-mono);font-size:var(--small-size);'
                    'letter-spacing:.14em;text-transform:uppercase;'
                    'color:var(--deck-chrome-accent);')
    title_style = ('font-family:var(--font-display);font-size:var(--title-size);'
                   'line-height:1.02;color:var(--text-primary);')
    body_style = ('font-family:var(--font-body);font-size:var(--body-size);'
                  'line-height:1.55;color:var(--text-primary);')

    if slide['kicker']:
        out.append(text_obj(f's{i}-kicker', 'left:6%;top:9%;width:60%;height:5%;',
                            e(slide['kicker']), 'kicker', kicker_style,
                            ' data-fx-enter="fade" data-fx-order="0"'))

    if slide['cover']:
        out.append(text_obj(f's{i}-title', 'left:6%;top:30%;width:84%;height:26%;',
                            e(slide['title']), 'title', title_style,
                            ' data-fx-enter="fade-up" data-fx-order="1"'))
        if slide['subtitle']:
            out.append(text_obj(f's{i}-sub', 'left:6%;top:62%;width:64%;height:14%;',
                                e(slide['subtitle']), 'subtitle', body_style,
                                ' data-fx-enter="fade-up" data-fx-order="2"'))
    else:
        out.append(text_obj(f's{i}-title', 'left:6%;top:16%;width:86%;height:16%;',
                            e(slide['title']), 'title',
                            title_style.replace('var(--title-size)', 'clamp(28px,4vw,52px)'),
                            ' data-fx-enter="fade-up" data-fx-order="1"'))
        top = 38
        if slide['subtitle']:
            out.append(text_obj(f's{i}-sub', f'left:6%;top:{top}%;width:70%;height:10%;',
                                e(slide['subtitle']), 'subtitle', body_style,
                                ' data-fx-enter="fade-up" data-fx-order="2"'))
            top += 12
        if slide['bullets']:
            items = ''.join(f'<li style="margin:0 0 .5em">{e(b)}</li>' for b in slide['bullets'])
            height = min(46, 8 + 7 * len(slide['bullets']))
            out.append(text_obj(f's{i}-body', f'left:6%;top:{top}%;width:{"52" if slide["chart"] else "86"}%;height:{height}%;',
                                f'<ul style="margin:0;padding-left:1.1em">{items}</ul>', 'body', body_style,
                                ' data-fx-enter="fade-up" data-fx-order="3"'))
        if slide['chart']:
            left = 62 if slide['bullets'] else 6
            width = 32 if slide['bullets'] else 60
            out.append(obj(
                f's{i}-chart', 'chart', f'left:{left}%;top:{top}%;width:{width}%;height:42%;',
                '<div class="slide-object-chart" style="width:100%;height:100%;pointer-events:none;">'
                '<svg viewBox="0 0 100 70" preserveAspectRatio="none" width="100%" height="100%" '
                'style="display:block;overflow:visible;"></svg></div>',
                extra=f' data-chart="bar" data-chart-data="{e(slide["chart"], quote=True)}"'
                      ' data-fx-enter="fade" data-fx-order="4"',
            ))

    # Page number, as a live field rather than a typed digit.
    out.append(text_obj(
        f's{i}-page', 'left:88%;top:90%;width:8%;height:5%;',
        '<span data-field="page">1</span> / <span data-field="pages">1</span>',
        '', kicker_style.replace('var(--deck-chrome-accent)', 'var(--deck-chrome-muted)')))

    out.append('    </div>\n  </section>\n')
    return ''.join(out)


BASE_CSS = """
:root {
%(tokens)s
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--slide-bg); color: var(--text-primary); }
section.slide {
  position: relative; width: 100vw; height: 100vh; overflow: hidden;
  background: var(--slide-bg);
}
.slide-edit-layer { position: absolute; inset: 0; }
.slide-object-text ul { list-style: disc; }
"""


GENERIC_FAMILIES = {
    'serif', 'sans-serif', 'monospace', 'system-ui', 'ui-monospace', 'cursive',
    'fantasy', 'inherit', 'initial', '-apple-system', 'blinkmacsystemfont',
}


def font_link(tokens: dict) -> str:
    """Load the families the tokens name, so a deck does not silently fall back.

    Naming a font in a token and never fetching it is the quiet failure here: the
    deck renders in something else and looks nothing like the design it was
    given. Google Fonts covers most of what a design system names; a family it
    does not have simply is not returned, and the local fallback still applies.
    """
    families = []
    for key in ('--font-display', '--font-body', '--font-mono'):
        first = tokens.get(key, '').split(',')[0].strip().strip('"\'')
        if first and first.lower() not in GENERIC_FAMILIES and first not in families:
            families.append(first)
    if not families:
        return ''
    spec = '&'.join('family=' + f.replace(' ', '+') + ':wght@400;500;700;900' for f in families)
    return (
        '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
        f'<link rel="stylesheet" href="https://fonts.googleapis.com/css2?{spec}&display=swap">\n'
    )


def build(tokens: dict, slides: list[dict], title: str, deck_id: str) -> str:
    token_lines = '\n'.join(f'  {k}: {v};' for k, v in sorted(tokens.items()))
    body = ''.join(render_slide(s, i) for i, s in enumerate(slides))
    return (
        '<!DOCTYPE html>\n'
        f'<html lang="en" data-deck-id="{deck_id}">\n<head>\n'
        '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        f'<title>{html_mod.escape(title)}</title>\n'
        + font_link(tokens) +
        '<style>\n' + BASE_CSS % {'tokens': token_lines} + '</style>\n'
        '</head>\n<body>\n' + body + '</body>\n</html>\n'
    )


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--content', required=True, help='markdown outline')
    ap.add_argument('--design', help='tokens .json, a .css with :root, or a design.md')
    ap.add_argument('--output', required=True)
    ap.add_argument('--title', help='deck title; defaults to the first heading')
    ap.add_argument('--runtime', default=str(Path(__file__).resolve().parent.parent / 'runtime'))
    args = ap.parse_args()

    slides = parse_content(Path(args.content).read_text(encoding='utf-8'))
    if not slides:
        print('no slides found — content needs at least one "# " or "## " heading', file=sys.stderr)
        return 2

    tokens, provenance = load_tokens(Path(args.design) if args.design else None)
    title = args.title or slides[0]['title']
    deck_id = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-') or 'deck'

    html = build(tokens, slides, title, deck_id)

    parts = load_parts(Path(args.runtime))
    html, css_status = inject_css(html, parts['viewport_css'], parts['chrome_css'])
    html, body_status = inject_body_wrappers(html, parts['chrome_html'], parts['runtime_js'])
    for status in (css_status, body_status):
        if str(status).startswith('failed'):
            print(f'runtime injection failed: {status}', file=sys.stderr)
            return 1

    Path(args.output).write_text(html, encoding='utf-8')
    objects = html.count('data-slide-object')
    print(f'{args.output}: {len(slides)} slides, {objects} objects, tokens {provenance}')
    print('Open it and press E to edit.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
