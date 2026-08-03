"""Dress the generated deck: pictures, motion, and one of every object.

make_deck writes headings, kickers and bullets. Everything else the runtime can
hold goes in here as markup that conforms to CONTRACT.md — no template, no
component library. The pictures are the runtime's own screens, taken from a real
deck and embedded, so the file stays one file.
"""
import json, re, sys
from pathlib import Path

src = Path(sys.argv[1])
html = src.read_text(encoding='utf-8')
IMG = json.loads(Path('images.json').read_text())

slides = re.findall(r'<section class="slide\b[^"]*"[^>]*id="([^"]+)"', html)
if len(slides) != 15:
    sys.exit('expected 15 slides, found %d' % len(slides))
S = {i + 1: sid for i, sid in enumerate(slides)}


def in_slide(sid, addition):
    global html
    start = html.index('id="%s"' % sid)
    layer = html.index('<div class="slide-edit-layer"', start)
    close = html.index('>', layer) + 1
    html = html[:close] + addition + html[close:]


def obj(oid, kind, geom, inner, extra=''):
    return ('\n<div class="slide-object" data-slide-object data-object-type="%s" '
            'data-oid="%s" style="%s"%s>%s</div>' % (kind, oid, geom, extra, inner))


def picture(src_data, fit='contain', radius=10):
    return ('<div class="slide-object-graphic" style="width:100%;height:100%;">'
            '<img src="' + src_data + '" alt="" style="width:100%;height:100%;'
            'object-fit:' + fit + ';display:block;pointer-events:none;'
            'border-radius:' + str(radius) + 'px;'
            'box-shadow:0 8px 30px -12px rgba(0,0,0,0.28), 0 0 0 1px rgba(0,0,0,0.06);">'
            '</div>')


def shape(fill, rx=6):
    return ('<div class="slide-object-shape" style="width:100%;height:100%;pointer-events:none;">'
            '<svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" '
            'fill="' + fill + '" stroke="none" style="display:block;overflow:visible;">'
            '<rect x="0" y="0" width="100" height="100" rx="' + str(rx) + '" '
            'vector-effect="non-scaling-stroke"/></svg></div>')


def text(body, size='var(--body-size, 1rem)', colour='var(--text-primary, currentColor)',
         family='var(--font-body)', weight='', align=''):
    st = ('width:100%;height:100%;font-family:' + family + ';font-size:' + size +
          ';color:' + colour + ';' + (('font-weight:%s;' % weight) if weight else '') +
          (('text-align:%s;' % align) if align else ''))
    return '<div class="slide-object-text" contenteditable="false" style="' + st + '">' + body + '</div>'


def caption(sid, oid, geom, words):
    in_slide(sid, obj(oid, 'text', geom,
                      text(words, size='var(--small-size, 0.8rem)',
                           colour='var(--text-muted, #6b6b73)', family='var(--font-mono)')))


# --- 1. give the right half back ---------------------------------------------
#     The generated title and body both run the full width. Anything sharing a
#     slide with them has to be given room first, or it lands on the words.
def narrow(sid, role, width):
    """The generated slides name their parts with data-role, not with the object
    type — matching the wrong attribute silently did nothing, and the pages that
    looked fine only looked fine because their bullets happened to be short."""
    global html
    start = html.index('id="%s"' % sid)
    end = html.index('</section>', start)
    chunk = html[start:end]
    pattern = r'(data-role="%s"[^>]*style="[^"]*?)width:\s*[\d.]+%%' % role
    fixed, count = re.subn(pattern, lambda m: m.group(1) + 'width:' + width, chunk, count=1)
    if not count:
        sys.exit('could not narrow %s on %s' % (role, sid))
    html = html[:start] + fixed + html[end:]


for n in (6, 7, 8, 9, 10, 11, 15):
    narrow(S[n], 'title', '42%')
    narrow(S[n], 'kicker', '42%')
    narrow(S[n], 'body', '38%')

# --- 2. the pictures ---------------------------------------------------------
in_slide(S[7], obj('shot-editor', 'graphic', 'left:48%;top:22%;width:48%;height:48%;',
                   picture(IMG['editor'])))
caption(S[7], 'cap-editor', 'left:48%;top:72%;width:48%;height:6%;',
        'THE EDITOR, IN A FILE ON A DISK')

in_slide(S[9], obj('shot-bar', 'graphic', 'left:48%;top:30%;width:48%;height:8%;',
                   picture(IMG['bar'], radius=8)))
caption(S[9], 'cap-bar', 'left:48%;top:40%;width:48%;height:6%;',
        'IT FOLLOWS THE WORDS')

in_slide(S[11], obj('shot-present', 'graphic', 'left:48%;top:24%;width:48%;height:46%;',
                    picture(IMG['present'])))
caption(S[11], 'cap-present', 'left:48%;top:72%;width:48%;height:6%;',
        'PRESENTING, WITH THE CHROME GONE')

# --- 3. a mark that morphs, twice, so it reads as one thing moving through ----
in_slide(S[4], obj('travelling-mark', 'shape', 'left:88%;top:11%;width:5%;height:6%;',
                   shape('var(--accent, #16D342)', 10)))
in_slide(S[5], obj('travelling-mark', 'shape', 'left:6%;top:86%;width:34%;height:1.2%;',
                   shape('var(--accent, #16D342)', 2)))
in_slide(S[6], obj('travelling-mark', 'shape', 'left:52%;top:22%;width:13%;height:13%;',
                   shape('var(--accent, #16D342)', 14)))

# --- 4. numbers that count up ------------------------------------------------
def figure(sid, oid, value, label, left, top, width='24%'):
    in_slide(sid, obj(oid, 'text', 'left:%s;top:%s;width:%s;height:10%%;' % (left, top, width),
                      text(value, size='2.2rem', family='var(--font-display)', weight='700'),
                      ' data-fx-countup'))
    caption(sid, oid + '-label', 'left:%s;top:%d%%;width:%s;height:5%%;'
            % (left, int(top.rstrip('%')) + 11, width), label)


figure(S[6], 'fig-decks', '3 decks', 'NOTHING IN COMMON', '52%', '46%')
figure(S[6], 'fig-checks', '645 checks', 'EVERY ONE OF THEM', '52%', '66%')
figure(S[10], 'fig-lines', '4700 lines', 'THE WHOLE RUNTIME', '56%', '40%')
figure(S[10], 'fig-size', '73 KB', 'COMPRESSED, ONCE PER FILE', '56%', '62%')

# --- 5. the table and the chart ----------------------------------------------
def cell(head, s):
    tag = 'th' if head else 'td'
    return ('<' + tag + ' class="slide-object-text" contenteditable="false" style="'
            'border:1px solid var(--line, #e2e2df);padding:0.45em 0.65em;text-align:left;'
            'vertical-align:middle;font-weight:' + ('700' if head else '400') + ';'
            + ('background:#1a1a1e;color:#fafafa;' if head else '') + '">' + s + '</' + tag + '>')


rows = [('OBJECT', 'WHAT IT TAKES'),
        ('Shape', 'Fill, stroke, line, corners'),
        ('Table', 'Header, grid lines, padding'),
        ('Chart', 'Series, legend, labels'),
        ('Media', 'A file, or a link'),
        ('Field', 'Page, total, title, date')]
table = ('<div class="slide-object-table" style="width:100%;height:100%;overflow:hidden;border-radius:8px;">'
         '<table data-head data-grid="all" data-pad-x="0.65" data-pad-y="0.45" '
         'style="width:100%;height:100%;table-layout:fixed;border-collapse:collapse;'
         'font-family:var(--font-body);font-size:var(--small-size, 0.82rem);'
         'color:var(--text-primary, currentColor);border-radius:8px;">'
         + ''.join('<tr>' + cell(i == 0, a) + cell(i == 0, b) + '</tr>'
                   for i, (a, b) in enumerate(rows))
         + '</table></div>')
in_slide(S[8], obj('object-table', 'table', 'left:50%;top:22%;width:23%;height:60%;', table))
in_slide(S[8], obj('shot-panel', 'graphic', 'left:75%;top:22%;width:19%;height:60%;',
                   picture(IMG['panel'], fit='cover', radius=8)))
caption(S[8], 'cap-panel', 'left:50%;top:84%;width:44%;height:5%;',
        'WHAT AN OBJECT TAKES, AND WHERE YOU SET IT')

chart = ('<div class="slide-object-chart" style="width:100%;height:100%;pointer-events:none;position:relative;">'
         '<svg viewBox="0 0 100 70" preserveAspectRatio="none" width="100%" height="100%" '
         'style="display:block;overflow:visible;"></svg></div>')
in_slide(S[15], obj('coverage', 'chart', 'left:50%;top:28%;width:44%;height:40%;', chart,
                    ' data-chart="bar"'
                    ' data-chart-data="Main 270, Topic 109, Objects 103, Text 89, Shapes 41"'
                    ' data-chart-labels data-chart-values data-chart-grid'
                    ' data-chart-colour="#16D342"'))
caption(S[15], 'cap-coverage', 'left:50%;top:70%;width:44%;height:6%;', 'CHECKS, BY AREA')

# --- 6. the link, on the words that name a place -----------------------------
html = html.replace(
    'github.com/dora-dotcom/editable-slides-runtime',
    '<a href="https://github.com/dora-dotcom/editable-slides-runtime" target="_blank" '
    'rel="noopener">github.com/dora-dotcom/editable-slides-runtime</a>', 1)

# --- 7. the three commands, set as code --------------------------------------
start = html.index('id="%s"' % S[14])
end = html.index('</section>', start)
chunk = html[start:end]
chunk = re.sub(r'(data-object-type="body"[^>]*style="[^"]*)"',
               lambda m: m.group(1) + 'font-family:var(--font-mono);font-size:0.86rem;"', chunk, count=1)
html = html[:start] + chunk + html[end:]

# --- 8. entrances, in reading order, with pictures arriving from the side -----
for sid in slides:
    start = html.index('id="%s"' % sid)
    end = html.index('</section>', start)
    chunk = html[start:end]
    order = {'n': 0}

    def stamp(m):
        tag = m.group(0)
        if 'data-fx-enter' in tag:
            return tag
        order['n'] += 1
        how = 'slide-right' if 'data-object-type="graphic"' in tag else 'fade-up'
        return tag.replace('data-slide-object',
                           'data-slide-object data-fx-enter="%s" data-fx-order="%d"'
                           % (how, order['n']), 1)

    html = html[:start] + re.sub(r'<div class="slide-object\b[^"]*"[^>]*data-slide-object',
                                 stamp, chunk) + html[end:]

# --- 9. how each slide arrives ----------------------------------------------
arrive = ['fade', 'up', 'up', 'zoom', 'up', 'up', 'slide', 'slide', 'slide',
          'zoom', 'slide', 'up', 'up', 'up', 'fade']
for sid, how in zip(slides, arrive):
    html = html.replace('id="%s"' % sid, 'id="%s" data-transition="%s"' % (sid, how), 1)

# --- 10. notes ---------------------------------------------------------------
notes = {
    S[1]: 'The file is the software. Nothing was installed to open it.',
    S[2]: 'This is the actual complaint: the deck is fine, and it is frozen.',
    S[4]: 'We do not own the design. We own the shape.',
    S[5]: 'Two rules. Everything else is built on top of them.',
    S[6]: 'Three decks with nothing in common pass the same 645 checks.',
    S[9]: 'The bar acts on the selection; the panel acts on the block. Never both.',
    S[10]: 'The green mark travelled here from two slides back. Same id.',
    S[12]: 'The first save asks once. That is the browser, not us.',
    S[15]: 'MIT. Take it.',
}
for sid, note in notes.items():
    html = html.replace('id="%s"' % sid,
                        'id="%s" data-notes="%s"' % (sid, note.replace('"', '&quot;')), 1)

src.write_text(html, encoding='utf-8')
print('dressed: %d slides, %d objects, %d pictures, %d notes'
      % (len(slides), html.count('data-slide-object'), 4, len(notes)))
