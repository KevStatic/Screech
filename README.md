<div align="center">

```
 ░██████╗░█████╗░██████╗░███████╗███████╗░█████╗░██╗░░██╗
 ██╔════╝██╔══██╗██╔══██╗██╔════╝██╔════╝██╔══██╗██║░░██║
 ╚█████╗░██║░░╚═╝██████╔╝█████╗░░█████╗░░██║░░╚═╝███████║
 ░╚═══██╗██║░░██╗██╔══██╗██╔══╝░░██╔══╝░░██║░░██╗██╔══██║
 ██████╔╝╚█████╔╝██║░░██║███████╗███████╗╚█████╔╝██║░░██║
 ╚═════╝░░╚════╝░╚═╝░░╚═╝╚══════╝╚══════╝░╚════╝░╚═╝░░╚═╝
```

### The dead modem is awake. It has something to tell the room.

**Send a Wi-Fi password, a link, a contact card or a check-in code to every phone in earshot.
One sound. No pairing. Nothing to install. The message itself travels through the air, not the internet.**

`[ MIT ]` `[ TypeScript ]` `[ React + Vite ]` `[ ggwave / WASM ]` `[ Kiroween 2026 · Resurrection ]`

</div>

---

## > TRY IT IN 60 SECONDS

Live demo: coming soon

1. Open the site on a laptop and on a phone.
2. Tap **Awaken** on both. This unlocks the speaker and the microphone.
3. On one device, type a message and hold **SCREECH**.
4. Watch the other device spell it out on the Ouija board.

---

## > SIGNAL DETECTED

Remember the dial-up modem? That shriek of a machine shouting data down a phone line?
Screech digs it up. It is buried in the browser again and it still works.

A phone or laptop **screeches** a small message. Every other device in the room **listens through its
microphone**, decodes the sound, and shows what was said. The screech is the transmission. Nobody
scans a QR code, taps a code in, joins a network or pairs anything.

```
   [ HOST ]  ))))  ~~~~ kreeeEEEEEE-bzzzt-kreeEEE ~~~~  ((((  [ EVERYONE ELSE ]
   types it                  one sound                          hears it
   taps SCREECH         8 to 16 bytes per second                 reads it
```

It is built with [ggwave](https://github.com/ggerganov/ggwave), which turns bytes into audible FSK tones
(frequency-shift keying, the same idea the old modems used). It is compiled to WebAssembly and runs in
the page with the Web Audio API.

## > WHO IS IT FOR

Event hosts, teachers, meetup organisers and the people in their rooms.

- "The Wi-Fi password is on a sticky note behind the projector." Screech it instead.
- "Everyone open this link." Screech it once.
- "Who actually showed up?" Run a séance and read the attendance list.

## > WHAT IT CAN DO

| Rite | What happens |
| --- | --- |
| **Speak and Listen** | Send text, a link, Wi-Fi credentials or a contact card. Receivers see it spelled out on a Ouija board, with a one-tap action (join the network, open the link, save the contact). |
| **The Séance** | Presence check-in. The host's laptop screeches a rolling code. Attendees hear it, tap *Join*, and their candle is lit in the circle. The host downloads the attendance as CSV. |
| **Ghost Hunt** | A party game. Hide phones around a venue. Each one screeches a clue to the next hiding place. |
| **Haunting sounds** | Boot hum, planchette scrape, whispers and static, all computed at runtime. There are no audio files. |

Sealed (encrypted) messages are built and tested in packages/core but not yet in the app.

Payloads stay small on purpose. One screech carries at most 140 bytes, and URLs and Wi-Fi details are
compressed to fit. Files and images are out of scope, since sound is slow.

## > THE HAUNTING IS FUNCTIONAL

The interface is a cursed 1987 CRT spirit box: near-black glass, phosphor green, bone white text,
and blood red kept for curses and errors. It looks like a haunting, but **no effect is decoration**.
Each one shows real state:

| Spooky thing | What it really tells you |
| --- | --- |
| Oscilloscope and spectrogram | Signal strength, and whether the screech band is being heard |
| K-II meter | How loud the incoming tone is |
| Ghost progress and letters falling into the grille | How much of the message has been sent or received |
| Byte candle | How much of the byte budget is used |
| Ouija spelling | The message arriving, letter by letter |
| Candle circle | One lit candle per person who checked in |
| Blood red | Something is wrong: an error or a garbled packet |

Motion turns off under `prefers-reduced-motion` or the **Exorcise** toggle, and nothing flashes more than
3 times per second. Errors are written in plain words, for example *"Too heavy to cross over (148/140 bytes)."*

## > LIMITS (HONEST ONES)

- **Range is about 2 m.** The screech is built for a table or a small room, not a lecture hall.
- **It is slow.** ggwave sends 8 to 16 bytes per second, so a screech holds at most 140 bytes and takes about 9 seconds.
- **Loud rooms and music drown it.** The tones sit in the same range as speech and songs.
- **The iPhone silent switch mutes it.** Flip it off on the sending phone.
- **It does not survive video calls.** Call audio processing strips the tones. Tested on Google Meet.
- **The Séance needs an internet connection.** Plain sending and listening do not. Check-in and the attendance list go through the check-in API.

## > PRIVACY

- No accounts and no cookies.
- The Séance stores only a name, a random device ID and a time for each check-in. The séance and its check-ins are deleted after 24 hours.
- The check-in code changes every 30 seconds.
- The host secret stays in the host's browser tab.

## > SUMMON IT

You need Node 20 or newer and pnpm 9 or newer.

```bash
pnpm install
pnpm --filter @screech/core build   # the web app reads core from its dist folder, so build it first
pnpm test                           # core, check-in API and web tests
pnpm --filter @screech/web dev
```

Browsers only allow microphone access on **HTTPS** and after a **tap**, so test on real phones
through a tunnel. To run the web app and the check-in API together:

`pnpm dev` needs the Netlify CLI: `npm i -g netlify-cli`.

```bash
pnpm dev                                       # netlify dev --filter @screech/web, on http://localhost:8888
cloudflared tunnel --url http://localhost:8888 # gives you an HTTPS URL for your phones
```

Open the tunnel URL on every device, the laptop included. Full steps are in
[`apps/checkin-api/README.md`](apps/checkin-api/README.md).

Tips for a clean transmission:

- Turn the volume up and keep devices within about 2 metres; the screech is built for a table or a small room. Room noise hurts.
- The app asks the microphone for raw audio (echo cancellation, noise suppression and auto-gain off), because browser filters eat the tones.
- It works on iOS Safari and Chrome (Android and desktop). The sample rate is read from the browser, never hardcoded.

## > ANATOMY

```
Screech/
├── packages/core/      Protocol, compression and crypto as pure TypeScript functions.
│                       Tested with Vitest and fast-check (property-based tests).
├── apps/web/           The haunted radio: React 18 + Vite 5, ggwave in WASM, Web Audio.
├── apps/checkin-api/   Netlify Functions + Blobs behind the Séance (create, check in, end).
├── apps/spike/         Throwaway ggwave sound test. Not part of the product.
├── docs/design/        Clickable mockups of every screen (colours, fonts, copy, motion).
└── .kiro/              Specs, steering and hooks used to build it.
```

A screech is a small binary frame: a magic byte, a type (text, URL, Wi-Fi, contact, check-in, hunt clue),
flags and a body. All of that logic lives in `packages/core`. The apps only call it.

## > BUILT WITH KIRO

Screech was built for **Kiroween 2026** in the **Resurrection** category, with Kiro doing a lot of the
digging. Everything lives in `.kiro/`.

**Specs.** Each has requirements, a design and a task list. All tasks are done.

| Spec | Covers | Tasks (with sub-tasks) |
| --- | --- | --- |
| `screech-protocol` | Frame layout, bodies, compression, multipart codec | 14 (68) |
| `spirit-box-app` | The web app: Awaken, Speak, Listen, Reveal screens | 18 (99) |
| `haunting-sounds` | Procedural horror audio, no sound files | 13 (70) |
| `seance` | Presence check-in, candle circle, check-in API | 13 (85) |
| `ghost-hunt` | Clue-chain party game | 12 (79) |

**Steering.** Four files are always loaded and one runs on demand.

| File | What it enforces |
| --- | --- |
| `product.md` | What Screech is, who it is for, what is out of scope, payload size limits |
| `tech.md` | pnpm monorepo, strict TypeScript, no `any`, all protocol logic as pure functions in `packages/core`, iOS Safari and Chrome rules for the microphone and sample rate |
| `structure.md` | Where each kind of code lives |
| `ui-theme.md` | Palette, fonts, 44 px touch targets, contrast, motion limits, plain-words errors, "every spooky effect must show real state" |
| `log.md` (manual) | Run `/log` to append a dated entry to [`KIRO_LOG.md`](KIRO_LOG.md) |

**Hook.** `run-core-tests-on-save` runs the `packages/core` tests, property-based ones included, whenever a
TypeScript file in `packages/core/src` or `packages/core/tests` is saved.

**Tests.** `pnpm test` runs **1,835 tests** in **225 test files** (core 421, check-in API 137, web 1,277).
**123** of those files use fast-check for property-based tests.

## > ABANDON ALL HOPE

If the room is quiet enough, you can hear it.

## > CREDITS

- [ggwave](https://github.com/ggerganov/ggwave) by Georgi Gerganov (MIT), the sound-to-data engine.
- Fonts, self-hosted through [Fontsource](https://fontsource.org): **VT323** (SIL OFL 1.1), **Special Elite** (Apache 2.0) and **Creepster** (SIL OFL 1.1).
- [fast-check](https://fast-check.dev), [Vitest](https://vitest.dev), [React](https://react.dev), [Vite](https://vitejs.dev) and [Netlify](https://www.netlify.com) (Functions and Blobs).

<div align="center">

*Screech is a project by **ItzKev**, released under the [MIT License](LICENSE).*

</div>
