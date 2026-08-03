"""Dress the generated deck: motion, and one of every object type.

make_deck writes text and a bar chart. Everything else the runtime can hold —
shapes, a table, a multi-series chart, a morphing pair, a counting number — is
added here, as markup that conforms to CONTRACT.md and nothing more. The point
is that a deck can be built this way at all: no template from the repo, no
component library, just the contract.
"""
import re, sys
from pathlib import Path

src = Path(sys.argv[1])
html = src.read_text(encoding='utf-8')

slides = re.findall(r'<section class="slide\b[^"]*"[^>]*id="([^"]+)"', html)
if len(slides) < 10:
    sys.exit('expected 10 slides, found %d' % len(slides))

def in_slide(sid, addition):
    """Put markup inside a slide's edit layer."""
    global html
    start = html.index('id="%s"' % sid)
    layer = html.index('<div class="slide-edit-layer"', start)
    close = html.index('>', layer) + 1
    html = html[:close] + addition + html[close:]

def obj(oid, kind, geom, inner, extra=''):
    return ('\n<div class="slide-object" data-slide-object data-object-type="%s" '
            'data-oid="%s" style="%s"%s>%s</div>' % (kind, oid, geom, extra, inner))

def shape(fill, stroke='none', rx=6):
    return ('<div class="slide-object-shape" style="width:100%;height:100%;pointer-events:none;">'
            '<svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" '
            'fill="' + fill + '" stroke="' + stroke + '" stroke-width="2" style="display:block;overflow:visible;">'
            '<rect x="2" y="2" width="96" height="96" rx="' + str(rx) + '" vector-effect="non-scaling-stroke"/>'
            '</svg></div>')

def text(body, size='var(--body-size, 1rem)', colour='var(--text-primary, currentColor)',
         family='var(--font-body)', weight='', align=''):
    st = ('width:100%;height:100%;font-family:' + family + ';font-size:' + size +
          ';color:' + colour + ';' + (('font-weight:%s;' % weight) if weight else '') +
          (('text-align:%s;' % align) if align else ''))
    return '<div class="slide-object-text" contenteditable="false" style="' + st + '">' + body + '</div>'

# --- 1. entrances, so a slide assembles instead of appearing all at once -----
for sid in slides:
    start = html.index('id="%s"' % sid)
    end = html.index('</section>', start)
    chunk = html[start:end]
    order = 0
    def stamp(m):
        global order
        order += 1
        if 'data-fx-enter' in m.group(0):
            return m.group(0)
        return m.group(0).replace('data-slide-object',
            'data-slide-object data-fx-enter="fade-up" data-fx-order="%d"' % order, 1)
    html = html[:start] + re.sub(r'<div class="slide-object\b[^"]*"[^>]*data-slide-object', stamp, chunk) + html[end:]

# --- 2. how a slide arrives ---------------------------------------------------
for sid, how in zip(slides, ['fade', 'up', 'up', 'up', 'up', 'zoom', 'up', 'up', 'up', 'fade']):
    html = html.replace('id="%s"' % sid, 'id="%s" data-transition="%s"' % (sid, how), 1)

# --- 3. a mark that morphs between two slides -------------------------------
#     Same oid on neighbouring slides, different boxes: the runtime animates
#     between them on arrival. This is the whole of "morph".
in_slide(slides[4], obj('travelling-mark', 'shape', 'left:86%;top:11%;width:7%;height:7%;',
                        shape('var(--accent, #16D342)', 'none', 10)))
in_slide(slides[5], obj('travelling-mark', 'shape', 'left:8%;top:70%;width:34%;height:8%;',
                        shape('var(--accent, #16D342)', 'none', 4)))

# --- 4. a number that counts up ---------------------------------------------
in_slide(slides[5], obj('count-demo', 'text', 'left:56%;top:60%;width:38%;height:12%;',
                        text('4700 lines', size='2.6rem', family='var(--font-display)', weight='700'),
                        ' data-fx-countup'))
in_slide(slides[5], obj('count-label', 'text', 'left:56%;top:73%;width:38%;height:6%;',
                        text('THE WHOLE RUNTIME', size='var(--small-size, 0.8rem)',
                             colour='var(--text-muted, #6b6b73)', family='var(--font-mono)')))

# --- 5. a table, styled through the attributes the panel writes --------------
def cell(head, s):
    tag = 'th' if head else 'td'
    return ('<' + tag + ' class="slide-object-text" contenteditable="false" style="'
            'border:1px solid var(--line, #e2e2df);padding:0.5em 0.7em;text-align:left;'
            'vertical-align:middle;font-weight:' + ('700' if head else '400') + ';'
            + ('background:#1a1a1e;color:#fafafa;' if head else '') + '">' + s + '</' + tag + '>')

rows = [('OBJECT', 'WHAT IT CARRIES'),
        ('Text', 'Words, and fields that stay right'),
        ('Shape', 'Fill, stroke, line style, corners'),
        ('Table', 'A header row, grid lines, padding'),
        ('Chart', 'Bars, lines, pie — several series')]
table = ('<div class="slide-object-table" style="width:100%;height:100%;overflow:hidden;border-radius:8px;">'
         '<table data-head data-grid="all" data-pad-x="0.7" data-pad-y="0.5" '
         'style="width:100%;height:100%;table-layout:fixed;border-collapse:collapse;'
         'font-family:var(--font-body);font-size:var(--small-size, 0.85rem);'
         'color:var(--text-primary, currentColor);border-radius:8px;">'
         + ''.join('<tr>' + cell(i == 0, a) + cell(i == 0, b) + '</tr>' for i, (a, b) in enumerate(rows))
         + '</table></div>')
in_slide(slides[4], obj('object-table', 'table', 'left:52%;top:34%;width:42%;height:46%;', table))

# --- 6. a chart with two series, a legend and a grid ------------------------
chart = ('<div class="slide-object-chart" style="width:100%;height:100%;pointer-events:none;position:relative;">'
         '<svg viewBox="0 0 100 70" preserveAspectRatio="none" width="100%" height="100%" '
         'style="display:block;overflow:visible;"></svg></div>')
# Real numbers, and comparable ones: a chart whose tallest bar is fifty times
# the shortest teaches nothing about the chart or the subject.
in_slide(slides[9], obj('coverage', 'chart', 'left:52%;top:30%;width:42%;height:40%;', chart,
                        ' data-chart="bar"'
                        ' data-chart-data="Main 270, Topic 109, Objects 103, Text 67, Shapes 41"'
                        ' data-chart-labels data-chart-values data-chart-grid'
                        ' data-chart-colour="#16D342"'))
in_slide(slides[9], obj('coverage-label', 'text', 'left:52%;top:71%;width:42%;height:6%;',
                        text('CHECKS, BY AREA', size='var(--small-size, 0.8rem)',
                             colour='var(--text-muted, #6b6b73)', family='var(--font-mono)',
                             align='center')))

# --- 7. a rule under each kicker, so the eye has an edge to start from ------
for sid in slides[1:]:
    # Under the kicker, above the title — at 20.5% it struck through the first
    # word of every heading.
    in_slide(sid, obj('kicker-rule-' + sid, 'shape', 'left:6%;top:14.5%;width:6%;height:0.45%;',
                      shape('var(--accent, #16D342)', 'none', 2)))

# --- 8. notes, because a deck that presents should have something to say -----
notes = {
    slides[0]: 'The file you are looking at is the software. Nothing else was installed.',
    slides[3]: 'Two rules. Everything else in the runtime is built on top of these.',
    slides[4]: 'The table and the chart on this slide were written by a script, not by a template.',
    slides[5]: 'The green mark travels from the last slide. Same id, different box.',
    slides[7]: 'The first save asks once. That is the browser, not us.',
    slides[9]: 'Twelve suites at first, twelve now — but the checks went from 270 to 645.',
}
for sid, note in notes.items():
    html = html.replace('id="%s"' % sid, 'id="%s" data-notes="%s"' % (sid, note.replace('"', '&quot;')), 1)

src.write_text(html, encoding='utf-8')
print('dressed: %d slides, %d objects, %d with motion, %d notes' % (
    len(slides),
    html.count('data-slide-object'),
    html.count('data-fx-enter'),
    len(notes)))
