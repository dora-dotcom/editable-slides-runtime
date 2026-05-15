# 8-Bit Orbit

**Vibe:** Pixel-art neon arcade aesthetic on a deep navy void

**Layout:** Dark navy void with a faint cyan grid + CRT scanlines. Titles glow with 3-color (pink/cyan/yellow) text-shadow layers. Feature cards bordered in neon glow.

**Typography:**
- Display: `Tektur` (700)
- Body: `Chakra Petch` (400/500)
- Mono / accent: `Press Start 2P (pixel fallback)`

**Colors:**
```css
:root {
  --bo-pink: #F0A6CA;
  --bo-cyan: #5EDCF4;
  --bo-yellow: #F4D03F;
  --bo-navy: #0F1B3D;
  --bo-void: #0A0E27;
}
```

**Signature Elements:**
- Faint cyan grid overlay on deep navy void
- CRT scanlines as constant texture
- 3-color text-shadow on hero (pink → cyan)
- Neon-bordered feature cards with glow box-shadows
- Tektur display + Chakra Petch body — both geometric

**Source:** Ported from [zarazhangrui/beautiful-html-templates](https://github.com/zarazhangrui/beautiful-html-templates/blob/main/templates/8-bit-orbit/template.html) (MIT). Ported 2 of 10 slides (cover, features).
