# Monochrome

**Vibe:** Minimal, academic, editorial — Ivory ledger paper aesthetic

**Layout:** Cream cover with very thin Jost Light display, sparse chrome (uppercase mono labels in corners), occasional dark-ink interior slides for emphasis. Vertical sidebar labels rotated -90° on left edge.

**Typography:**
- Display: `Jost` (200/300)
- Body: `Jost` (400/500)
- Mono / accent: `JetBrains Mono · Lora (serif italic for quotes)`

**Colors:**
```css
:root {
  --iv-bg: #fafadf;       /* cream paper           */
  --iv-fg: #1a1a16;       /* black ink             */
  --iv-fg-2: #5e5e54;     /* secondary graphite    */
  --iv-fg-3: #8a8a80;     /* tertiary graphite     */
}
```

**Signature Elements:**
- Very light Jost 200/300 display type — never bold
- Black ink on cream, with no chromatic accent
- Vertical sidebar labels rotated -90° on left edge
- Top + bottom chrome strips with monospace metadata
- Thin 1px black rule as visual pause
- Optional dark slide variant (cream type on black) for emphasis
- Lora serif italic for verbatim quotes

**Source:** Ported from [zarazhangrui/beautiful-html-templates](https://github.com/zarazhangrui/beautiful-html-templates/blob/main/templates/monochrome/template.html) (MIT). Ported 4 of 16 source slides (cover, key finding statement, verbatim dark quote, end). Renamed source `.slide-sidebar` to `.iv-sidebar` to avoid collision with deck chrome `.slide-sidebar`. Class prefix `iv-` added throughout.
