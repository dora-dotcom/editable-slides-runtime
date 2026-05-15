#!/usr/bin/env python3
"""Extract visual style from a URL and generate a draft editable slide preset.

Pipeline:
  1. Fetch the URL HTML.
  2. Extract palette (hex colors), fonts (font-family + Google Fonts links),
     :root variables, and heading-size hints from the page's CSS / inline styles.
  3. Cluster colors and classify roles (paper / ink / accent / muted).
  4. Snapshot the URL via headless Chrome at 1280×720 as `_source.png` for reference.
  5. Synthesize a draft preset (template.html + preset.md + meta.json) under
     `presets/<id>/`, marked as `source.origin = "url:<url>"` so reviewers know
     it's auto-generated.

This is a STARTER draft — humans should review `_source.png` against `template.html`
and refine colors / typography / signature elements before publishing via
`scripts/snapshot_screenshots.py --preset <id>` and `scripts/generate_index.py`.

Usage:
  extract_style_from_url.py --url URL --id PRESET_ID [--name "Display Name"]
                            [--repo-root DIR]
"""

import argparse
import colorsys
import json
import re
import shutil
import subprocess
import sys
import urllib.request
from collections import Counter
from datetime import date
from pathlib import Path


CHROME_CANDIDATES = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    'google-chrome', 'chromium', 'chromium-browser',
]


# ─── Fetch ────────────────────────────────────────────────────────────────────

def fetch_html(url: str) -> str:
    """Fetch the URL HTML with a desktop User-Agent."""
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
                      'AppleWebKit/537.36 (KHTML, like Gecko) '
                      'Chrome/120.0.0.0 Safari/537.36'
    })
    with urllib.request.urlopen(req, timeout=20) as r:
        raw = r.read()
    # Best-effort encoding detection
    try:
        return raw.decode('utf-8')
    except UnicodeDecodeError:
        return raw.decode('utf-8', errors='replace')


# ─── Color utilities ──────────────────────────────────────────────────────────

HEX_RE = re.compile(r'#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b')
RGB_RE = re.compile(r'rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)')


def parse_hex(h: str):
    h = h.lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    if len(h) == 8:
        h = h[:6]
    try:
        return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
    except ValueError:
        return None


def rgb_to_hex(rgb):
    return '#{:02X}{:02X}{:02X}'.format(*rgb)


def luminance(rgb):
    """Perceived luminance 0..1."""
    r, g, b = (c / 255.0 for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def saturation(rgb):
    r, g, b = (c / 255.0 for c in rgb)
    _, s, _ = colorsys.rgb_to_hsv(r, g, b)
    return s


def color_distance(a, b):
    return sum((ai - bi) ** 2 for ai, bi in zip(a, b)) ** 0.5


def collect_colors(html: str):
    """Yield (rgb, weight) pairs from the HTML, weighted by occurrence."""
    counts = Counter()
    for m in HEX_RE.finditer(html):
        rgb = parse_hex(m.group(0))
        if rgb:
            counts[rgb] += 1
    for m in RGB_RE.finditer(html):
        try:
            r, g, bl = (int(float(m.group(i))) for i in (1, 2, 3))
            counts[(min(255, max(0, r)), min(255, max(0, g)), min(255, max(0, bl)))] += 1
        except ValueError:
            continue
    return counts


def cluster_colors(counts: Counter, min_distance: int = 32):
    """Deduplicate colors that are visually similar; keep the highest-weight one."""
    items = counts.most_common()
    kept = []
    for rgb, weight in items:
        if all(color_distance(rgb, k[0]) > min_distance for k in kept):
            kept.append((rgb, weight))
    return kept


def classify_palette(clustered):
    """Return dict of named tokens: paper / ink / accent / muted / extras."""
    if not clustered:
        return {'paper': (250, 250, 245), 'ink': (20, 20, 20), 'accent': (220, 60, 60)}

    by_lum = sorted(clustered, key=lambda x: luminance(x[0]))
    by_sat = sorted(clustered, key=lambda x: saturation(x[0]), reverse=True)

    paper = by_lum[-1][0]   # lightest
    ink = by_lum[0][0]      # darkest

    # Accent: most saturated that isn't paper or ink and is at least mid-saturated
    accent = None
    for rgb, _ in by_sat:
        if rgb == paper or rgb == ink:
            continue
        if saturation(rgb) > 0.3:
            accent = rgb
            break
    if accent is None and len(by_sat) > 0:
        accent = by_sat[0][0]

    # Muted: mid-luminance, lower saturation
    muted = None
    for rgb, _ in clustered:
        if rgb in (paper, ink, accent):
            continue
        lum = luminance(rgb)
        if 0.25 < lum < 0.75 and saturation(rgb) < 0.3:
            muted = rgb
            break

    tokens = {'paper': paper, 'ink': ink, 'accent': accent or (220, 60, 60)}
    if muted:
        tokens['muted'] = muted

    # Up to 3 extras for richer palettes
    extras = []
    used = set(tokens.values())
    for rgb, _ in clustered:
        if rgb in used: continue
        extras.append(rgb)
        used.add(rgb)
        if len(extras) >= 3:
            break
    for i, rgb in enumerate(extras, start=1):
        tokens[f'extra-{i}'] = rgb

    return tokens


# ─── Font extraction ──────────────────────────────────────────────────────────

GOOGLE_FONTS_RE = re.compile(
    r'fonts\.googleapis\.com/css2?\?family=([^"\'&]+)',
    re.IGNORECASE,
)
FONT_FAMILY_RE = re.compile(
    r'font-family\s*:\s*([^;{}"\']+)',
    re.IGNORECASE,
)


def extract_fonts(html: str):
    """Return (display_font, body_font, fonts_link_url)."""
    # Find Google Fonts URLs to reconstruct a fonts_link
    google_families = []
    fonts_link = ''
    for m in GOOGLE_FONTS_RE.finditer(html):
        family_blob = m.group(1)
        # family_blob is like "Inter:wght@400;700" or chained with &family=
        for chunk in family_blob.split('&family='):
            name = chunk.split(':')[0].replace('+', ' ').strip()
            if name and name not in google_families:
                google_families.append(name)

    # Try to find original full <link href="...fonts.googleapis.com/css..."> tag
    link_match = re.search(r'href=["\']([^"\']*fonts\.googleapis\.com/css2?[^"\']+)["\']', html)
    if link_match:
        fonts_link = link_match.group(1).replace('&amp;', '&')

    # Extract font-family declarations
    family_counts = Counter()
    for m in FONT_FAMILY_RE.finditer(html):
        decl = m.group(1).strip()
        # First family in the stack wins
        first = decl.split(',')[0].strip().strip('"\'').strip()
        if first and not first.startswith(('var(', 'inherit', 'initial', 'unset')):
            family_counts[first] += 1

    ranked = [name for name, _ in family_counts.most_common()]

    # Prefer Google-loaded families when available
    pool = []
    for f in ranked:
        if any(f.lower() == g.lower() for g in google_families):
            pool.append(f)
    for f in google_families:
        if f not in pool:
            pool.append(f)
    for f in ranked:
        if f not in pool:
            pool.append(f)

    display = pool[0] if pool else 'Inter'
    body = pool[1] if len(pool) > 1 else display

    if not fonts_link and google_families:
        # Construct a reasonable Google Fonts URL from extracted families
        families_param = '&'.join(
            'family=' + g.replace(' ', '+') + ':wght@400;500;600;700' for g in google_families[:3]
        )
        fonts_link = f'https://fonts.googleapis.com/css2?{families_param}&display=swap'

    return display, body, fonts_link


# ─── Heuristic classification ─────────────────────────────────────────────────

def guess_light_dark(paper_rgb):
    return 'light' if luminance(paper_rgb) >= 0.55 else 'dark'


def guess_vibe_mood_category(palette, display_font):
    """Best-effort classification. Reviewer will refine."""
    ink = palette.get('ink', (20, 20, 20))
    paper = palette.get('paper', (250, 250, 245))
    accent = palette.get('accent', (220, 60, 60))

    light_dark = guess_light_dark(paper)
    accent_sat = saturation(accent)
    paper_warm = paper[0] > paper[2] + 8

    serif_keywords = ['Serif', 'Garamond', 'Bodoni', 'Playfair', 'Fraunces', 'Cormorant',
                      'Lora', 'Newsreader', 'Instrument']
    is_serif_display = any(k in display_font for k in serif_keywords)

    vibe = []
    if accent_sat > 0.6:
        vibe.append('bold')
    if is_serif_display:
        vibe.append('editorial')
        vibe.append('elegant')
    if not is_serif_display and luminance(ink) < 0.15:
        vibe.append('professional')
    if paper_warm:
        vibe.append('warm')
    if not vibe:
        vibe = ['editorial', 'minimal']
    vibe = vibe[:4]

    mood = ['inspired'] if is_serif_display else ['impressed']
    if accent_sat > 0.6:
        mood.append('excited')
    else:
        mood.append('calm')
    mood = list(dict.fromkeys(mood))[:2]

    if is_serif_display:
        category = 'editorial'
    elif accent_sat > 0.6 and light_dark == 'dark':
        category = 'bold-poster'
    elif accent_sat < 0.2:
        category = 'minimal'
    else:
        category = 'editorial'

    return vibe, mood, category, light_dark


# ─── Screenshot ───────────────────────────────────────────────────────────────

def find_chrome():
    for c in CHROME_CANDIDATES:
        if Path(c).is_file():
            return c
        w = shutil.which(c)
        if w:
            return w
    return None


def snapshot_url(url: str, out_path: Path, width=1280, height=720):
    chrome = find_chrome()
    if not chrome:
        print('  WARN: no Chrome found; skipping _source.png', file=sys.stderr)
        return False
    cmd = [
        chrome, '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
        f'--window-size={width},{height}', '--virtual-time-budget=4000',
        f'--screenshot={out_path}', url,
    ]
    try:
        subprocess.run(cmd, capture_output=True, text=True, timeout=45)
    except subprocess.TimeoutExpired:
        return False
    return out_path.is_file()


# ─── Template synthesis ───────────────────────────────────────────────────────

def synth_theme_css(palette, fonts_link, display, body):
    paper = rgb_to_hex(palette['paper'])
    ink = rgb_to_hex(palette['ink'])
    accent = rgb_to_hex(palette['accent'])
    muted = rgb_to_hex(palette.get('muted', palette['ink']))
    light_dark = guess_light_dark(palette['paper'])

    # Map to deck-chrome contrast set
    if light_dark == 'light':
        chrome = {
            'bg': f'rgba(255,255,255,0.96)',
            'border': 'rgba(0,0,0,0.18)',
            'text': '#0a0a0a',
            'muted': '#5a5a5a',
            'surface': 'rgba(245,245,245,0.96)',
        }
    else:
        chrome = {
            'bg': f'rgba(20,20,20,0.95)',
            'border': 'rgba(255,255,255,0.18)',
            'text': '#e8e8e8',
            'muted': '#999999',
            'surface': 'rgba(35,35,35,0.95)',
        }

    body_color = ink if light_dark == 'light' else paper

    return f"""
:root {{
  --uc-paper: {paper};
  --uc-ink:   {ink};
  --uc-accent: {accent};
  --uc-muted:  {muted};

  --font-display: '{display}', system-ui, sans-serif;
  --font-body:    '{body}', system-ui, sans-serif;

  --slide-bg-deep:     var(--uc-paper);
  --slide-bg-gradient: var(--uc-paper);
  --text-primary:      var(--uc-ink);

  --deck-chrome-bg:      {chrome['bg']};
  --deck-chrome-border:  {chrome['border']};
  --deck-chrome-text:    {chrome['text']};
  --deck-chrome-muted:   {chrome['muted']};
  --deck-chrome-accent:  {accent};
  --deck-chrome-shadow:  0 8px 24px rgba(0,0,0,0.15);
  --deck-chrome-surface: {chrome['surface']};
}}
body {{ margin: 0; font-family: var(--font-body); background: var(--uc-paper); color: {body_color}; }}
.slide {{ background: var(--uc-paper); }}
.reveal {{ opacity: 0; transform: translateY(14px); transition: opacity .55s ease, transform .55s ease; }}
.slide.visible .reveal {{ opacity: 1; transform: translateY(0); }}
.slide.visible .reveal:nth-child(1) {{ transition-delay: .05s; }}
.slide.visible .reveal:nth-child(2) {{ transition-delay: .14s; }}
.slide.visible .reveal:nth-child(3) {{ transition-delay: .23s; }}

.uc-mono {{
  font-family: var(--font-body);
  font-weight: 600; font-size: clamp(11px, 1vw, 13px);
  letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--uc-accent);
}}
.uc-h1 {{
  font-family: var(--font-display);
  font-weight: 700; font-size: clamp(56px, 9vw, 140px);
  line-height: 0.95; letter-spacing: -0.02em;
  color: var(--uc-ink);
}}
.uc-h2 {{
  font-family: var(--font-display);
  font-weight: 600; font-size: clamp(28px, 4.5vw, 56px);
  line-height: 1.1; color: var(--uc-ink);
}}
.uc-body {{
  font-family: var(--font-body);
  font-weight: 400; font-size: clamp(14px, 1.3vw, 18px);
  line-height: 1.65; color: var(--uc-muted);
}}
.uc-rule {{ height: 2px; background: var(--uc-accent); }}
"""


def synth_slides_html(name: str, source_url: str):
    """Three placeholder slides demonstrating the extracted style."""
    return f'''
<section class="slide visible" id="slide-0" style="padding:64px;">
  <div class="slide-edit-layer">
    <div class="slide-object" data-slide-object data-oid="s0-meta" data-object-type="text" style="left:5%;top:8%;width:60%;">
      <button type="button" class="slide-object-move" aria-label="Move">⠿</button>
      <button type="button" class="slide-object-resize" aria-label="Resize"></button>
      <div class="slide-object-text" contenteditable="false">
        <span class="uc-mono reveal">Cloned from URL · {date.today().isoformat()}</span>
      </div>
    </div>
    <div class="slide-object" data-slide-object data-oid="s0-h" data-object-type="text" style="left:5%;top:26%;width:90%;">
      <button type="button" class="slide-object-move" aria-label="Move">⠿</button>
      <button type="button" class="slide-object-resize" aria-label="Resize"></button>
      <div class="slide-object-text" contenteditable="false">
        <h1 class="uc-h1 reveal">{name}</h1>
      </div>
    </div>
    <div class="slide-object" data-slide-object data-oid="s0-rule" data-object-type="graphic" style="left:5%;top:78%;width:25%;height:2px;">
      <button type="button" class="slide-object-move" aria-label="Move">⠿</button>
      <button type="button" class="slide-object-resize" aria-label="Resize"></button>
      <div class="slide-object-graphic reveal"><div class="uc-rule"></div></div>
    </div>
    <div class="slide-object" data-slide-object data-oid="s0-body" data-object-type="text" style="left:5%;top:82%;width:70%;">
      <button type="button" class="slide-object-move" aria-label="Move">⠿</button>
      <button type="button" class="slide-object-resize" aria-label="Resize"></button>
      <div class="slide-object-text" contenteditable="false">
        <p class="uc-body reveal">A draft preset auto-generated from {source_url}. Review the extracted palette and typography, then refine.</p>
      </div>
    </div>
  </div>
</section>

<section class="slide" id="slide-1" style="padding:64px;">
  <div class="slide-edit-layer">
    <div class="slide-object" data-slide-object data-oid="s1-mono" data-object-type="text" style="left:5%;top:8%;width:60%;">
      <button type="button" class="slide-object-move" aria-label="Move">⠿</button>
      <button type="button" class="slide-object-resize" aria-label="Resize"></button>
      <div class="slide-object-text" contenteditable="false">
        <span class="uc-mono reveal">02 · Content</span>
      </div>
    </div>
    <div class="slide-object" data-slide-object data-oid="s1-h" data-object-type="text" style="left:5%;top:18%;width:88%;">
      <button type="button" class="slide-object-move" aria-label="Move">⠿</button>
      <button type="button" class="slide-object-resize" aria-label="Resize"></button>
      <div class="slide-object-text" contenteditable="false">
        <h2 class="uc-h2 reveal">Three things worth saying.</h2>
      </div>
    </div>
    <div class="slide-object" data-slide-object data-oid="s1-cols" data-object-type="text" style="left:5%;top:52%;width:88%;">
      <button type="button" class="slide-object-move" aria-label="Move">⠿</button>
      <button type="button" class="slide-object-resize" aria-label="Resize"></button>
      <div class="slide-object-text" contenteditable="false">
        <div class="reveal" style="display:grid;grid-template-columns:repeat(3,1fr);gap:28px;">
          <div><span class="uc-mono">01</span><h3 class="uc-h2" style="font-size:22px;margin-top:6px;">First point</h3><p class="uc-body" style="margin-top:6px;">A claim worth defending.</p></div>
          <div><span class="uc-mono">02</span><h3 class="uc-h2" style="font-size:22px;margin-top:6px;">Second point</h3><p class="uc-body" style="margin-top:6px;">An angle that surprises.</p></div>
          <div><span class="uc-mono">03</span><h3 class="uc-h2" style="font-size:22px;margin-top:6px;">Third point</h3><p class="uc-body" style="margin-top:6px;">The connection through it all.</p></div>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="slide" id="slide-2" style="padding:64px;">
  <div class="slide-edit-layer">
    <div class="slide-object" data-slide-object data-oid="s2-mono" data-object-type="text" style="left:5%;top:8%;width:60%;">
      <button type="button" class="slide-object-move" aria-label="Move">⠿</button>
      <button type="button" class="slide-object-resize" aria-label="Resize"></button>
      <div class="slide-object-text" contenteditable="false">
        <span class="uc-mono reveal">— Closing</span>
      </div>
    </div>
    <div class="slide-object" data-slide-object data-oid="s2-h" data-object-type="text" style="left:5%;top:30%;width:88%;">
      <button type="button" class="slide-object-move" aria-label="Move">⠿</button>
      <button type="button" class="slide-object-resize" aria-label="Resize"></button>
      <div class="slide-object-text" contenteditable="false">
        <h2 class="uc-h2 reveal" style="font-size:clamp(36px,5.5vw,72px);">Thank you. Questions?</h2>
      </div>
    </div>
    <div class="slide-object" data-slide-object data-oid="s2-body" data-object-type="text" style="left:5%;top:82%;width:60%;">
      <button type="button" class="slide-object-move" aria-label="Move">⠿</button>
      <button type="button" class="slide-object-resize" aria-label="Resize"></button>
      <div class="slide-object-text" contenteditable="false">
        <p class="uc-body reveal">your@email.com</p>
      </div>
    </div>
  </div>
</section>
'''


def build_template(preset_id: str, title: str, deck_id: str, fonts_link: str,
                   theme_css: str, slides_html: str, runtime_dir: Path):
    rt = {
        'viewport':   (runtime_dir / 'viewport-base.css').read_text(encoding='utf-8'),
        'chrome_css': (runtime_dir / 'chrome.css').read_text(encoding='utf-8'),
        'chrome_html': (runtime_dir / 'chrome.html').read_text(encoding='utf-8'),
        'runtime_js': (runtime_dir / 'runtime.js').read_text(encoding='utf-8'),
    }
    fonts_link_tag = ''
    if fonts_link:
        fonts_link_tag = f'<link href="{fonts_link}" rel="stylesheet">'

    return f"""<!DOCTYPE html>
<html lang="en" data-deck-id="{deck_id}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  {fonts_link_tag}
  <style>
/* === viewport-base.css === */
{rt['viewport']}

/* === Extracted theme (draft — review and refine) === */
{theme_css}

/* === Deck chrome === */
{rt['chrome_css']}
  </style>
</head>
<body>
{rt['chrome_html']}

<div class="slides-offset">
{slides_html}
</div>

<script>
{rt['runtime_js']}
</script>
</body>
</html>
"""


def write_preset_md(out_path: Path, name: str, source_url: str, palette,
                    display, body, vibe, light_dark):
    palette_block = '\n'.join(
        f'  --{k}: {rgb_to_hex(v)};' for k, v in palette.items()
    )
    vibe_words = ', '.join(vibe) if vibe else 'editorial'
    out_path.write_text(f"""# {name}

**Vibe (auto-detected — review):** {vibe_words}

**Layout:** Auto-generated draft from a URL clone. Three placeholder slides (title cover, three-point content, closing) using the extracted palette and typography. Review and refine the layout to match the source aesthetic.

**Typography (extracted):**
- Display: `{display}`
- Body: `{body}`

**Colors (clustered from source):**
```css
:root {{
{palette_block}
}}
```

**Light/Dark:** {light_dark}

**Source:** Cloned from [{source_url}]({source_url}) on {date.today().isoformat()}. This is a starter draft — compare `template.html` against `_source.png` and refine before publishing.

**Refine checklist:**
- [ ] Inspect `_source.png` next to `template.html`; do the colors feel right?
- [ ] Are the headline/body font weights accurate?
- [ ] Does the layout signature need adjustment (corner brackets, ribbons, etc.)?
- [ ] Are the auto-classified `vibe` / `mood` / `category` in `meta.json` appropriate?
- [ ] Update `meta.json.ported.notes` once the draft has been reviewed.
- [ ] Run `scripts/snapshot_screenshots.py --preset <id>` to refresh screenshot.
- [ ] Run `scripts/generate_index.py` to add to INDEX.json.
""", encoding='utf-8')


def write_meta_json(out_path: Path, preset_id: str, name: str, source_url: str,
                    palette, display, body, vibe, mood, category, light_dark):
    colors_dict = {k: rgb_to_hex(v) for k, v in palette.items()}
    meta = {
        'schemaVersion': 1,
        'id': preset_id,
        'name': name,
        'vibe': vibe,
        'mood': mood,
        'category': category,
        'lightDark': light_dark,
        'typography': {
            'display': display,
            'body': body,
            'source': 'google-fonts',
        },
        'colors': colors_dict,
        'capabilities': {
            'pdfExport': True,
            'imageUpload': True,
        },
        'source': {
            'origin': f'url:{source_url}',
            'originalUrl': source_url,
        },
        'ported': {
            'by': 'extract_style_from_url.py',
            'date': date.today().isoformat(),
            'notes': 'DRAFT — extracted from URL. Review _source.png and refine before publishing.',
        },
    }
    out_path.write_text(json.dumps(meta, indent=2) + '\n', encoding='utf-8')


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser(description='Extract style from a URL into a draft slide preset.')
    p.add_argument('--url', required=True, help='Source URL (e.g. https://example.com)')
    p.add_argument('--id', required=True, help='Kebab-case preset id (e.g. acme-blog-2026)')
    p.add_argument('--name', help='Display name (default: derived from id)')
    p.add_argument('--repo-root', default=str(Path(__file__).parent.parent),
                   help='Templates repo root (default: parent of scripts/)')
    args = p.parse_args()

    if not re.match(r'^[a-z0-9][a-z0-9-]*[a-z0-9]$', args.id):
        sys.exit(f'ERROR: --id must be kebab-case: {args.id!r}')

    root = Path(args.repo_root)
    preset_dir = root / 'presets' / args.id
    if preset_dir.exists():
        sys.exit(f'ERROR: presets/{args.id}/ already exists. Pick a different --id or delete the existing folder.')

    name = args.name or ' '.join(w.capitalize() for w in args.id.split('-'))

    print(f'Fetching {args.url} ...')
    html = fetch_html(args.url)
    print(f'  HTML: {len(html):,} chars')

    print('Extracting palette ...')
    counts = collect_colors(html)
    clustered = cluster_colors(counts)
    palette = classify_palette(clustered)
    print(f'  Palette: {", ".join(f"{k}={rgb_to_hex(v)}" for k, v in palette.items())}')

    print('Extracting fonts ...')
    display, body, fonts_link = extract_fonts(html)
    print(f'  Display: {display}    Body: {body}')

    light_dark = guess_light_dark(palette['paper'])
    vibe, mood, category, _ = guess_vibe_mood_category(palette, display)
    print(f'  Classified: vibe={vibe}  mood={mood}  category={category}  lightDark={light_dark}')

    print(f'Creating presets/{args.id}/ ...')
    preset_dir.mkdir(parents=True)

    theme_css = synth_theme_css(palette, fonts_link, display, body)
    slides_html = synth_slides_html(name, args.url)
    template_html = build_template(args.id, f'{name} — Editable Slide Template (draft)',
                                    args.id, fonts_link, theme_css, slides_html,
                                    runtime_dir=root / 'runtime')
    (preset_dir / 'template.html').write_text(template_html, encoding='utf-8')

    write_preset_md(preset_dir / 'preset.md', name, args.url, palette, display, body, vibe, light_dark)
    write_meta_json(preset_dir / 'meta.json', args.id, name, args.url, palette,
                    display, body, vibe, mood, category, light_dark)

    print(f'Snapshotting {args.url} -> _source.png ...')
    if snapshot_url(args.url, preset_dir / '_source.png'):
        print('  OK')
    else:
        print('  (skipped)')

    print()
    print(f'Draft preset ready:  presets/{args.id}/')
    print(f'  template.html  ({(preset_dir / "template.html").stat().st_size:,} bytes)')
    print('  preset.md      (refine checklist inside)')
    print('  meta.json      (vibe/mood/category — review!)')
    if (preset_dir / '_source.png').is_file():
        print('  _source.png    (reference image of the URL)')
    print()
    print('Next steps:')
    print(f'  1. open {preset_dir}/template.html  &&  open {preset_dir}/_source.png')
    print('  2. Compare. Refine theme CSS, meta.json vibe/mood/category, preset.md signature elements.')
    print(f'  3. python3 {root}/scripts/snapshot_screenshots.py --preset {args.id}')
    print(f'  4. python3 {root}/scripts/generate_index.py')


if __name__ == '__main__':
    main()
