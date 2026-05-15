# Block Frame

**Vibe:** Bold, experimental, neobrutalist

**Layout:** Slides anchored to thick-bordered frames with offset drop-shadows. Pastel-neon decorative blocks (pink square, green circle, yellow tab) anchored to corners.

**Typography:**
- Display: `Inter` (900)
- Body: `Inter` (400/500)
- Mono / accent: `Space Grotesk`

**Colors:**
```css
:root {
  --bf-pink: #FE90E8;
  --bf-blue: #C0F7FE;
  --bf-green: #99E885;
  --bf-yellow: #F7CB46;
  --bf-cream: #FFDC8B;
  --bf-black: #000000;
  --bf-offwhite: #FFFDF5;
  --bf-border: 4px solid var(--bf-black);
  --bf-shadow: 8px 8px 0px var(--bf-black);
}
```

**Signature Elements:**
- 4px solid black borders on every block
- Offset drop-shadows (8px black, no blur)
- Pastel-neon color block decorations rotated at ±12°
- Yellow accent tab tilted -3° as call-to-action
- Dot-grid background patches as texture
- Big black uppercase Inter 900 display type

**Source:** Ported from [zarazhangrui/beautiful-html-templates](https://github.com/zarazhangrui/beautiful-html-templates/blob/main/templates/block-frame/template.html) (MIT). Ported 4 of 10 source slides (hero, three-card features, quote, closing). Source used position:absolute slide system — replaced with scroll-snap.
