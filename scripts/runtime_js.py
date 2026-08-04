#!/usr/bin/env python3
"""Assemble the JavaScript a deck carries: the vendored gesture library, then
the runtime itself.

A deck is one file. Nothing it needs may live beside it, so anything the runtime
depends on is inlined ahead of it — today that is Moveable (MIT), which drives
dragging, sizing and turning. See the GestureRig comment in runtime.js for why a
library earns its place there.

It is inlined COMPRESSED. Moveable is 245 KB of minified JavaScript, and a deck
being a file you can send is the point of this project; deflated and base64'd it
is about 101 KB, which is roughly what a bundled-and-gzipped copy costs anyone
else. The deck carries a 10 KB decompressor (tiny-inflate, MIT) and inflates the
payload as it parses.

Synchronously, and that is the whole design. The browser has DecompressionStream
and it would make tiny-inflate unnecessary — but it is a stream, so the library
would arrive a tick or two after the document, and a deck whose handles wait on
I/O is a deck that stalls wherever the renderer is throttled. It was tried: under
headless Chrome's virtual clock the promise never settled and the page never
finished loading, which is exactly the environment every claim in this project is
checked in. Inflating in-line means that by the time runtime.js runs, Moveable is
simply there, the way it would be if it were pasted in whole.

Executed by appending a script element, not by eval: appending a script with
textContent runs it synchronously, and a Content-Security-Policy that permits the
inline runtime — which every deck needs anyway — permits this too, while
`new Function` would additionally need `unsafe-eval`.

The vendored code goes AFTER runtime.js's first line and before the rest of it.
That line is the marker refresh_runtime.py looks for when it replaces the script
region, so keeping it first is what makes a deck refreshable; putting the library
after it is what puts the library inside the region being replaced, so an upgrade
replaces both together and never leaves two copies behind.

Every builder reads its JavaScript through here, so a deck built any way gets the
same bundle.
"""

from __future__ import annotations

import base64
import zlib
from pathlib import Path

# The decompressor first, in the clear; then the library, compressed.
INFLATE = 'tiny-inflate.js'
PACKED = 'moveable.min.js'

LOADER = """/* === vendor/%(name)s — %(raw)d KB of library, carried as %(packed)d KB ===
 * Raw deflate, base64'd, inflated and run right here. See scripts/runtime_js.py. */
(function () {
  if (typeof window.__tinfUncompress !== 'function') return;
  try {
    var packed = '%(payload)s';
    var src = Uint8Array.from(atob(packed), function (c) { return c.charCodeAt(0); });
    var out = new Uint8Array(%(rawbytes)d);
    window.__tinfUncompress(src, out);
    var el = document.createElement('script');
    el.textContent = new TextDecoder('utf-8').decode(out);
    /* Appending runs it, synchronously, before this function returns. */
    (document.head || document.documentElement).appendChild(el);
    el.remove();
  } catch (e) {
    /* A deck with no gesture library still opens, edits, saves and presents.
     * It just cannot be dragged, and saying so beats failing silently. */
    if (window.console) console.warn('deck: gesture library unavailable', e);
  }
  delete window.__tinfUncompress;
})();"""


def runtime_js(runtime_dir: Path) -> str:
    """runtime.js with its dependencies inlined, ready to drop in a <script>."""
    body = (runtime_dir / 'runtime.js').read_text(encoding='utf-8')
    head, _, rest = body.partition('\n')

    parts = [head]

    lib = runtime_dir / 'vendor' / PACKED
    inflate = runtime_dir / 'vendor' / INFLATE
    if lib.is_file() and inflate.is_file():
        raw = lib.read_bytes()
        # Raw deflate (no zlib or gzip wrapper): tiny-inflate reads exactly that.
        packed = zlib.compress(raw, 9)[2:-4]
        # Lossless or nothing: a deck carrying a library that inflates to
        # something else would fail in the browser, far from here.
        assert zlib.decompress(packed, -15) == raw, 'deflate round-trip failed'
        payload = base64.b64encode(packed).decode('ascii')
        parts.append(f'/* === vendor/{INFLATE} === */')
        parts.append(inflate.read_text(encoding='utf-8').rstrip())
        parts.append(LOADER % {
            'name': PACKED,
            'raw': round(len(raw) / 1024),
            'packed': round(len(payload) / 1024),
            'rawbytes': len(raw),
            'payload': payload,
        })
    else:
        # Better than refusing to build: everything except gestures still works.
        missing = PACKED if not lib.is_file() else INFLATE
        parts.append(f'// missing vendor/{missing} — gestures will be unavailable')

    parts.append(rest)
    return '\n'.join(parts)
