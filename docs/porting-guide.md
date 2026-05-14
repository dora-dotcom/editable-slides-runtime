# Porting external templates

How to adapt a third-party HTML slide template (with its own minimal runtime) into the `frontend-slides-editable` standard. Used during the initial import of zarazhang/beautiful-html-templates.

## Compatibility checklist

The editable runtime requires this DOM contract:

1. Every slide is `<section class="slide" id="slide-N">` (not `<div>`).
2. Movable content lives inside `.slide-edit-layer` as `[data-slide-object][data-oid]` (with `data-object-type="text"` or `"graphic"`).
3. Static chrome (background pseudo-elements, fixed nav bars) may sit outside `.slide-edit-layer`.
4. Slides are wrapped in `<div class="slides-offset">` so the deck runtime can scope its queries.

## Steps

1. **Inspect the source** — read the upstream HTML. Identify:
   - Slide-level wrapper class
   - Whether content is structural (HTML headings/paragraphs) or absolutely-positioned
   - Custom JS for slide navigation (will be removed)

2. **Restructure markup**
   - Rename slide wrapper to `<section class="slide" id="slide-N">`.
   - Identify movable copy (titles, body, graphics) → wrap each as a `[data-slide-object]` with a unique `data-oid` (e.g. `s0-title`, `s0-bullets`).
   - Add `.slide-edit-layer` as a child of `<section.slide>`.
   - Convert positioning to percentage-based `left`/`top`/`width` on each object so it's editor-draggable.

3. **Replace the runtime**
   - Delete the upstream `<script>` block(s).
   - Inline the canonical editable runtime — currently the full `<script>` block from `editable-deck-reference.html` in `frontend-slides-editable`.

4. **Add deck chrome**
   - Top-left hover anchor with `#editToggle`, `#pagesToggle`, `#deckEditChrome`, `#btnSave`, `#btnUndo`, `#btnRedo`, `#btnDoneEdit`.
   - `<aside id="slideSidebar">` with filmstrip list, `#btnAddImage`, `#btnExport`, `#btnExportPdf`.
   - `<div class="rte-toolbar" id="rteToolbar">` for inline formatting.
   - `<div class="progress-bar" id="progressBar">` and `<nav class="nav-dots" id="navDots">`.

5. **Map deck chrome tokens**
   - Add deck chrome variables to `:root` — pick light or dark contrast set based on the template's slide background. See `STYLE_PRESETS.md` "Deck chrome tokens" in `frontend-slides-editable`.

6. **Preserve signature elements**
   - Keep the upstream's distinctive CSS (palette, fonts, layout signatures).
   - Some signatures need adaptation — e.g., transform-based animations should be kept CSS-only with `prefers-reduced-motion` support.

7. **Test**
   - Open in a browser; press `E` to enter edit mode; drag, multi-select, resize an object.
   - Click `Export PDF`; verify a new tab opens with the print dialog.
   - Check the console for `[deck-runtime] Missing required element` errors.

## Automation

`scripts/port_to_editable.py` automates steps 3–4 (runtime injection + chrome scaffolding). Step 2 (semantic markup restructure) is currently manual since it requires judgment about what's a movable object vs static chrome.

## Pitfalls (learned the hard way)

### 1. Never write literal `</script>` inside a `<script>` block

The HTML parser runs **before** the JS parser. Any `</script>` text inside a script tag — even inside a JS comment or string — closes the script tag prematurely. The rest of your JS becomes plain HTML text and never executes.

❌ This silently breaks the entire runtime:
```html
<script>
// Drop-in: wrap inside <script>...</script> before </body>
(function () { /* never runs */ })();
</script>
```

✓ Use an escape, alternate wording, or string concatenation:
```js
// Drop-in: wrap inside <\/script>-balanced tags
// Drop-in: paste inside a script tag before </body>
'<' + '/script>'    // when you must produce the literal in a string
```

This bit us in the initial extraction of `runtime/runtime.js` — the helpful header comment killed the runtime in every ported template until we removed the literal closing tag from the comment.

### 2. Don't append code outside the runtime IIFE

`runtime/runtime.js` is a complete self-contained IIFE: `(function () { ... })();`. Its `deck`, `editor`, `sidebar`, `history` etc. are local to that closure. **Do not append code after the closing `})();`** that references them — it will be a `ReferenceError` at runtime.

Equally, **do not duplicate sections** of the runtime by manually re-pasting "// Startup self-check" or similar markers around your build template — it produces unmatched IIFE closes (`Unexpected token '}'`) that break parsing.

Recommended assembly pattern (used by `scripts/port_to_editable.py` and the bold-poster build):

```python
html = f"""
...
<script>
{runtime_js}        # the entire IIFE, completely unchanged
</script>
</body>
"""
```

If you need an external hook (e.g., custom analytics on slide change), put it BEFORE the runtime `<script>` block in a separate `<script>` tag, or expose it from inside the IIFE via `window.deckHooks = {...}` and call it from outside afterward.
