# Bold Poster

**Vibe:** Bold, editorial, poster-energy. Annual-report meets gallery print.

**Layout:** Each slide is its own poster composition. Hero slide stacks oversized display type at three angles (straight / rotated -4° / rotated +2°). Statement slide drops on a saturated red field. Pillar slide is three equal vertical columns alternating cream/white. Closing slide is a giant rotated word with subtitle and link strip.

**Typography:**
- Display: `Shrikhand` (cursive, single weight)
- Body: `Libre Baskerville` (serif, italics for soft body)
- Meta: `Space Grotesk` (sans, for uppercase labels and bullet lists)

**Colors:**
```css
:root {
  --bp-bg:    #FFFFFF;
  --bp-dark:  #1C1410;
  --bp-red:   #D8000F;
  --bp-light: #F5F2EF;
}
```

**Signature Elements:**
- Oversized Shrikhand display type — single accent word in red, rotated -4° to -5°
- Red statement slide (`.slide-red`) with 3-layer text-shadow for poster relief
- Pillar columns with thick 3px black dividers, alternating bone/white backgrounds
- Body text in italic `Libre Baskerville` — never roman
- Uppercase `Space Grotesk` micro-labels for context (Annual Report, etc.)
- `Thank You` closing word rotated -5° as a sign-off

**Slide variants included:**
- `slide-hero` — title cover with multi-line display stack + tagline
- `slide-red` — single quote/statement on red ground
- `slide-pillars` — three-column comparison
- `slide-close` — oversized sign-off

**Editable runtime notes:**
- Source's `position:absolute; opacity:0` slide-system was replaced with scroll-snap.
- All movable copy is wrapped as `[data-slide-object][data-oid][data-object-type]` inside `.slide-edit-layer`.
- Deck chrome tokens map to light-deck contrast set with red accent.

**Source:** Ported from [zarazhangrui/beautiful-html-templates](https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/bold-poster) (MIT). 4 of the source's 10 slides selected.
