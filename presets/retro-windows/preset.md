# Retro Windows

**Vibe:** Retro, pixel, nostalgic — Windows 95 nostalgia in HTML form

**Layout:** Every slide is a beveled "window" with navy title bar, control buttons, and Win-95 era panels. Gray desktop surround. Optional CRT scan-line overlay.

**Typography:**
- Display: `Press Start 2P` (400)
- Body: `"MS Sans Serif", "Segoe UI", Tahoma, sans-serif` (400/700)
- Mono / accent: `VT323`

**Colors:**
```css
:root {
  --rw-bg-gray: #c0c0c0;
  --rw-bg-light: #d4d0c8;
  --rw-bg-dark: #808080;
  --rw-blue-navy: #000080;
  --rw-white: #ffffff;
  --rw-btn-shadow: #404040;
  --rw-green: #008000;
}
```

**Signature Elements:**
- Beveled "win-window" container with navy gradient title bar
- Title-bar with P/A/? icon + filename + _/[]/X controls
- Group boxes with title overlapping top border
- Sunken panels (white inset with shadow border)
- Press Start 2P pixel display type for slide titles
- VT323 monospace for marquee strings
- CRT scan-line overlay (subtle)

**Source:** Ported from [zarazhangrui/beautiful-html-templates](https://github.com/zarazhangrui/beautiful-html-templates/blob/main/templates/retro-windows/template.html) (MIT). Ported 3 of 10 source slides (cover, agenda, shutdown). Renamed source classes (.win-*, .panel-*, .btn-retro) to .rw-* prefix to avoid collisions with deck chrome. Source `.progress-bar` class clashed with deck progress bar so the in-slide variant was kept inside the panels.
