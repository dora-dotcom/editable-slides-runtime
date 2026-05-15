# Scatterbrain

**Vibe:** Playful, warm, hand-crafted — Post-it inspired

**Layout:** Cork-board / paper / warm gradient backgrounds. Tilted Post-it notes (yellow, blue, pink, green) with shadow + thumbtack pins as the primary visual unit. Light hand-drawn SVG doodles in corners.

**Typography:**
- Display: `Shrikhand` (400)
- Body: `Zilla Slab` (400/500)
- Mono / accent: `Caveat (handwritten)`

**Colors:**
```css
:root {
  --sc-yellow: #ffe066;
  --sc-blue:   #a5d8ff;
  --sc-pink:   #ffc9c9;
  --sc-green:  #b2f2bb;
  --sc-orange: #ffcc80;
  --sc-paper:  #f7f5f0;
  --sc-ink:    #2d2a26;
}
```

**Signature Elements:**
- Post-it notes with linear-gradient shading + soft drop shadow
- Thumbtack ::before pin (red / blue / green / gold) at top center
- Slight rotation (-3° to +3°) on each note for hand-pinned feel
- Caveat handwritten font for casual / annotated labels
- Shrikhand big-display headlines
- Cork-board background (radial gradients + paper noise)
- Light SVG doodles (circles, squiggly lines) in corners

**Source:** Ported from [zarazhangrui/beautiful-html-templates](https://github.com/zarazhangrui/beautiful-html-templates/blob/main/templates/scatterbrain/template.html) (MIT). Ported 3 of 10 source slides (title cluster, two-column discovery/solution, closing cluster). Class prefix `sc-` added to all post-it/pin/typography classes to avoid CSS collisions.
