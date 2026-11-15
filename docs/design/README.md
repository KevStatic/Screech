# Screech UI mockup (design reference)

Source of the clickable mockup made for the Screech app. These `.dc.html` files are
**reference only**: they use a design-canvas format (`<x-dc>`, `{{holes}}`, `sc-for`)
and do not run on their own. Read them for exact colours, fonts, sizes, copy and
animations, then rebuild the screens in React in `apps/web`.

| File | Screen |
| --- | --- |
| `Main.dc.html` | 1 · Awaken (boot, mic unlock, Exorcise toggle) |
| `Speak.dc.html` | 2 · Speak (tarot type cards, byte candle, seal toggle, SCREECH key) |
| `Transmit.dc.html` | 3 · Screeching (oscilloscope, letters into the grille, ghost progress) |
| `Listen.dc.html` | 4 · Listen (spectrogram, Screech band, K-II meter) |
| `Reveal.dc.html` | 5 · The reveal (Ouija spelling, Wi-Fi action card, join QR) |
| `Cursed.dc.html` | 6 · Cursed packet (auth-failed screen) |
| `Seance.dc.html` | 7 · Séance room, host screen 1280×800 |

## Tokens

- Background `#050806`; panel `#07110a` / `#08130b`; borders `#2f5a3a`, `#1f3a27`
- Phosphor green `#39ff7a` (signal, primary); secondary green `#5aa86c`
- Bone white `#e9e4d4` (body text)
- Blood red `#ff3b3b` / `#ff5a5a`, salmon `#ff8a7a`: only curses, errors and the seal
- Fonts: VT323 (UI), Special Elite (ghost-written notes), Creepster (titles only)
- Phone screens 390×844; CRT scanlines and vignette overlay; all motion off under
  `prefers-reduced-motion` or the Exorcise toggle; no flashing faster than 3 per second
