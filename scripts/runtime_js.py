#!/usr/bin/env python3
"""Assemble the JavaScript a deck carries: the vendored gesture library, then
the runtime itself.

A deck is one file. Nothing it needs may live beside it, so anything the runtime
depends on is inlined ahead of it — today that is Moveable (MIT), which drives
dragging, sizing and turning. See the GestureRig comment in runtime.js for why a
library earns its ~240 KB here.

The library goes AFTER runtime.js's first line and before the rest of it. That
line is the marker refresh_runtime.py looks for when it replaces the script
region, so keeping it first is what makes a deck refreshable; putting the
library after it is what puts the library inside the region being replaced, so
an upgrade replaces both together and never leaves two copies behind.

Every builder reads its JavaScript through here, so a deck built any way gets
the same bundle.
"""

from __future__ import annotations

from pathlib import Path

VENDOR = ('moveable.min.js',)


def runtime_js(runtime_dir: Path) -> str:
    """runtime.js with its dependencies inlined, ready to drop in a <script>."""
    body = (runtime_dir / 'runtime.js').read_text(encoding='utf-8')
    head, _, rest = body.partition('\n')

    parts = [head]
    for name in VENDOR:
        path = runtime_dir / 'vendor' / name
        if not path.is_file():
            # A deck without the library still opens, selects and presents; it
            # just cannot be dragged. Better than refusing to build.
            parts.append(f'// missing vendor/{name} — gestures will be unavailable')
            continue
        parts.append(f'/* === vendor/{name} === */')
        parts.append(path.read_text(encoding='utf-8').rstrip())
    parts.append(rest)
    return '\n'.join(parts)
