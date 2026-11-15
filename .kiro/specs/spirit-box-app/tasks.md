# Implementation Plan: Spirit Box App

## Overview

Language: TypeScript (strict), as in the design. Work proceeds bottom-up: setup, pure logic in `apps/web/src/logic` (each with unit tests and fast-check property tests), the audio engine in `apps/web/src/audio`, the UI shell and theme, the five screens, and finally the wiring in `App.tsx`. Logic modules never import React or browser audio APIs. Every correctness property from the design is its own sub-task. Tests live in `apps/web/tests/`. Manual device checks (iOS Safari, Android Chrome) are not coding tasks and are not listed.

iOS user-activation rule (see design "AudioContext unlock sequence"): the hold timer is not a user gesture, so it never calls `unlockAudio()` or `resume()`. `audio/session.ts` exposes `unlockAudio()` (gesture handlers that start audio), `ensureRunning()` (resume only if a context exists and is not running) and `isRunning()` (synchronous check). Every click and keydown handler on the Speak screen calls `ensureRunning()` first. When the hold fires and the context is running, the transmission starts at once. Otherwise the Speak screen shows a "Tap to wake the box" control (`wakePending`), whose click handler calls `unlockAudio()` and then starts the transmission.

## Tasks

- [x] 1. Project setup and dependencies
  - [x] 1.1 Configure `apps/web` dependencies, test config and shared test helpers
    - In `apps/web/package.json` add `@screech/core` as `workspace:*`, `ggwave` pinned to exactly `0.4.0`, `qrcode`, `@fontsource/vt323`, `@fontsource/special-elite`, `@fontsource/creepster`; add devDependencies `fast-check` 3.22.0, `jsdom`, `@testing-library/react`, `@types/qrcode`
    - Create `apps/web/vitest.config.ts` aliasing `@screech/core` to `../../packages/core/src/index.ts`, `node` environment by default, `jsdom` for `tests/ui/**` through `environmentMatchGlobs`
    - Create `apps/web/src/ggwave.d.ts` (encode accepts `string | Uint8Array`) based on `apps/spike/src/ggwave.d.ts`
    - Create `apps/web/tests/logic/arbitraries.ts` with generators for strings, special-character strings, contact fields, Wi-Fi fields, hold events, sample blocks and `Result<DecodedPacket>` values
    - Run `pnpm install` and confirm `pnpm build` still passes
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 1.7, 16.8_

- [x] 2. Wi-Fi QR string
  - [x] 2.1 Implement `src/logic/wifi-qr.ts`
    - `escapeWifiField` prefixes `\ ; , : "` with one backslash; `buildWifiQrString` maps wpa/wep/open to `WPA`/`WEP`/`nopass` and emits `WIFI:T:<t>;S:<s>;P:<p>;;`, with an empty password for open networks
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

  - [x] 2.2 Write property test for Wi-Fi QR round trip
    - **Property 1: Wi-Fi QR string round trip**
    - **Validates: Requirements 14.7**

  - [x] 2.3 Write property test for Wi-Fi QR escaping and shape
    - **Property 2: Wi-Fi QR escaping and shape**
    - **Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.8, 14.9**

  - [x] 2.4 Write unit tests for Wi-Fi QR string
    - Open, WPA and WEP networks, each escaped character in SSID and password, empty strings, open network with a supplied password
    - _Requirements: 17.1_

- [x] 3. Contact text and vCard
  - [x] 3.1 Implement `src/logic/contact.ts`
    - `sanitizeField`, `buildContactText` (U+001F separator, trailing empty fields omitted), total `parseContactText`
    - _Requirements: 6.1, 6.2, 6.4, 6.10_

  - [x] 3.2 Implement `src/logic/vcard.ts`
    - `escapeVCardText` (RFC 6350 escapes, newlines to `\n`) and `buildVCard` (vCard 3.0, CRLF lines, TEL and EMAIL only when non-empty)
    - _Requirements: 6.5, 6.6, 6.7_

  - [x] 3.3 Write property test for contact text round trip
    - **Property 3: Contact text round trip with sanitising**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**

  - [x] 3.4 Write property test for contact parsing totality
    - **Property 4: Contact parsing is total**
    - **Validates: Requirements 6.2, 6.10**

  - [x] 3.5 Write property test for vCard structure
    - **Property 5: vCard structure**
    - **Validates: Requirements 6.5, 6.7**

  - [x] 3.6 Write property test for vCard text escaping
    - **Property 6: vCard text escaping round trip**
    - **Validates: Requirements 6.6**

  - [x] 3.7 Write unit tests for contact and vCard
    - Name only, each optional field, empty field, maximum-length field, separator and newline sanitising, unparseable text
    - _Requirements: 17.2_

- [x] 4. Byte budget and payload draft
  - [x] 4.1 Implement `src/logic/byte-budget.ts`
    - `budget(Result<Uint8Array>)` returning status, size, fill and message; `describeEncodeError`; the `too-large` message is `Too heavy to cross over (<length>/<SIZE_CAP> bytes)` using `SIZE_CAP` from Core
    - _Requirements: 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9_

  - [x] 4.2 Implement `src/logic/payload-draft.ts`
    - `Draft`, `INITIAL_DRAFT`, `hasContent` (whitespace rule), `buildPayload` (blank contact name gives `name-required`, open Wi-Fi sends empty password, contact built through `buildContactText`)
    - _Requirements: 5.3, 5.8, 5.9, 6.8, 6.9_

  - [x] 4.3 Write property test for byte budget against Core encode
    - **Property 7: Byte budget agrees with Core encode**
    - **Validates: Requirements 7.2, 7.3, 7.8, 7.9, 7.10, 7.11**

  - [x] 4.4 Write property test for byte budget error mapping
    - **Property 8: Byte budget error mapping**
    - **Validates: Requirements 2.9, 7.4, 7.5, 7.6, 7.7**

  - [x] 4.5 Write property test for the content gate
    - **Property 9: Content gate follows the whitespace rule**
    - **Validates: Requirements 5.8, 5.9**

  - [x] 4.6 Write unit tests for byte budget and payload draft
    - Sizes 0, 139, 140 and 141 through synthetic results, non-`too-large` errors, each draft type, blank contact name
    - _Requirements: 17.3_

- [x] 5. Hold machine, progress, Ouija schedule and motion preference
  - [x] 5.1 Implement `src/logic/hold-machine.ts`
    - `HOLD_DURATION_MS = 300`, `holdStep` following the design transition table, `holdProgress`
    - _Requirements: 8.1, 8.5, 8.6, 8.10, 8.12_

  - [x] 5.2 Write property test for the hold transition table
    - **Property 10: Hold machine follows the transition table**
    - **Validates: Requirements 8.5, 8.10, 17.6**

  - [x] 5.3 Write property test for single firing per press
    - **Property 11: Hold fires at most once per press**
    - **Validates: Requirements 8.6, 8.11, 8.12**

  - [x] 5.4 Implement `src/logic/progress.ts`
    - `progress`, `percent`, `remainingSeconds`, `formatDuration`; clamp negative and non-finite input
    - _Requirements: 10.3, 10.4, 10.9, 10.12_

  - [x] 5.5 Write property test for progress bounds
    - **Property 15: Progress values are bounded**
    - **Validates: Requirements 10.3, 10.9, 10.12**

  - [x] 5.6 Write property test for progress monotonicity
    - **Property 16: Progress is monotonic**
    - **Validates: Requirements 10.10**

  - [x] 5.7 Implement `src/logic/ouija.ts`
    - `SPELL_RATE_CPS`, `SPELL_MAX_CHARS`, `SPELL_MAX_MS`, `spellProgress` counting code points
    - _Requirements: 13.1, 13.2_

  - [x] 5.8 Write property test for the Ouija spelling schedule
    - **Property 22: Ouija spelling schedule**
    - **Validates: Requirements 13.1, 13.3**

  - [x] 5.9 Implement `src/logic/motion.ts`
    - `EXORCISE_KEY`, `parseExorcise` (only `'1'` is true), `serializeExorcise`, `resolveReducedMotion`
    - _Requirements: 3.2, 3.4, 3.5_

  - [x] 5.10 Write property test for Exorcise storage parsing
    - **Property 24: Exorcise storage parsing**
    - **Validates: Requirements 3.4, 3.5**

  - [x] 5.11 Write unit tests for hold machine, progress, Ouija and motion
    - Specific hold sequences including auto-repeat and cancel, zero and exact-duration cases, empty and 30+ character values, null and odd storage values
    - _Requirements: 17.5, 17.6_

- [x] 6. Audio math helpers (pure)
  - [x] 6.1 Implement `src/logic/sample-chunker.ts` and `src/logic/bytes.ts`
    - `CHUNK_SIZE = 4096`, `EMPTY_CHUNKER`, `pushSamples`; `ggwaveViewToBytes` using `.slice()`; `waveformFromBytes`
    - _Requirements: 9.5, 9.6, 9.8, 9.15, 9.17_

  - [x] 6.2 Write property test for sample chunker conservation
    - **Property 12: Sample chunker conserves samples**
    - **Validates: Requirements 9.15, 9.16**

  - [x] 6.3 Write property test for ggwave byte conversion
    - **Property 13: ggwave byte conversion copies**
    - **Validates: Requirements 9.6, 9.17**

  - [x] 6.4 Implement `src/logic/band-energy.ts`
    - `SCREECH_BAND_LOW_HZ = 1875`, `SCREECH_BAND_HIGH_HZ = 6400`, `binFrequency`, `bandEnergy` (non-finite counts as 0), `meterSteps`
    - _Requirements: 11.3, 11.4, 11.5, 11.6, 11.9_

  - [x] 6.5 Write property test for band energy normalisation
    - **Property 17: Band energy is normalised**
    - **Validates: Requirements 11.5, 11.6, 11.7, 11.9**

  - [x] 6.6 Write property test for band energy ignoring out-of-band bins
    - **Property 18: Band energy ignores out-of-band bins**
    - **Validates: Requirements 11.8**

  - [x] 6.7 Write unit tests for chunker, byte conversion and band energy
    - Empty input, exact multiples of 4096, views with non-zero `byteOffset`, band edges at 1875 Hz and 6400 Hz for 44100 and 48000 Hz, empty magnitudes
    - _Requirements: 17.5_

- [x] 7. Receive mapping, flow and capabilities
  - [x] 7.1 Implement `src/logic/screen-state.ts` and `src/logic/dedupe.ts`
    - `screenState` maps Core decode results to `ignore`, `reveal`, `garbled`, `pact-required` and never throws; `dedupeStep` with a 5000 ms window
    - _Requirements: 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.9, 12.10, 12.12, 12.13_

  - [x] 7.2 Implement `src/logic/url-safety.ts`, `src/logic/capabilities.ts` and `src/logic/contrast.ts`
    - `isSafeToOpen` (`/^https?:\/\//i` on the raw string), `missingFeatures` and `micSupport`, `contrastRatio` (WCAG 2.1)
    - _Requirements: 2.6, 4.9, 13.10, 16.7_

  - [x] 7.3 Implement `src/logic/flow.ts`
    - `FlowState`, `FlowEvent`, `flowReducer`, `canTransmit`, `canListen`; mutual exclusion of sending and listening with plain-words notices; mic retry cap of 3
    - Add `wakePending: boolean` to `FlowState` and events `holdFired(contextRunning)` and `wakeTapped`: `holdFired(false)` sets `wakePending: true` and stays on Speak; `holdFired(true)` and a successful `wakeTapped` clear `wakePending` and lead to `startTransmit`; `wakePending` is also cleared by input edits, card selection and `openListen`
    - _Requirements: 4.7, 4.10, 8.1, 8.13, 8.14, 8.15, 15.5, 15.6, 15.7, 15.8_

  - [x] 7.4 Write property test for screen state mapping
    - **Property 19: Screen state mapping**
    - **Validates: Requirements 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.9, 12.10**

  - [x] 7.5 Write property test for the receive pipeline on random bytes
    - **Property 20: Random sound never breaks the receive pipeline**
    - **Validates: Requirements 12.1, 12.9**

  - [x] 7.6 Write property test for duplicate suppression
    - **Property 21: Duplicate screens are suppressed for 5 seconds**
    - **Validates: Requirements 12.12, 12.13**

  - [x] 7.7 Write property test for safe link schemes
    - **Property 23: Only http and https links are openable**
    - **Validates: Requirements 13.10**

  - [x] 7.8 Write property test for send and listen exclusion
    - **Property 25: Sending and listening never overlap**
    - **Validates: Requirements 15.5, 15.6, 15.7, 15.8**

  - [x] 7.9 Write property test for the missing-feature report
    - **Property 26: Missing-feature report**
    - **Validates: Requirements 16.7**

  - [x] 7.10 Write unit tests for screen state, dedupe, flow and capabilities
    - One test per Screen_State, each Room_Noise_Error code, multipart, dedupe at 4999 and 5000 ms, flow notices, insecure context before missing `getUserMedia`
    - Flow wake cases: `holdFired(false)` sets `wakePending` without changing screen or `transmitting`; `holdFired(true)` starts transmit with `wakePending` false; `wakeTapped` after `holdFired(false)` starts transmit and clears `wakePending`; editing input clears `wakePending`
    - _Requirements: 8.13, 8.14, 8.15, 17.4_

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Audio engine
  - [ ] 9.1 Implement `src/audio/constants.ts` and `src/audio/env.ts`
    - `defineTransmitVolume` (throws `RangeError` with value and range), `TRANSMIT_VOLUME = defineTransmitVolume(50)` as the only definition, `FFT_SIZE = 2048`; `readCapabilities()` reads window and navigator once
    - _Requirements: 9.18, 9.19, 16.7_

  - [ ] 9.2 Write property test for transmit volume validation
    - **Property 14: Transmit volume validation**
    - **Validates: Requirements 9.18, 9.19**

  - [ ] 9.3 Implement `src/audio/session.ts`
    - `getOrCreateContext` with `webkitAudioContext` fallback, replacing a closed context; non-async `unlockAudio` that creates and resumes synchronously and reads the state only after awaiting `resume()`
    - Add `ensureRunning()`: returns a resolved promise when no context exists or the state is `running` or `closed`; otherwise calls `resume()` once and swallows rejection; never creates a context and never reads the state after the await
    - Add `isRunning()`: synchronous, returns `ctx?.state === 'running'`, never calls `resume()` or creates a context
    - _Requirements: 4.2, 4.8, 16.1, 16.2, 16.3, 16.6, 16.9_

  - [ ] 9.4 Implement `src/audio/mic.ts`
    - `openMic` with all three audio filters off and plain-words denial and unavailable results; `stopStream`
    - _Requirements: 4.3, 9.7, 9.14, 16.4_

  - [ ] 9.5 Implement `src/audio/engine.ts`
    - `loadEngine(sampleRate)` with dynamic `import('ggwave')`, `sampleRateInp = sampleRateOut = sampleRate`, F32 formats, cached per rate; `encode` passes a `Uint8Array` with Spirit_Wave and `TRANSMIT_VOLUME` and copies the result with `.slice()`; `decode` returns copied bytes or `null`; failures return "The sound engine could not start."
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.11, 9.13, 9.18_

  - [ ] 9.6 Implement `src/audio/transmit.ts`
    - `playWaveform` builds the `AudioBuffer`, exposes `elapsedSec()` from `ctx.currentTime`, `stop()` within 100 ms, and `finished` resolving `ended`, `stopped` or `failed` (including a context leaving `running`)
    - _Requirements: 10.1, 10.6, 10.7, 10.8, 10.14_

  - [ ] 9.7 Implement `src/audio/capture.ts` and `src/audio/capture-worklet-source.ts`
    - Mic source to `AnalyserNode` and to a capture node feeding a muted `GainNode`; `AudioWorkletNode` loaded from a Blob URL with a `ScriptProcessorNode(4096)` fallback; blocks pass through `pushSamples` and each 4096-sample chunk goes to `engine.decode`; `onPacketBytes`, `onMicLost` on track `ended`, `lastBlockAt`, and `stop()` that stops tracks and disconnects every node
    - _Requirements: 9.8, 9.9, 9.10, 9.12, 11.1, 11.10, 11.11, 11.14_

  - [ ] 9.8 Write unit tests for unlock and microphone
    - Fake `AudioContext` recording call order: already running, suspended then running, `resume()` rejects, resolves but stays suspended (non-running case: outcome `not-running`, `getUserMedia` never called), `interrupted` state, closed context replaced inside `unlockAudio()`, `webkitAudioContext` only; `create` and `resume` are issued before the first await boundary; `getUserMedia` never called on failure; exact constraints object; denial and missing-device messages
    - _Requirements: 4.2, 4.3, 4.8, 9.7, 9.14, 16.1, 16.4, 16.6_

  - [ ] 9.11 Write unit tests for `ensureRunning` and `isRunning`
    - `tests/audio/ensure-running.test.ts` with a fake `AudioContext`: no context means nothing is created and nothing is called; `suspended` and `interrupted` call `resume()` exactly once; `running` and `closed` call nothing; a rejecting `resume()` is swallowed; `isRunning()` is synchronous, never calls `resume()`, and is false for every state except `running`
    - _Requirements: 16.1, 16.2, 16.9_

  - [ ] 9.9 Write unit tests for engine, playback and capture with fakes
    - Fake ggwave module checks init rates, F32 formats, `Uint8Array` payload, volume argument and copied results; init failure message; playback `failed` and `stopped` outcomes; capture worklet and script-processor paths, `stop()` cleanup, `onMicLost`
    - _Requirements: 9.2, 9.4, 9.5, 9.9, 9.10, 9.12, 9.13, 10.8_

  - [ ] 9.10 Write the real ggwave round-trip integration test
    - `tests/audio/ggwave-roundtrip.test.ts`: at 44100 and 48000 Hz, encode a text packet, a Wi-Fi packet containing byte `0xC1` and values above `0x7F`, and a 140-byte packet, feed the waveform through `pushSamples` in 4096-sample chunks, and check the decoded bytes are equal
    - _Requirements: 9.2, 9.4, 9.6, 9.8, 16.3_

- [ ] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. UI shell and theme
  - [ ] 11.1 Create `src/styles/tokens.css`, `motion.css` and `screens.css`
    - Colour tokens from `docs/design/README.md`, `--hit: 44px` on a shared `.hit` class, font stacks, portrait layout from 320 to 430 px with `min-width: 0` on flex children, zero-duration rules under `[data-reduced-motion="true"]` and the media query, static solid-pattern scanlines and an inset box-shadow frame instead of gradient washes, reds only on error and seal classes
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.8, 2.10, 3.1_

  - [ ] 11.2 Update `src/main.tsx` and add `useMotion`, `ExorciseToggle` and `CrtFrame`
    - Import the three fonts and the stylesheets; read `localStorage` in try/catch and set `data-reduced-motion` before the first render; `matchMedia` listener updates within one event turn; toggle shows on and disabled with "System setting is in effect." when the system prefers reduced motion, with an on/off label and a 44 px target
    - _Requirements: 2.3, 3.2, 3.3, 3.4, 3.5, 3.6, 3.8, 4.11_

  - [ ] 11.3 Implement hooks `useHold`, `useFlow` and `useAudioSession`
    - `useHold` drives `holdStep` from a 33 ms interval using `performance.now()`, drops key auto-repeat, cancels on pointer leave and `pointercancel`, and on the transition into `fired` calls an `onFired(isRunning())` callback once and never calls `unlockAudio()` or `resume()` from the timer; `useFlow` wraps `flowReducer` (including `holdFired` and `wakeTapped`); `useAudioSession` owns the context, engine, capture handle and `visibilitychange` resume and restart, with a tap retry on failure
    - `useAudioSession` also exposes `unlockAudio`, `ensureRunning` and `isRunning` from `audio/session.ts`; on `visibilitychange` it awaits `ctx.resume()` and uses `ensureRunning` semantics for Speak
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.13, 8.14, 8.15, 15.10, 15.11, 16.1, 16.2, 16.9_

  - [ ] 11.4 Write the theme test
    - Token table equals the README hex values, `contrastRatio` of every text and background pair is at least 4.5, red classes appear only for errors and the seal, every control uses `.hit`
    - _Requirements: 2.1, 2.2, 2.5, 2.6_

  - [ ] 11.5 Write component tests for motion and the Exorcise toggle
    - Saved "on" applies before first render, unavailable or odd storage falls back to off, system preference disables and labels the toggle, label updates on tap
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6_

- [ ] 12. Awaken screen
  - [ ] 12.1 Implement `src/ui/screens/Awaken.tsx`
    - Boot lines, Awaken control calling `unlockAudio()` synchronously in the tap handler, then `openMic()` and an immediate `stopStream`; mic denied, unlock failed, insecure context and missing `getUserMedia` messages with retry (max 3) and continue-without-listening controls; missing-feature message from `missingFeatures`; moves to Speak on success
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 15.1, 15.2, 15.9, 16.7_

  - [ ] 12.2 Write component tests for the Awaken screen
    - Granted, denied with retry cap of 3, unlock failure without mic request, insecure context, no `getUserMedia`, continue without listening
    - _Requirements: 4.4, 4.5, 4.6, 4.7, 4.8, 4.9_

- [ ] 13. Speak screen
  - [ ] 13.1 Implement `TarotCard`, `ByteCandle` and `ScreechKey` components
    - `TarotCard` with `aria-pressed`; `ByteCandle` showing `<size>/<cap> bytes`, fill and red `too-large` message, flame flicker only when fill is above 0 and motion is allowed; `ScreechKey` with hold fill from `holdProgress`, accessible name and a description stating the 300 ms hold
    - _Requirements: 5.1, 5.11, 7.2, 7.3, 7.4, 7.7, 8.5, 8.8, 8.9_

  - [ ] 13.2 Implement `src/ui/screens/Speak.tsx`
    - Four cards with the text card selected first, per-type inputs that keep every draft value across card changes, `budget(encode(...))` on each change, disabled SCREECH key with "nothing written" and error messages, disabled seal toggle with its later-release text, Listen control from `canListen`
    - Every click and keydown handler on the Speak screen (cards, inputs, seal toggle, Listen button, SCREECH key press and keyboard) calls `ensureRunning()` first, synchronously and without awaiting it; Listen button also calls `unlockAudio()` inside its own click handler
    - Implement `startTransmission()` (plain async function, no gesture needed): `loadEngine(ctx.sampleRate)`, `buildPayload`, Core `encode`, `engine.encode`, `playWaveform`, then `startTransmit`; engine or playback failure goes to the Screeching error state
    - When the hold fires, `isRunning()` true calls `startTransmission()` at once; false dispatches `holdFired(false)` and shows the "Tap to wake the box" control (text "The box fell asleep. Tap to wake it.", at least 44 px by 44 px, draft untouched, nothing sent)
    - Wake control click handler calls `unlockAudio()` first with nothing awaited before it; on `ok` it dispatches `wakeTapped` and calls `startTransmission()`; on failure it keeps the control and shows "Audio could not start. Tap to try again."
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 6.8, 6.9, 7.1, 7.5, 7.6, 7.8, 8.1, 8.2, 8.3, 8.13, 8.14, 8.15, 10.7, 15.3, 15.5, 15.6, 15.9, 16.1, 16.2, 16.9_

  - [ ] 13.3 Write component tests for the Speak screen
    - Card selection and `aria-pressed`, retained fields, SCREECH enabled and disabled states, hold by pointer and keyboard with auto-repeat and pointer leave, disabled seal toggle, over-budget message; clicks and keydowns on cards, inputs, the seal toggle and the Listen button each call `ensureRunning()` before anything else; the hold timer never calls `resume()` or `unlockAudio()`
    - _Requirements: 5.3, 5.8, 5.10, 5.11, 7.5, 8.1, 8.2, 8.3, 8.6, 8.7, 8.8, 8.13, 16.1, 16.2, 16.9_

  - [ ] 13.4 Write the wake-control component test
    - `tests/ui/wake-control.test.tsx` with a fake `AudioContext` and fake timers, three cases. (a) Context `suspended` at hold fire: `resume()` not called by the timer, no `playWaveform` call, no Screeching screen, "Tap to wake the box" visible, draft unchanged; then `resume()` settles to `running` and the wake control is clicked: `unlockAudio()` ran inside the click before the first await, then exactly one transmission starts. (b) `resume()` leaves the state `suspended`: control stays, "Audio could not start. Tap to try again." appears, nothing plays. (c) Context `running` at fire: transmission starts at once, wake control never shows, `resume()` not called
    - _Requirements: 8.1, 8.3, 8.13, 8.14, 8.15, 10.7, 16.1, 16.2_

- [ ] 14. Screeching screen
  - [ ] 14.1 Implement the `Oscilloscope` component
    - Canvas drawing the waveform window at `elapsedSec() * sampleRate` through `requestAnimationFrame` (at least 20 fps); static full waveform under reduced motion
    - _Requirements: 10.2, 10.11_

  - [ ] 14.2 Implement `src/ui/screens/Screeching.tsx`
    - Screen is entered only after the context was running and `playWaveform` was requested (never from a bare hold on a non-running context); playback or context failure after that shows the error state
    - Percent, duration and remaining seconds from `progress` helpers and `elapsedSec()`; the "still travelling" message; cancel control stopping playback within 100 ms; completion message and return control; failure message "The sound did not leave the speaker." with return control; text progress updated once per second under reduced motion; draft preserved on return
    - _Requirements: 10.1, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.11, 10.12, 10.13, 10.14, 15.9_

  - [ ] 14.3 Write component tests for the Screeching screen
    - Progress text from a fake clock, remaining seconds, cancel returns to Speak with draft kept, completion state, failure state
    - _Requirements: 10.3, 10.5, 10.6, 10.8, 10.12_

- [ ] 15. Listen screen
  - [ ] 15.1 Implement `Spectrogram` and `KIIMeter` components
    - Spectrogram canvas from `AnalyserNode.getByteFrequencyData` at least 10 fps with the Screech band highlighted using `binFrequency`; K-II LEDs from `meterSteps(bandEnergy(...))`; at most 3 frames per second and text meter under reduced motion
    - _Requirements: 11.2, 11.3, 11.4, 11.5, 11.13_

  - [ ] 15.2 Implement `src/ui/screens/Listen.tsx`
    - Open mic inside the tap handler, `startCapture`, "Listening" label, band label "1.9 kHz to 6.4 kHz"; each packet goes through Core `decode`, `screenState` and `dedupeStep`, `ignore` shows nothing, other states stop capture and switch screens; silent-mic message with retry tap; "Sending is unavailable while listening." notice; back control releases the mic; no UI sound
    - _Requirements: 11.1, 11.10, 11.11, 11.12, 11.14, 11.15, 12.1, 12.3, 12.11, 12.12, 12.13, 15.4, 15.7, 15.8, 15.9_

  - [ ] 15.3 Write component tests for the Listen screen
    - Listening label, mic-lost message and retry, leaving stops tracks, `ignore` leaves the screen unchanged, reduced-motion text meter
    - _Requirements: 11.11, 11.12, 11.13, 11.14, 11.15, 12.3_

- [ ] 16. Reveal screen
  - [ ] 16.1 Implement the `OuijaBoard` component
    - Board with the planchette on the most recently spelled letter, spelled characters appended in a steady colour, `aria-hidden` on the spelling display
    - _Requirements: 13.1, 13.22_

  - [ ] 16.2 Implement the `ActionCard` component
    - Text, checkin and hunt-clue text; url with `window.open(url, '_blank', 'noopener,noreferrer')` only on tap and only when `isSafeToOpen`, otherwise the "not safe to open" message; wifi SSID, security, copy password (omitted for open, with success and failure messages), QR canvas from `buildWifiQrString` with text fallback; contact fields (absent ones omitted) and `.vcf` download as `text/vcard`, or the unreadable-contact message with raw text; all received text rendered as React text nodes
    - _Requirements: 6.10, 13.6, 13.7, 13.8, 13.9, 13.10, 13.11, 13.12, 13.13, 13.14, 13.15, 13.16, 13.17, 13.19, 14.5, 14.6_

  - [ ] 16.3 Implement `Reveal`, `Garbled` and `Sealed` screens
    - Reveal with a hidden full-text element from the first frame, `spellProgress` schedule, skip control (click, Space, Enter), Action_Card after spelling or at once under reduced motion, controls back to Listen and to Speak; Garbled "This message arrived damaged." with return control; Sealed with the exact text "A sealed message. Join the pact to read it."
    - _Requirements: 12.4, 12.5, 13.1, 13.2, 13.3, 13.4, 13.5, 13.18, 13.20, 13.21, 15.9_

  - [ ] 16.4 Write component tests for the Reveal, Garbled and Sealed screens
    - Spelling pace with fake timers, skip by click and keyboard, reduced motion shows everything at once, action cards per type with mocked `window.open`, clipboard and `Blob`, unsafe URL scheme, a payload containing `<img onerror=...>` rendered as text, Garbled and Sealed texts
    - _Requirements: 12.4, 12.5, 13.1, 13.2, 13.8, 13.10, 13.12, 13.13, 13.17, 13.19, 13.20, 13.21_

- [ ] 17. Wiring and architecture checks
  - [ ] 17.1 Implement `src/ui/App.tsx` and mount it from `main.tsx`
    - Screen switch from `useFlow`, passing the audio session, engine and draft to each screen; Awaken is the only screen at start; received `reveal`, `garbled` and `pact-required` states route to their screens; transmission and listening exclusion enforced through the reducer; remove the old stub `App.tsx`
    - Wire `wakePending` from `useFlow` to the Speak screen's wake control and `startTransmission()`, so the hold-fired path and the wake-tap path share one transmit function; Screeching return and cancel clear `wakePending`
    - _Requirements: 8.1, 8.13, 8.14, 8.15, 10.7, 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8, 15.9, 12.11, 16.1, 16.2_

  - [ ] 17.2 Write `tests/architecture.test.ts`
    - Import-graph walk fails with the offending module path if any `src/logic` module reaches `react`, `react-dom`, `ggwave`, `src/audio` or mentions a browser audio API; `src/audio` imports no React; no `44100` or `48000` literal in `src`; the `TRANSMIT_VOLUME` value 50 is defined once; no `: any`, `as any` or `<any>`; `package.json` pins `ggwave` to `0.4.0` and `@screech/core` to `workspace:*`
    - _Requirements: 1.1, 1.2, 9.1, 9.3, 9.18, 16.3, 16.8, 17.7, 17.8_

  - [ ] 17.3 Write an integration component test for the full flow
    - With fake audio and engine: Awaken to Speak, hold to transmit and Screeching (running context), hold on a suspended context then wake tap to transmit, listening blocked while transmitting, Listen to Reveal on a decoded packet, duplicate packet within 5 seconds ignored
    - _Requirements: 8.13, 8.14, 8.15, 12.12, 15.2, 15.5, 15.6, 15.7, 16.9_

- [ ] 18. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All sub-tasks, including tests, are required because Requirement 17 mandates them
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate the 26 correctness properties from the design (fast-check, at least 100 runs each, tagged `// Feature: spirit-box-app, Property N: <title>`)
- Unit tests validate specific examples and edge cases
- Manual checks on iPhone Safari, Android Chrome and desktop Chrome over HTTPS are outside this task list

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "3.1", "3.2", "4.1", "5.1", "5.4", "5.7", "5.9", "6.1", "6.4", "7.1", "7.2", "9.1", "11.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "3.3", "3.4", "3.5", "3.6", "3.7", "4.2", "4.3", "4.4", "5.2", "5.3", "5.5", "5.6", "5.8", "5.10", "5.11", "6.2", "6.3", "6.5", "6.6", "6.7", "7.3", "7.4", "7.5", "7.6", "7.7", "7.9", "9.2", "9.3", "9.4", "9.5", "9.6", "11.2", "11.4"] },
    { "id": 3, "tasks": ["4.5", "4.6", "7.8", "7.10", "9.7", "9.8", "9.11", "11.5"] },
    { "id": 4, "tasks": ["9.9", "9.10", "11.3"] },
    { "id": 5, "tasks": ["12.1", "13.1", "14.1", "15.1", "16.1", "16.2"] },
    { "id": 6, "tasks": ["12.2", "13.2", "14.2", "15.2", "16.3"] },
    { "id": 7, "tasks": ["13.3", "13.4", "14.3", "15.3", "16.4", "17.1"] },
    { "id": 8, "tasks": ["17.2", "17.3"] }
  ]
}
```
