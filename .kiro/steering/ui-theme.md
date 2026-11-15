---
inclusion: always
---

# UI theme: the spirit box

Visual reference: docs/design/ (read README.md there first). Rebuild those
screens in React; match their colours, fonts, copy and motion.

- Look: a cursed 1987 CRT spirit box. Near-black #050806, phosphor green
  #39ff7a for signal and primary actions, #5aa86c secondary, bone white
  #e9e4d4 for body text. Blood red (#ff3b3b, #ff5a5a, #ff8a7a) only for
  curses, errors and the seal.
- Fonts (self-hosted via @fontsource): VT323 for UI, Special Elite for
  ghost-written notes, Creepster for titles only.
- Every spooky effect must show real state (signal, bytes, progress,
  attendance, tampering). No decoration that hides function.
- Mobile-first, portrait, 390 px wide. Touch targets at least 44 px.
  Text contrast at least 4.5:1.
- Motion: everything off under prefers-reduced-motion or the Exorcise
  toggle. Never flash more than 3 times per second.
- Copy voice: spooky but clear. Every error says what happened in plain
  words, e.g. "Too heavy to cross over (148/140 bytes)".
- No emoji, no gradient washes, no flashlight-cursor effect.