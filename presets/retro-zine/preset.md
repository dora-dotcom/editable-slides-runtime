# Retro Zine

**Vibe:** Riso-printed zine in HTML form — limited palette, mixed Bebas Neue + handwritten Caveat

**Layout:** Beige paper canvas with subtle riso-style noise overlay. Massive Bebas Neue display titles in black ink, with second-tier green accents and handwritten Caveat asides.

**Typography:**
- Display: `Bebas Neue` (400)
- Body: `Caveat` (500/600)
- Mono / accent: `Space Mono (meta labels)`

**Colors:**
```css
:root {
  --rz-bg: #C8B99A;        /* beige paper           */
  --rz-green: #008F4D;     /* spot color            */
  --rz-black: #1A1A1A;     /* main ink              */
  --rz-white: #F4EFE6;     /* knockout              */
}
```

**Signature Elements:**
- Beige paper canvas with multi-stop dot-noise overlay (multiply blend)
- Bebas Neue oversized condensed display in black
- One spot-color (green #008F4D) used sparingly for accent
- Caveat handwriting font for second-voice annotations
- Space Mono uppercase meta labels

**Source:** Ported from [zarazhangrui/beautiful-html-templates](https://github.com/zarazhangrui/beautiful-html-templates/blob/main/templates/retro-zine/template.html) (MIT). Ported 2 of 10 slides (cover, feature).
