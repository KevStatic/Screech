# Implementation Plan: Haunting Sounds

## Overview

TypeScript in `apps/web`. Build bottom-up: pure DSP and synth in `src/logic`, test-only FFT helpers, pure rules, pref and hint modules, then the Web Audio player in `src/audio`, then hooks, UI and per-screen wiring. Every task and sub-task is required, including all property tests (Properties 1 to 31) and unit tests. Paths below are relative to `apps/web/`. Each property test file starts with the comment `Feature: haunting-sounds, Property <n>: <text>`, runs at least 100 cases, and uses a separate file per property so the sub-tasks stay independent.

## Tasks

- [x] 1. DSP foundation and test helpers
  - [x] 1.1 Create `src/logic/haunt-dsp.ts` with unit tests
    - `createPrng` (mulberry32), `assertSampleRate` (RangeError text), `lowpass8`, `highpass4`, `runCascade`, `hannRise`, `finishSound`, `finishLoop`, `STEP_GUARD` 0.045, finite-value assertion
    - No `Math.random`, `Date`, DOM, or 44100/48000 literals; explicit types, no `any`
    - _Requirements: 1.3, 1.4, 1.6, 1.8, 2.14, 3.1, 3.2, 3.4, 3.5, 11.7_
  - [x] 1.2 Create test-only `tests/logic/haunt-fft.ts` with a self-test
    - Radix-2 FFT, Hann window, zero-pad to a power of two, `outOfBandRatio`, `bandShare`, `peakBandShare`, `dominantFrequency`, and a spectrum cache keyed by name, rate and seed
    - _Requirements: 2.6, 2.15_

- [x] 2. Synth constants, generators and checks
  - [x] 2.1 Create `src/logic/haunt-synth.ts`: constants, tables, awaken and drone
    - Export all constants from the design's constants table, `SOUND_NAMES`, `SoundName`, `OneShotName`, `SOUND_SPECS`, `FIXED_SEEDS`, `FILTER_CORNERS`, `partialsOf`, `AWAKEN_LAYOUT`, `scrapeSeed`, `generateSound`
    - Implement `generateAwaken` (thunk, rising hum, 4 ticks) and `generateDrone` (loop-periodic partials, swell, `4 * rate + 1` samples)
    - _Requirements: 1.1, 1.9, 2.5, 2.12, 2.13, 3.9, 4.1, 4.2, 8.5_
  - [x] 2.2 Add the other six generators to `haunt-synth.ts`
    - `generateCardFlip`, `generateCandleCrackle`, `generatePlanchetteScrape`, `generateWhisper`, `generateBrokenCrackle`, `generateSealedThud` using band-passed noise and harmonic recipes from the design
    - _Requirements: 1.1, 1.2, 1.10, 2.10, 2.13, 2.14, 7.3, 7.5, 8.9_
  - [x] 2.3 Create `src/logic/haunt-check.ts` with unit tests
    - `peakOf`, `attackTimeMs`, `maxStep`, `checkSound` (edges, peak vs `SOUND_SPECS`, attack, step, drone level)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.9, 3.10_
  - [x] 2.4 Write `tests/logic/haunt-synth.test.ts` unit tests
    - One example per generator and export, constant values, `RangeError` text, peak table at most 0.19, drone partials are multiples of `LOOP_BASE_HZ`, fixed-seed Phone_Band_Share at both rates
    - _Requirements: 1.8, 2.5, 2.9, 2.12, 3.7, 11.2_

- [x] 3. Property tests for the synth
  - [x] 3.1 Property 1: Determinism
    - **Property 1: Determinism**
    - **Validates: Requirements 1.4**
  - [x] 3.2 Property 2: Seed sensitivity
    - **Property 2: Seed sensitivity**
    - **Validates: Requirements 1.5**
  - [x] 3.3 Property 3: Valid shape and duration
    - **Property 3: Valid shape and duration**
    - **Validates: Requirements 1.2, 1.6, 1.7, 8.9**
  - [x] 3.4 Property 4: Bad sample rates are rejected
    - **Property 4: Bad sample rates are rejected**
    - **Validates: Requirements 1.8, 4.3**
  - [x] 3.5 Property 5: Energy stays out of the Screech_Band
    - **Property 5: Energy stays out of the Screech_Band**
    - 44100 and 48000 Hz, seeds 0 to 4294967295, timeout 60 s, failure message names sound, rate, seed and ratio
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.7, 2.8, 2.9**
  - [x] 3.6 Property 6: Silent edges
    - **Property 6: Silent edges**
    - **Validates: Requirements 3.1, 3.2, 4.1**
  - [x] 3.7 Property 7: Level limit
    - **Property 7: Level limit**
    - **Validates: Requirements 3.3, 3.9**
  - [x] 3.8 Property 8: Gentle attack
    - **Property 8: Gentle attack**
    - Recompute attack time with a plain loop in the test as well as `attackTimeMs`
    - **Validates: Requirements 3.4**
  - [x] 3.9 Property 9: Smooth steps
    - **Property 9: Smooth steps**
    - **Validates: Requirements 3.5**
  - [x] 3.10 Property 10: Drone loop seam
    - **Property 10: Drone loop seam**
    - **Validates: Requirements 4.2**
  - [x] 3.11 Property 11: Awaken has three ordered parts
    - **Property 11: Awaken has three ordered parts**
    - **Validates: Requirements 1.9**
  - [x] 3.12 Property 12: Whisper is spread noise
    - **Property 12: Whisper is spread noise**
    - **Validates: Requirements 1.10**
  - [x] 3.13 Property 13: A packet is louder than every haunting sound
    - **Property 13: A packet is louder than every haunting sound**
    - `tests/audio/haunt-transmit-peak.test.ts` using `loadEngine` and `encode` at `TRANSMIT_VOLUME`; includes the unit assertion `HAUNT_PEAK_LIMIT` < packet peak
    - **Validates: Requirements 3.7**
  - [x] 3.14 Property 24: Most energy lies in the Phone_Band
    - **Property 24: Most energy lies in the Phone_Band**
    - **Validates: Requirements 2.10, 2.11, 2.15, 2.16**
  - [x] 3.15 Property 25: No sine partial above the Partial_Limit
    - **Property 25: No sine partial above the Partial_Limit**
    - **Validates: Requirements 2.12, 2.13**
  - [x] 3.16 Property 26: Filter corners keep noise in the Phone_Band and under the ceiling
    - **Property 26: Filter corners keep noise in the Phone_Band and under the ceiling**
    - **Validates: Requirements 2.14, 2.9**

- [x] 4. Checkpoint - synth
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Ouija change and haunt-rules decision logic
  - [x] 5.1 Add `isLetter`, `SpelledText` and `spellShown` to `src/logic/ouija.ts`, extend `tests/logic/ouija.test.ts`
    - Keep `spellProgress` and its constants unchanged; `spellShown` counts Letters and maps back to code point positions
    - _Requirements: 8.1, 8.3, 8.6_
  - [x] 5.2 Property 27: Stepping counts Letters and matches the scrape plan
    - **Property 27: Stepping counts Letters and matches the scrape plan**
    - Extend `tests/logic/ouija.property.test.ts`
    - **Validates: Requirements 8.1, 8.3, 8.6**
  - [x] 5.3 Create `src/logic/haunt-rules.ts` with `tests/logic/haunt-rules.test.ts`
    - `soundGate`, `quietState`, `decideOneShot`, `crackleAllowed`, `candleChanged`, `scrapePlan`, `bufferKey`, constants; edge examples from the design
    - _Requirements: 5.8, 6.4, 6.6, 6.11, 7.5, 7.6, 8.1, 8.2, 8.6, 11.4, 11.5_
  - [x] 5.4 Property 14: Quiet_State is exactly listen, capture, screeching or playback
    - **Property 14: Quiet_State is exactly listen, capture, screeching or playback**
    - **Validates: Requirements 5.8, 5.9**
  - [x] 5.5 Property 15: Sound_Gate is the conjunction of four conditions
    - **Property 15: Sound_Gate is the conjunction of four conditions**
    - **Validates: Requirements 5.1, 5.6, 5.7, 6.4, 6.7, 9.9**
  - [x] 5.6 Property 17: Duplicate one-shots inside 30 ms are ignored
    - **Property 17: Duplicate one-shots inside 30 ms are ignored**
    - **Validates: Requirements 6.11**
  - [x] 5.7 Property 18: Candle crackle limit
    - **Property 18: Candle crackle limit**
    - **Validates: Requirements 7.5, 7.6**
  - [x] 5.8 Property 19: A full reveal gives exactly min(n, 30) scrapes
    - **Property 19: A full reveal gives exactly min(n, 30) scrapes**
    - **Validates: Requirements 8.1, 8.2, 8.6**
  - [x] 5.9 Property 20: Scrape seed depends only on the letter index
    - **Property 20: Scrape seed depends only on the letter index**
    - **Validates: Requirements 8.5**
  - [x] 5.10 Property 28 (key part): Buffer cache keys are unique per sound, rate and seed
    - **Property 28: Buffer cache keys are unique per sound, rate and seed**
    - **Validates: Requirements 6.6, 8.5**

- [x] 6. Sound preference and Sound_Hint pure modules
  - [x] 6.1 Create `src/logic/sound-pref.ts` with `tests/logic/sound-pref.test.ts`
    - `SOUND_KEY`, `parseSound`, `serializeSound`; unit cases for `'1'`, `'0'`, `''`, `'false'`, `'off'`, `null`
    - _Requirements: 9.5, 9.7, 9.12, 10.6_
  - [x] 6.2 Property 21: Sound preference round trip
    - **Property 21: Sound preference round trip**
    - **Validates: Requirements 9.12, 9.13**
  - [x] 6.3 Property 22: Only `0` means off
    - **Property 22: Only `0` means off**
    - **Validates: Requirements 9.7, 9.14**
  - [x] 6.4 Property 23: Settings are independent
    - **Property 23: Settings are independent**
    - **Validates: Requirements 9.15, 10.6, 10.7**
  - [x] 6.5 Create `src/logic/sound-hint.ts` with `tests/logic/sound-hint.test.ts`
    - `SOUND_HINT_KEY`, `SOUND_HINT_TEXT`, `isIosDevice`, `shouldShowSoundHint`, `parseHintSeen`, `serializeHintSeen`; no browser globals
    - `isIosDevice` is true for a user agent naming iPhone, iPad or iPod, or for platform `MacIntel` with `maxTouchPoints > 1`; non-finite touch points count as 0
    - Unit tests: a Mac (platform `MacIntel`, 0 touch points, desktop Safari Mac user agent) returns false; an iPad in desktop mode (platform `MacIntel`, 5 touch points, same user agent) returns true
    - _Requirements: 12.1, 12.3, 12.7, 12.10, 12.11, 12.15, 12.16_
  - [x] 6.6 Property 29: The hint is shown if and only if all four conditions hold
    - **Property 29: The hint is shown if and only if all four conditions hold**
    - **Validates: Requirements 12.1, 12.3, 12.4, 12.5, 12.6, 12.12**
  - [x] 6.7 Property 30: iOS detection
    - **Property 30: iOS detection**
    - **Validates: Requirements 12.7, 12.11, 12.13**

- [x] 7. Checkpoint - pure logic
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Haunt player
  - [x] 8.1 Create `src/audio/haunt-player.ts`
    - `createHauntPlayer(deps)` and `hauntPlayer`: gate, cache by `bufferKey` (name, rate from the context, seed), `checkSound` before play, one-shot dedupe and crackle limit, delayed starts with generation counter, 120 ms fade and 130 ms stop, looping drone with 0.8 s ramp and `loopEnd`, `ended` cleanup with fallback timer, failure notice once, `noteAwakenTap`, reconcile on `statechange`; no second context
    - _Requirements: 3.6, 3.8, 3.10, 4.4, 4.5, 4.6, 4.7, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 7.8, 8.4, 9.9, 9.10_
  - [x] 8.2 Write `tests/audio/haunt-player.test.ts` unit tests with a fake context
    - Cache hit, no second context, `loop` and `loopEnd`, drone ramp, fade timing, failure notice once, invalid sound refused, rate read from context, node disconnect after `ended`, Exorcise and reduced-motion have no input
    - _Requirements: 3.8, 4.4, 4.7, 5.2, 6.5, 6.8, 6.10, 10.1, 10.3, 10.4, 10.5_
  - [x] 8.3 Property 16: The player never plays while the gate is closed and always ends silent
    - **Property 16: The player never plays while the gate is closed and always ends silent**
    - `tests/audio/haunt-player.property.test.ts` with a fake context, clock and timers
    - **Validates: Requirements 3.6, 5.1, 5.2, 5.3, 5.4, 7.8, 9.9**
  - [x] 8.4 Property 28 (player part): the same triple creates one buffer
    - **Property 28: Buffer cache keys are unique per sound, rate and seed**
    - **Validates: Requirements 6.6, 8.5**

- [x] 9. Hooks
  - [x] 9.1 Create `src/ui/hooks/useSoundPref.ts`
    - Module store with `useSyncExternalStore`, `initSound` (read only), `setSound`, try/catch storage, no import of motion files
    - _Requirements: 9.5, 9.6, 9.7, 9.8, 9.15, 10.2, 10.5_
  - [x] 9.2 Create `src/ui/hooks/useSoundHint.ts` and Property 31 test
    - `createSoundHintStore(deps)`, `markAwakenTapped`, `useSoundHint`; latch, dismiss, write once; `tests/ui/sound-hint-store.property.test.ts`
    - **Property 31: The hint is shown at most once per session**
    - **Validates: Requirements 12.1, 12.2, 12.3, 12.14**
  - [x] 9.3 Create `src/ui/hooks/useHaunt.ts` and the failure-notice store
    - `useHauntBridge` (layout effect, `quietState`, `useSoundPref`), `useHaunt` triggers, notice store fed by `onFailure`
    - _Requirements: 5.2, 5.6, 5.7, 6.8, 9.9, 9.10_

- [x] 10. Sound UI components and theme
  - [x] 10.1 Create `src/ui/components/SoundToggle.tsx` with `tests/ui/sound-toggle.test.tsx`
    - `role="switch"`, labels "Sound: on" and "Sound: off", `aria-checked`, `.hit` target, no emoji, works before Awaken, storage failure cases
    - _Requirements: 9.2, 9.3, 9.4, 9.5, 9.6, 9.8, 9.11, 10.2_
  - [x] 10.2 Create `src/ui/components/SoundHint.tsx` with `tests/ui/sound-hint.test.tsx`
    - `role="status"`, exact text, dismiss `.hit` button, no focus steal, no modal, no sound, `.note` tokens
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.8, 12.9, 12.14_
  - [x] 10.3 Create `src/ui/components/ToggleCluster.tsx` and replace `<ExorciseToggle />` on all seven screens
    - SoundToggle before ExorciseToggle, then SoundHint, then the failure notice
    - _Requirements: 6.8, 9.1, 12.1_
  - [x] 10.4 Add theme styles to `src/styles/screens.css`
    - `.sound-toggle`, `.is-off`, `.sound-hint`, cluster flex row at 390 px, no motion; contrast at least 4.5:1 checked with `logic/contrast.ts` in a unit test
    - _Requirements: 9.4, 12.9_

- [x] 11. Per-screen wiring
  - [x] 11.1 Wire `App.tsx` and `Awaken.tsx`
    - `useHauntBridge(flow, audio)`; after `unlockAudio()` (synchronous, first) and its await, call `noteAwakenTap(outcome)` then `markAwakenTapped()`
    - _Requirements: 6.1, 6.2, 6.3, 7.1, 7.2, 12.5_
  - [x] 11.2 Wire `Speak.tsx`
    - Drone on mount and off on unmount, card flip only for a new card, crackle on `reading.budget.size` change via `candleChanged`
    - _Requirements: 4.5, 4.6, 7.3, 7.4, 7.5, 7.6, 7.7_
  - [x] 11.3 Wire `Reveal.tsx` and `OuijaBoard.tsx`
    - Both use `spellShown`; scrapes from `scrapePlan` and `scrapeSeed`, one whisper via ref guard, `stopKind` on skip, `stopOneShots` on unmount, none under reduced motion
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.10, 8.11, 10.3_
  - [x] 11.4 Wire `Garbled.tsx` and `Sealed.tsx`
    - Play `broken-crackle` and `sealed-thud` once on mount, `stopOneShots` on unmount; Listen and Screeching get no sound code
    - _Requirements: 5.6, 5.7, 8.7, 8.8, 8.10, 8.11_
  - [x] 11.5 Write `tests/ui/haunt-wiring.test.tsx` with a stubbed `hauntPlayer`
    - Awaken call order, card flip, crackle, 40 spaced Letters give 30 scrapes and one whisper, Reveal and `OuijaBoard` show the same text, skip, Garbled and Sealed once, Listen and Screeching silent, one Sound_Toggle before Exorcise on every screen
    - _Requirements: 6.2, 7.3, 7.4, 7.5, 7.6, 8.4, 8.6, 8.7, 8.8, 9.1_

- [x] 12. Architecture and build guards
  - [x] 12.1 Extend `tests/architecture.test.ts`
    - Haunt files never import motion files and the reverse; pure haunt files contain no `Math.random`, `Date`, `performance`, `document`, `window`; no `any`; no audio file imports in `src`
    - _Requirements: 1.3, 10.5, 11.7, 11.9_
  - [x] 12.2 Add `scripts/check-no-audio.mjs` and an `apps/web` script `check:no-audio`
    - Fail with the file path when `dist` holds `.mp3`, `.wav`, `.ogg` or `.m4a`
    - _Requirements: 11.9_

- [x] 13. Final checkpoint - tests, typecheck and build
  - Run `pnpm test` from the root, then the workspace typecheck, then `pnpm build`
  - Run `pnpm --filter web check:no-audio` and confirm no audio assets in `apps/web/dist`
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Every task is required; none is optional.
- Property tests use one file each (`tests/logic/haunt-pNN-*.property.test.ts` or the file named in the task) so tasks in the same wave never share a file.
- Run tests once with `pnpm test`, not in watch mode.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "5.1", "6.1", "6.5"] },
    { "id": 2, "tasks": ["2.2", "5.2", "5.3", "6.2", "6.3", "6.4", "6.6", "6.7", "9.1"] },
    { "id": 3, "tasks": ["2.3", "2.4", "5.4", "5.5", "5.6", "5.7", "5.8", "5.9", "5.10", "9.2", "10.1"] },
    { "id": 4, "tasks": ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.8", "3.9", "3.10", "3.11", "3.12", "3.13", "3.14", "3.15", "3.16", "8.1", "10.2"] },
    { "id": 5, "tasks": ["8.2", "8.3", "8.4", "9.3", "10.4"] },
    { "id": 6, "tasks": ["10.3"] },
    { "id": 7, "tasks": ["11.1", "11.2", "11.3", "11.4"] },
    { "id": 8, "tasks": ["11.5", "12.1", "12.2"] }
  ]
}
```
