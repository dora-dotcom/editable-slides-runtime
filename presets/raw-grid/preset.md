# Raw Grid

**Vibe:** Bold, experimental — neobrutalist with thick borders and offset shadows

**Layout:** Hard-edged grid with thick 3px black borders, 6px offset shadows, and color-block stats. Cover splits into brand+title on left and a vertical city list on right.

**Typography:**
- Display: `Inter` (900)
- Body: `Inter` (500/700)

**Colors:**
```css
:root {
  --rg-black: #0a0a0a;
  --rg-pink: #f2d4cf;
  --rg-green: #e5edd6;
  --rg-border: 3px solid var(--rg-black);
  --rg-shadow: 6px 6px 0 var(--rg-black);
}
```

**Signature Elements:**
- 3px black borders + 6px offset shadows (signature brutalism)
- Big uppercase Inter 900 display type
- Color-block stat rows (white/pink/green/black)
- Compact list items with bottom borders
- Pink-field statement slide with oversized quote mark

**Source:** Ported from [zarazhangrui/beautiful-html-templates](https://github.com/zarazhangrui/beautiful-html-templates/blob/main/templates/raw-grid/template.html) (MIT). Ported 2 of 10 slides (cover, statement).
