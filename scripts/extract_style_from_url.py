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
import os
import re
import shutil
import socket
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

try:
    import websocket  # websocket-client
    HAS_WS = True
except ImportError:
    HAS_WS = False


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


def _parse_css_rgb_string(s):
    """Parse a 'rgb(r, g, b)' or 'rgba(r, g, b, a)' string into an (r, g, b) tuple."""
    if not s:
        return None
    m = RGB_RE.search(s)
    if not m:
        return None
    try:
        r, g, b = (int(float(m.group(i))) for i in (1, 2, 3))
        return (min(255, max(0, r)), min(255, max(0, g)), min(255, max(0, b)))
    except ValueError:
        return None


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
    """Return dict of named tokens: paper / ink / accent / muted / extras.

    Accent picking is **weight-aware**: a chromatic color must have visible
    presence (≥ 1% of total clustered weight) to qualify. Otherwise the page
    is judged neutral / image-led and accent falls back to the most visible
    non-paper, non-ink tone.
    """
    if not clustered:
        return {'paper': (250, 250, 245), 'ink': (20, 20, 20), 'accent': (220, 60, 60)}

    total_weight = sum(w for _, w in clustered) or 1
    by_lum = sorted(clustered, key=lambda x: luminance(x[0]))

    paper = by_lum[-1][0]   # lightest
    ink = by_lum[0][0]      # darkest

    # Filter out paper / ink, score candidates by saturation × visual-weight share.
    candidates = [(rgb, w) for rgb, w in clustered if rgb != paper and rgb != ink]

    chromatic = [(rgb, w) for rgb, w in candidates if saturation(rgb) >= 0.3]
    accent = None
    if chromatic:
        # Sort by sat × sqrt(weight) so saturation matters but weight tiebreaks
        chromatic.sort(key=lambda x: saturation(x[0]) * ((x[1] / total_weight) ** 0.5), reverse=True)
        top_rgb, top_w = chromatic[0]
        share = top_w / total_weight
        # Only use as accent if it has at least 1% visual presence in the merged palette
        if share >= 0.01:
            accent = top_rgb

    # Fallback: most prominent non-paper, non-ink tone (often a warm/neutral muted)
    if accent is None and candidates:
        candidates.sort(key=lambda x: x[1], reverse=True)
        accent = candidates[0][0]
    if accent is None:
        accent = (220, 60, 60)

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
# CSS rule block matcher: captures selector list and declaration body.
CSS_RULE_RE = re.compile(r'([^{}@]+?)\{([^{}]*)\}', re.DOTALL)
# Match heading-indicating tokens — either as bare tag (h1-h3, body, p) OR
# as a SUBSTRING in a class/id selector (so `.si2-blog-title` and
# `.custom-rich-text-heading` both qualify).
HEADING_SEL_RE = re.compile(
    r'(?:^|[\s,>+~])h[1-3]\b'
    r'|[.#][\w-]*(?:title|heading|headline|hero|display|cover|h[1-3])(?:[\w-]*)?',
    re.IGNORECASE,
)
BODY_SEL_RE = re.compile(
    r'(?:^|[\s,>+~])(?:body|p)\b'
    r'|[.#][\w-]*(?:body|text|copy|paragraph|prose|description|lead)(?:[\w-]*)?',
    re.IGNORECASE,
)


def _parse_font_size_px(value: str) -> float:
    """Coarse normalize a CSS font-size value to a ~px number for scoring."""
    m = re.match(r'\s*([0-9.]+)\s*(px|rem|em|vw|vh|%|pt)?', value or '')
    if not m:
        return 0.0
    n = float(m.group(1))
    unit = (m.group(2) or 'px').lower()
    if unit == 'rem' or unit == 'em':
        return n * 16
    if unit == 'vw' or unit == 'vh':
        return n * 12.8  # at 1280 width
    if unit == 'pt':
        return n * 1.333
    if unit == '%':
        return n * 0.16  # rough; assume 16px base
    return n


def _first_family(decl_value: str) -> str:
    """Pick first concrete family from a font-family stack."""
    first = decl_value.split(',')[0].strip().strip('"\'').strip()
    if not first or first.startswith(('var(', 'inherit', 'initial', 'unset')):
        return ''
    return first


FONT_SIZE_DECL_RE = re.compile(r'font-size\s*:\s*([^;{}!]+)', re.IGNORECASE)
DISPLAY_PX_THRESHOLD = 28   # any font used at >=28px treated as display candidate
BODY_PX_THRESHOLD    = 20   # <=20px treated as body candidate


def parse_font_roles_from_rules(html: str):
    """Walk CSS rules; classify each font-family declaration.

    Scoring uses BOTH:
      - Selector context (heading vs body vs neutral)
      - Font-size in the same rule (large → display, small → body)
      - Weighted by font-size value for display scoring

    Returns (display_score, body_score, neutral_count) — all Counter-like dicts.
    """
    display_score = Counter()
    body_score = Counter()
    neutral = Counter()
    for m in CSS_RULE_RE.finditer(html):
        selector = m.group(1).strip()
        decls = m.group(2)
        ff = FONT_FAMILY_RE.search(decls)
        if not ff:
            continue
        family = _first_family(ff.group(1))
        if not family:
            continue

        is_heading_sel = bool(HEADING_SEL_RE.search(selector))
        is_body_sel = bool(BODY_SEL_RE.search(selector))

        fs_match = FONT_SIZE_DECL_RE.search(decls)
        fs_px = _parse_font_size_px(fs_match.group(1)) if fs_match else 0.0

        # Display score: heading selector OR font-size > threshold
        if is_heading_sel or fs_px >= DISPLAY_PX_THRESHOLD:
            # Weight by font-size when known, else by selector match
            score = max(fs_px, 24) if fs_px else (24 if is_heading_sel else 0)
            display_score[family] += score
        elif is_body_sel or (0 < fs_px <= BODY_PX_THRESHOLD):
            body_score[family] += max(fs_px, 12) if fs_px else 12
        else:
            neutral[family] += 1

    return display_score, body_score, neutral


def extract_fonts(html: str):
    """Return (display_font, body_font, fonts_link_url, debug_info).

    Uses selector context (h1/h2/.title vs body/p/.text) to assign roles,
    falling back to overall frequency for ambiguous cases.
    """
    # Find Google Fonts URLs to reconstruct a fonts_link
    google_families = []
    fonts_link = ''
    for m in GOOGLE_FONTS_RE.finditer(html):
        family_blob = m.group(1)
        for chunk in family_blob.split('&family='):
            name = chunk.split(':')[0].replace('+', ' ').strip()
            if name and name not in google_families:
                google_families.append(name)

    link_match = re.search(r'href=["\']([^"\']*fonts\.googleapis\.com/css2?[^"\']+)["\']', html)
    if link_match:
        fonts_link = link_match.group(1).replace('&amp;', '&')

    # Selector + font-size aware scoring
    display_score, body_score, neutral_counts = parse_font_roles_from_rules(html)

    # Pick display: highest-scoring family from display pool
    display = ''
    if display_score:
        display = display_score.most_common(1)[0][0]

    # Pick body: highest-scoring family from body pool (not the same as display)
    body_font = ''
    if body_score:
        for name, _ in body_score.most_common():
            if name != display:
                body_font = name
                break

    # Fallback: any neutral or fallback to overall frequency
    if not display or not body_font:
        all_counts = Counter()
        for c in (display_score, body_score, neutral_counts):
            for k, v in c.items():
                all_counts[k] += v
        ranked = [name for name, _ in all_counts.most_common()]
        if not display and ranked:
            display = ranked[0]
        if not body_font:
            for name in ranked:
                if name != display:
                    body_font = name
                    break
            body_font = body_font or display

    # Final safety net
    if not display:
        display = 'Inter'
    if not body_font:
        body_font = display

    if not fonts_link:
        # Even if the source site didn't use Google Fonts, try loading our
        # chosen display + body via Google Fonts. Unknown families silently
        # fall back, so the worst case is the system font we'd see anyway.
        wanted = []
        for f in (display, body_font):
            if f and f not in wanted:
                wanted.append(f)
        for g in google_families:
            if g not in wanted:
                wanted.append(g)
        if wanted:
            families_param = '&'.join(
                'family=' + g.replace(' ', '+') + ':wght@400;500;600;700;800'
                for g in wanted[:3]
            )
            fonts_link = f'https://fonts.googleapis.com/css2?{families_param}&display=swap'

    debug = {
        'display_top': [(k, round(v)) for k, v in display_score.most_common(3)],
        'body_top':    [(k, round(v)) for k, v in body_score.most_common(3)],
        'neutral_top': neutral_counts.most_common(3),
    }
    return display, body_font, fonts_link, debug


# ─── Heading typography (font-size / weight / letter-spacing / text-transform) ─

H1_BLOCK_RE = re.compile(
    r'(?:^|[\s,>+~])h1\b[^{}]*\{([^}]+)\}',
    re.IGNORECASE | re.DOTALL,
)

NUMERIC_DECL = {
    'font-size':       re.compile(r'font-size\s*:\s*([^;{}]+)', re.IGNORECASE),
    'font-weight':     re.compile(r'font-weight\s*:\s*(\d{3}|bold|normal|[1-9]00)', re.IGNORECASE),
    'line-height':     re.compile(r'line-height\s*:\s*([0-9.]+)', re.IGNORECASE),
    'letter-spacing':  re.compile(r'letter-spacing\s*:\s*([-0-9.a-z%]+)', re.IGNORECASE),
    'text-transform':  re.compile(r'text-transform\s*:\s*(uppercase|lowercase|capitalize|none)', re.IGNORECASE),
}


def extract_h1_typography(html: str):
    """Best-effort: scan rules that target h1 and pull common type properties."""
    found = {}
    for m in CSS_RULE_RE.finditer(html):
        sel = m.group(1).strip()
        if not re.search(r'(?:^|[\s,>+~])h1\b', sel, re.IGNORECASE):
            continue
        decls = m.group(2)
        for prop, pat in NUMERIC_DECL.items():
            if prop in found:
                continue
            mm = pat.search(decls)
            if mm:
                found[prop] = mm.group(1).strip()
    return found


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
                      'Lora', 'Newsreader', 'Instrument', 'Adamina', 'Caslon', 'Georgia',
                      'Times', 'Spectral', 'Crimson', 'Bricolage', 'DM Serif', 'Big Shoulders',
                      'Italianno', 'Old Standard', 'Vollkorn', 'Merriweather', 'PT Serif']
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


# ─── Chrome DevTools Protocol (computed styles + hero image) ──────────────────

# JavaScript executed in the page context to gather computed styles for key
# elements + identify the largest visible hero image. Returns a JSON string.
CDP_PROBE_JS = r"""
(() => {
  const probe = (sel, el) => {
    el = el || document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      sel: sel,
      tag: el.tagName.toLowerCase(),
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      lineHeight: cs.lineHeight,
      letterSpacing: cs.letterSpacing,
      textTransform: cs.textTransform,
      color: cs.color,
      backgroundColor: cs.backgroundColor,
      backgroundImage: cs.backgroundImage,
      width: r.width,
      height: r.height,
    };
  };

  // Probe the most likely heading + body elements (selector lookup).
  const targets = ['h1', 'h2', 'h3', 'p', 'body',
                   '[class*="title" i]', '[class*="heading" i]', '[class*="hero" i]',
                   '[class*="display" i]'];
  const computed = {};
  for (const t of targets) {
    const v = probe(t);
    if (v) computed[t] = v;
  }

  // Visual-prominence walk: find the largest visible text and the most common
  // body text size in the first viewport. This catches sites where the hero
  // headline is a <div> with class names that don't match our heuristics.
  const inView = (r) => r.top < window.innerHeight && r.bottom > 0 && r.left < window.innerWidth && r.right > 0;
  const all = document.body ? document.body.querySelectorAll('*') : [];
  let heroDisplayEl = null;
  let heroDisplaySize = 0;
  const bodySizeBuckets = {}; // round(font-size) -> [count, sample el]
  for (const el of all) {
    // Only consider elements with direct text content
    let hasOwnText = false;
    for (const node of el.childNodes) {
      if (node.nodeType === 3 && node.nodeValue && node.nodeValue.trim().length >= 2) {
        hasOwnText = true;
        break;
      }
    }
    if (!hasOwnText) continue;
    const r = el.getBoundingClientRect();
    if (!inView(r) || r.width < 60 || r.height < 16) continue;
    const cs = getComputedStyle(el);
    const size = parseFloat(cs.fontSize) || 0;
    if (size > heroDisplaySize) { heroDisplaySize = size; heroDisplayEl = el; }
    if (size >= 13 && size <= 22) {
      const key = Math.round(size);
      if (!bodySizeBuckets[key]) bodySizeBuckets[key] = [0, el];
      bodySizeBuckets[key][0] += 1;
    }
  }
  if (heroDisplayEl) computed.heroDisplay = probe('heroDisplay', heroDisplayEl);
  let heroBodyEl = null;
  let bestBodyCount = 0;
  for (const key of Object.keys(bodySizeBuckets)) {
    const [count, el] = bodySizeBuckets[key];
    if (count > bestBodyCount) { bestBodyCount = count; heroBodyEl = el; }
  }
  if (heroBodyEl) computed.heroBody = probe('heroBody', heroBodyEl);

  // Find the biggest visible image on the page — likely the hero.
  const imgs = Array.from(document.querySelectorAll('img'));
  const visibleImgs = imgs
    .map(img => {
      const r = img.getBoundingClientRect();
      return {
        src: img.currentSrc || img.src,
        alt: img.alt || '',
        width: r.width,
        height: r.height,
        topInView: r.top < window.innerHeight && r.bottom > 0,
        area: r.width * r.height,
      };
    })
    .filter(i => i.topInView && i.width >= 240 && i.height >= 160 && i.src)
    .sort((a, b) => b.area - a.area);
  const heroImage = visibleImgs[0] || null;

  // Also check for CSS background-image on hero-like sections.
  const heroBgEls = Array.from(document.querySelectorAll(
    'section, header, div[class*="hero" i], div[class*="banner" i]'
  )).slice(0, 6);
  const heroBgs = heroBgEls
    .map(el => {
      const cs = getComputedStyle(el);
      const bi = cs.backgroundImage;
      const r = el.getBoundingClientRect();
      if (!bi || bi === 'none' || r.width < 300 || r.height < 200) return null;
      const m = bi.match(/url\((['"]?)(.+?)\1\)/);
      return m ? { url: m[2], width: r.width, height: r.height } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (b.width * b.height) - (a.width * a.height));

  // Collect all text colors actually rendered (sample headings + body)
  const textColors = new Set();
  for (const sel of ['h1', 'h2', 'h3', 'p', 'body', 'a', 'button']) {
    const els = document.querySelectorAll(sel);
    for (let i = 0; i < Math.min(els.length, 4); i++) {
      textColors.add(getComputedStyle(els[i]).color);
    }
  }

  return JSON.stringify({
    computed,
    heroImage,
    heroBackground: heroBgs[0] || null,
    textColors: Array.from(textColors),
    documentColors: {
      bodyBg: getComputedStyle(document.body).backgroundColor,
      bodyFg: getComputedStyle(document.body).color,
    },
  });
})()
""".strip()


def _find_free_port():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(('127.0.0.1', 0))
    port = s.getsockname()[1]
    s.close()
    return port


def cdp_extract(url: str, viewport=(1280, 720), wait_s: float = 8.0):
    """Drive a headless Chrome via CDP to extract computed styles + hero image.

    Returns dict (or None on failure):
      {
        'computed': { 'h1': {...}, 'h2': {...}, ... },
        'heroImage': { 'src': '...', 'width': X, 'height': Y } | None,
        'heroBackground': { 'url': '...', ... } | None,
        'textColors': ['rgb(...)', ...],
        'documentColors': { 'bodyBg': 'rgb(...)', 'bodyFg': 'rgb(...)' },
      }
    """
    if not HAS_WS:
        return None
    chrome = find_chrome()
    if not chrome:
        return None

    port = _find_free_port()
    width, height = viewport
    # Pose as a real desktop Chrome to bypass heuristic anti-headless checks
    # (sites built with Webflow / Framer / etc. often refuse to render to
    # HeadlessChrome user-agents).
    real_ua = (
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/120.0.0.0 Safari/537.36'
    )
    proc = subprocess.Popen(
        [
            chrome,
            '--headless=new',
            '--disable-gpu',
            '--no-sandbox',
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-extensions',
            '--hide-scrollbars',
            '--disable-blink-features=AutomationControlled',
            f'--user-agent={real_ua}',
            f'--remote-debugging-port={port}',
            '--remote-allow-origins=*',
            f'--window-size={width},{height}',
            # Open the target URL directly so Chrome's normal page-load pipeline
            # runs (rather than connecting to about:blank and navigating via
            # CDP, which has been observed to leave Webflow/Framer SPAs unrendered).
            url,
        ],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )

    try:
        # Wait for Chrome's debugging endpoint to come up. The tabs list often
        # includes Chrome's bundled extension pages (Hangouts, service workers,
        # etc.); we want the actual http(s) page tab.
        page_tab = None
        for _ in range(60):
            try:
                with urllib.request.urlopen(f'http://127.0.0.1:{port}/json', timeout=1) as r:
                    tabs = json.loads(r.read())
                # Prefer a page-type tab whose URL is our target (or starts with http)
                for t in tabs:
                    if t.get('type') != 'page':
                        continue
                    u = t.get('url') or ''
                    if u.startswith(('http://', 'https://')) and not u.startswith(('chrome-extension://', 'chrome://')):
                        page_tab = t
                        break
                if page_tab and page_tab.get('webSocketDebuggerUrl'):
                    break
            except Exception:
                pass
            time.sleep(0.3)
        if not page_tab:
            return None

        ws_url = page_tab.get('webSocketDebuggerUrl')
        if not ws_url:
            return None

        ws = websocket.create_connection(ws_url, timeout=10)
        msg_id = 0

        def send(method, params=None, await_event=None, timeout=10):
            nonlocal msg_id
            msg_id += 1
            payload = {'id': msg_id, 'method': method}
            if params:
                payload['params'] = params
            ws.send(json.dumps(payload))
            deadline = time.time() + timeout
            ack = None
            ev = None
            while time.time() < deadline:
                try:
                    ws.settimeout(max(0.1, deadline - time.time()))
                    frame = json.loads(ws.recv())
                except Exception:
                    continue
                if frame.get('id') == msg_id:
                    ack = frame.get('result')
                    if not await_event:
                        return ack
                elif await_event and frame.get('method') == await_event:
                    ev = frame
                    if ack is not None:
                        return ack
            return ack

        send('Page.enable')
        send('Runtime.enable')
        # Page already loading via launch URL — just give it time to finish
        time.sleep(wait_s)

        result = send('Runtime.evaluate', {
            'expression': CDP_PROBE_JS,
            'returnByValue': True,
            'awaitPromise': True,
        }, timeout=15)
        ws.close()
        if not result:
            return None
        rv = result.get('result', {})
        val = rv.get('value')
        if not val:
            return None
        try:
            return json.loads(val)
        except json.JSONDecodeError:
            return None
    finally:
        try:
            proc.terminate()
            proc.wait(timeout=5)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass


# ─── Hero image download ──────────────────────────────────────────────────────

def download_image(src_url: str, page_url: str, dst_path: Path) -> bool:
    """Download an image to dst_path. Handles relative URLs and data: URLs."""
    if src_url.startswith('data:'):
        # data: URLs — skip (too small typically, and complex to decode)
        return False
    abs_url = urllib.parse.urljoin(page_url, src_url)
    try:
        req = urllib.request.Request(abs_url, headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        })
        with urllib.request.urlopen(req, timeout=15) as r:
            data = r.read(20 * 1024 * 1024)  # cap at 20MB
        dst_path.write_bytes(data)
        return dst_path.stat().st_size > 1024
    except Exception:
        return False


def image_palette_from_screenshot(snapshot_path: Path, n_colors: int = 8):
    """Sample dominant colors from a screenshot.

    Returns Counter mapping RGB tuples to occurrence count (in pixels).
    Uses PIL median-cut quantization. Skips when PIL is unavailable.
    """
    if not HAS_PIL or not snapshot_path.is_file():
        return Counter()
    try:
        img = Image.open(snapshot_path).convert('RGB')
    except Exception:
        return Counter()
    # Downsample for speed and noise reduction
    img.thumbnail((240, 240))
    quant = img.quantize(colors=n_colors, method=Image.Quantize.MEDIANCUT)
    palette_flat = quant.getpalette() or []
    palette_rgb = [tuple(palette_flat[i:i + 3]) for i in range(0, n_colors * 3, 3)]
    counts = quant.getcolors() or []
    out = Counter()
    for count, idx in counts:
        if idx < len(palette_rgb):
            out[palette_rgb[idx]] += count
    return out


# ─── Template synthesis ───────────────────────────────────────────────────────

def _h1_clamp(raw_size: str) -> str:
    """Derive a clamp() font-size from the extracted h1 value.

    `raw_size` examples:
      '66.08px' (CDP computed value) → clamp(46px, 5.16vw, 70px)
      '48px !important' (CSS regex)  → clamp(34px, 3.75vw, 50px)
      '3rem'                          → clamp(34px, 3.75vw, 50px)
      missing / unparseable           → clamp(56px, 9vw, 140px)
    """
    default = 'clamp(56px, 9vw, 140px)'
    if not raw_size:
        return default
    cleaned = raw_size.replace('!important', '').strip()
    px = _parse_font_size_px(cleaned)
    if px <= 0:
        return default
    # Target px = the source's rendered size at 1280 viewport.
    # Lower bound is ~70% of target for mobile, upper bound is ~5% over target.
    min_px = max(16, int(px * 0.70))
    max_px = int(px * 1.05)
    vw = round(px / 12.8, 2)  # at 1280 viewport, this vw == px
    return f'clamp({min_px}px, {vw}vw, {max_px}px)'


def synth_theme_css(palette, fonts_link, display, body, h1_props=None):
    paper = rgb_to_hex(palette['paper'])
    ink = rgb_to_hex(palette['ink'])
    accent = rgb_to_hex(palette['accent'])
    muted = rgb_to_hex(palette.get('muted', palette['ink']))
    light_dark = guess_light_dark(palette['paper'])
    h1_props = h1_props or {}

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
  font-weight: {h1_props.get('font-weight', '700')};
  font-size: {_h1_clamp(h1_props.get('font-size'))};
  line-height: {h1_props.get('line-height', '0.95')};
  letter-spacing: {h1_props.get('letter-spacing', '-0.02em')};
  text-transform: {h1_props.get('text-transform', 'none')};
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


def synth_slides_html(name: str, source_url: str, hero_image: str = ''):
    """Three placeholder slides demonstrating the extracted style.

    If `hero_image` is a relative filename (e.g. 'hero.jpg') it is referenced
    as a background-image on slide-0 with a faint paper overlay for legibility.
    """
    hero_bg_style = ''
    if hero_image:
        hero_bg_style = (
            f"background-image:linear-gradient(rgba(255,255,255,0.55),rgba(255,255,255,0.85)),url('{hero_image}');"
            "background-size:cover;background-position:center;"
        )
    return f'''
<section class="slide visible" id="slide-0" style="padding:64px;{hero_bg_style}">
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

    print(f'Creating presets/{args.id}/ ...')
    preset_dir.mkdir(parents=True)

    # 0. Computed styles + hero image via Chrome DevTools Protocol.
    print('Probing computed styles via CDP ...')
    cdp = cdp_extract(args.url) if HAS_WS else None
    if cdp:
        print(f'  Got {len(cdp.get("computed", {}))} probed elements')
        h1c = cdp.get('computed', {}).get('h1') or {}
        if h1c:
            print(f'  h1 computed: font={h1c.get("fontFamily","")[:60]} size={h1c.get("fontSize")} weight={h1c.get("fontWeight")}')
        hero = cdp.get('heroImage')
        if hero:
            print(f'  Hero <img>: {hero["src"][:80]}  ({int(hero["width"])}x{int(hero["height"])})')
        bg = cdp.get('heroBackground')
        if bg:
            print(f'  Hero bg-img: {bg["url"][:80]}')
    else:
        print('  (CDP unavailable or failed — falling back to regex)')

    # 1. Snapshot the URL FIRST — used for image palette + reference
    src_png = preset_dir / '_source.png'
    print(f'Snapshotting {args.url} -> _source.png ...')
    snap_ok = snapshot_url(args.url, src_png)
    print('  OK' if snap_ok else '  (skipped)')

    # 2. CSS-based palette
    print('Extracting palette (CSS) ...')
    css_counts = collect_colors(html)

    # 2b. CDP-rendered colors (highest authority — these are actually painted)
    cdp_counts = Counter()
    if cdp:
        doc = cdp.get('documentColors', {}) or {}
        for c in (doc.get('bodyBg'), doc.get('bodyFg')):
            if c:
                rgb = _parse_css_rgb_string(c)
                if rgb:
                    cdp_counts[rgb] += 30  # heavy weight — document-level
        for c in cdp.get('textColors', []) or []:
            rgb = _parse_css_rgb_string(c)
            if rgb:
                cdp_counts[rgb] += 10

    # 3. Image-sampled palette from the screenshot
    print('Sampling palette (screenshot) ...')
    img_counts = image_palette_from_screenshot(src_png) if snap_ok else Counter()
    if img_counts:
        max_img = max(img_counts.values())
        max_css = max(css_counts.values()) if css_counts else 1
        scale = max(1, max_css / max(1, max_img)) * 4
        scaled_img = Counter()
        for rgb, c in img_counts.items():
            scaled_img[rgb] = int(c * scale)
        merged = css_counts + scaled_img + cdp_counts
        print(f'  Image-sampled: {len(img_counts)} unique colors')
    else:
        merged = css_counts + cdp_counts
    if cdp_counts:
        print(f'  CDP-rendered colors: {len(cdp_counts)} added')

    clustered = cluster_colors(merged)
    palette = classify_palette(clustered)
    print(f'  Final palette: {", ".join(f"{k}={rgb_to_hex(v)}" for k, v in palette.items())}')

    # 4. Context-aware font extraction (regex)
    print('Extracting fonts (selector-aware) ...')
    display, body, fonts_link, font_debug = extract_fonts(html)
    if font_debug['display_top']:
        print(f'  Display candidates (selector + font-size weighted): {font_debug["display_top"]}')
    if font_debug['body_top']:
        print(f'  Body candidates:    {font_debug["body_top"]}')

    # 4b. CDP overrides — when getComputedStyle returns a concrete first family,
    #     it's more authoritative than regex frequency.
    h1_props = extract_h1_typography(html)
    cdp_display = None
    cdp_body = None
    if cdp:
        cc = cdp.get('computed', {})
        # Prefer the heroDisplay element (largest-font visible text), fall back
        # to h1, then to title/heading selectors.
        h1c = (cc.get('heroDisplay')
               or cc.get('h1')
               or cc.get('[class*="title" i]')
               or cc.get('[class*="heading" i]')
               or cc.get('[class*="hero" i]'))
        body_cs = (cc.get('heroBody')
                   or cc.get('p')
                   or cc.get('body'))

        def _ok_family(family_value):
            f = _first_family(family_value or '')
            if not f:
                return ''
            if f.lower() in ('system-ui', 'sans-serif', 'serif', 'monospace', 'ui-serif',
                             'ui-sans-serif', '-apple-system', 'blinkmacsystemfont'):
                return ''
            return f

        if h1c:
            cd = _ok_family(h1c.get('fontFamily'))
            if cd:
                cdp_display = cd
                if cd != display:
                    print(f'  CDP override: display {display} → {cd}')
                display = cd
        if body_cs:
            cb = _ok_family(body_cs.get('fontFamily'))
            if cb and cb != display:
                cdp_body = cb
                if cb != body:
                    print(f'  CDP override: body {body} → {cb}')
                body = cb

        # Pull h1 numeric properties from CDP too — these are the rendered values
        if h1c:
            cdp_h1 = {}
            if h1c.get('fontSize'): cdp_h1['font-size'] = h1c['fontSize']
            if h1c.get('fontWeight'): cdp_h1['font-weight'] = h1c['fontWeight']
            if h1c.get('lineHeight'): cdp_h1['line-height'] = h1c['lineHeight']
            if h1c.get('letterSpacing') and h1c['letterSpacing'] != 'normal':
                cdp_h1['letter-spacing'] = h1c['letterSpacing']
            if h1c.get('textTransform') and h1c['textTransform'] != 'none':
                cdp_h1['text-transform'] = h1c['textTransform']
            if cdp_h1:
                h1_props = cdp_h1

        # Re-build fonts_link if CDP changed any picks
        if cdp_display or cdp_body:
            wanted = []
            for f in (display, body):
                if f and f not in wanted:
                    wanted.append(f)
            if wanted:
                families_param = '&'.join(
                    'family=' + g.replace(' ', '+') + ':wght@400;500;600;700;800'
                    for g in wanted[:3]
                )
                fonts_link = f'https://fonts.googleapis.com/css2?{families_param}&display=swap'

    print(f'  Display: {display}    Body: {body}')
    if h1_props:
        print(f'  H1 typography: {h1_props}')

    light_dark = guess_light_dark(palette['paper'])
    vibe, mood, category, _ = guess_vibe_mood_category(palette, display)
    print(f'  Classified: vibe={vibe}  mood={mood}  category={category}  lightDark={light_dark}')

    # Download hero image (if CDP found one) and reference it from slide 0
    hero_filename = ''
    if cdp:
        hero_src = None
        if cdp.get('heroImage'):
            hero_src = cdp['heroImage']['src']
        elif cdp.get('heroBackground'):
            hero_src = cdp['heroBackground']['url']
        if hero_src:
            # Best-effort extension detection
            ext = '.jpg'
            lower = hero_src.lower().split('?')[0]
            for cand in ('.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif'):
                if lower.endswith(cand):
                    ext = '.jpg' if cand == '.jpeg' else cand
                    break
            hero_path = preset_dir / f'hero{ext}'
            print(f'Downloading hero image -> {hero_path.name} ...')
            if download_image(hero_src, args.url, hero_path):
                hero_filename = hero_path.name
                print(f'  OK ({hero_path.stat().st_size:,} bytes)')
            else:
                print('  (skipped)')

    theme_css = synth_theme_css(palette, fonts_link, display, body, h1_props=h1_props)
    slides_html = synth_slides_html(name, args.url, hero_image=hero_filename)
    template_html = build_template(args.id, f'{name} — Editable Slide Template (draft)',
                                    args.id, fonts_link, theme_css, slides_html,
                                    runtime_dir=root / 'runtime')
    (preset_dir / 'template.html').write_text(template_html, encoding='utf-8')

    write_preset_md(preset_dir / 'preset.md', name, args.url, palette, display, body, vibe, light_dark)
    write_meta_json(preset_dir / 'meta.json', args.id, name, args.url, palette,
                    display, body, vibe, mood, category, light_dark)

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
