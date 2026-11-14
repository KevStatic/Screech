# Tech Stack

- pnpm monorepo (workspaces: `packages/*`, `apps/*`)
- TypeScript 5.6, strict mode
- `apps/web`: React 18 + Vite 5
- `packages/core`: Vitest + fast-check (property-based tests)
- Audio: ggwave compiled to WASM, via the Web Audio API
- `apps/checkin-api`: stack not chosen yet

## Conventions
- All protocol, compression and crypto logic lives in packages/core as pure functions; apps only call it
- No `any`; prefer explicit types for public APIs
- Every core function gets property-based tests (fast-check) as well as unit tests
- Run tests with `pnpm test` from the root
- Must work on both mobile Safari (iOS) and Chrome (Android and desktop)
- Mic access needs HTTPS and a user gesture; create or resume the AudioContext inside a tap handler
- Request the mic with echoCancellation, noiseSuppression and autoGainControl turned off, so the browser doesn't filter out the tones
- Never hardcode the sample rate (Safari often uses 44.1 kHz, Chrome 48 kHz); read it from the AudioContext