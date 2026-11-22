# Implementation Plan: Ghost Hunt

## Overview

Ghost Hunt is built bottom-up: the pure Core clue builder and parser first, then the pure web logic (airtime, Hunt_ID, link, found state, progress, setup draft, packs, QR layout and cards, beacon schedule and machine, route, note), then the flow and quiet-rule changes, then audio and hooks, then components, screens and App wiring. Tests are sub-tasks of the module they cover and all of them are required. All code is TypeScript in strict mode with no `any`.

### Findings from the existing code (checked before planning)

- `packages/core/src/index.ts` uses `.js` import suffixes and has no `hunt-clue` module. `PacketType` already has `hunt-clue`, and `encode()` accepts `{ type: 'hunt-clue', text }`. New Core files must follow the `.js` suffix style and pass `tests/static-scan.test.ts`. `tests/index.test.ts` may list the public exports, so it is updated in task 1.1.
- `apps/web/src/logic/flow.ts` has `Screen` with 7 values and `FlowState` with `received`. `back` with target `listen` only works from `reveal`, `garbled` and `sealed`, and returns the Listen screen in its `ready` phase, which needs a Start tap. So the "resume within 1000 ms" rule needs the `listen-handoff` module (task 7.5). Tests that list every `Screen` (`haunt-p14-quiet-state.property.test.ts`) and `flow.property.test.ts` must be updated.
- `Listen.tsx` calls `screenState(decode(bytes))`, dedupes by hex key with a module-level map, then calls `stopListening()` and dispatches `received`. There is no hook for a result that keeps capture running. Task 9.5 adds the Hunt route before `screenState` and keeps `resetListenDedupe`.
- `quietState` (`logic/haunt-rules.ts`) has three inputs and is used by `useHauntBridge` in `ui/hooks/useHaunt.ts`. Task 5.3 adds an optional `beaconActive`.
- `App.tsx` is an exhaustive `switch` on `flow.state.screen` and gets the new screens in task 10.1.
- `qrcode` (`^1.5.4`) and `@types/qrcode` are declared in `apps/web/package.json` and installed, but no file under `src` imports `qrcode` yet. `logic/wifi-qr.ts` only builds a Wi-Fi string. `jsqr` is not installed, so task 4.13 adds it as a dev dependency.
- `apps/web/tests/architecture.test.ts` already walks `src/logic` for React and browser-audio imports, so new logic files are checked without a new test. `tests/ui/theme.test.ts` exists and is extended in task 11.1. UI tests live in `tests/ui` and run under jsdom (`vitest.config.ts` `environmentMatchGlobs`). Logic and audio tests run under node.
- `useHold` (`ui/hooks/useHold.ts`) takes `onFired(contextRunning)` and is reused by the Beacon stop control. `OuijaBoard`, `spellShown` (`logic/ouija.ts`), `KIIMeter`, `CrtFrame`, `ToggleCluster`, `dedupeStep` and `HOLD_DURATION_MS` exist and are reused as the design says.
- `styles/` holds `tokens.css`, `motion.css` and `screens.css`, imported in `main.tsx`. A new `hunt.css` is imported there too.

## Tasks

- [ ] 1. Core clue builder and parser
  - [ ] 1.1 Implement `packages/core/src/hunt-clue.ts` and export it
    - Add `HUNT_ALPHABET`, `HUNT_ID_LENGTH`, `SPIRIT_TOTAL_MIN`, `SPIRIT_TOTAL_MAX`, `SPIRIT_NAME_MAX_BYTES`, `CLUE_SEPARATOR`, `ClueFields`, `ClueFieldsInput`, `sanitizeClueText`, `validateClueFields`, `buildClueText`, `buildClue` and `parseClueText` as in the design
    - Check fields in the order `huntId`, `total`, `index`, `name`, `clue`, and check size last through Core `encode()` so `too-large` passes through with its length
    - Make `parseClueText` strict: fixed 8-character header, one `U+001F`, canonical (sanitised) name and clue, non-string input gives `invalid-body`
    - Import only `result`, `utf8`, `codec` and `constants` with the `.js` suffix, and add the exports to `packages/core/src/index.ts`
    - Update `packages/core/tests/index.test.ts` if it lists the public exports
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12, 1.13, 1.14, 1.15, 1.16_

  - [ ] 1.2 Write property tests for the clue builder and parser in `packages/core/tests/hunt-clue.property.test.ts`
    - **Property 1: Clue round trip** (Validates: Requirements 1.2, 1.3, 1.5, 16.1)
    - **Property 2: Builder is total and bounded** (Validates: Requirements 1.1, 1.2, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 16.2)
    - **Property 3: Control characters never survive** (Validates: Requirements 1.4, 1.5)
    - **Property 4: First failing field is reported** (Validates: Requirements 1.12)
    - **Property 5: Builder is deterministic** (Validates: Requirements 1.16, 16.4)
    - **Property 6: Parser is total and strict** (Validates: Requirements 1.13, 1.14, 16.3)
    - Each property is its own `it`, tagged `Feature: ghost-hunt, Property N: <title>`, with `numRuns` of at least 100
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.17_

  - [ ] 1.3 Write unit tests for the clue builder and parser in `packages/core/tests/hunt-clue.test.ts`
    - One test per error field (`huntId`, `total`, `index`, `name`, `clue`) asserting code and field
    - A Packet of exactly 140 bytes accepted, and 141 bytes rejected with `too-large` and length 141
    - A 24-byte name accepted and a 25-byte name rejected with field `name`
    - Multi-byte characters in name and clue, and a control character replaced by one space
    - _Requirements: 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 16.5_

- [ ] 2. Standalone web logic modules
  - [ ] 2.1 Implement `apps/web/src/logic/airtime.ts`
    - `airtimeSeconds(packetBytes)` as `ceil(0.7 + 0.0614 * packetBytes)`, 0 for non-finite or negative input, never throws
    - `LONG_CLUE_THRESHOLD_BYTES` (100) and `longClueNote(packetBytes)` returning "Long clue: players must stay close for about N s." only above 100
    - No React and no audio API import
    - _Requirements: 4.12, 4.14, 4.15, 4.16, 4.17_

  - [ ] 2.2 Implement `apps/web/src/logic/hunt-id.ts`
    - `HUNT_ID_REJECT_FROM` (217) and `huntIdFromBytes(bytes)` returning `{ ok: true, id }` or `{ ok: false, reason: 'not-enough-bytes' }`
    - Skip bytes of 217 or more, map the rest with `HUNT_ALPHABET[b % 31]`, no clock or random source, never throws
    - Import `HUNT_ALPHABET` from `@screech/core`
    - _Requirements: 2.2, 2.4, 2.5, 2.6, 2.7_

  - [ ] 2.3 Implement `apps/web/src/logic/hunt-link.ts`
    - `encodeSetupLink(baseUrl, fields)` with a local `percentEncode` that keeps only `A-Za-z0-9-._~`, fixed parameter order, base fragment stripped, absolute http or https base required
    - `decodeSetupFragment(fragment)` returning `none`, `fields` or `error`, with the 2048 limit, first-`=` split, case-sensitive keys, digit-only `spirit` and `total`, duplicates and missing keys named, malformed percent-encoding caught, and field rules from `validateClueFields`
    - Input type has no Hide_At or Opening_Riddle
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11, 5.12, 5.13, 5.14, 5.15_

  - [ ] 2.4 Implement `apps/web/src/logic/beacon-schedule.ts`
    - `BEACON_MIN_MS`, `BEACON_MAX_MS`, `beaconInterval(random)` as `floor(15000 + r * 5001)` clamped to 20000, 15000 for any value that is not a finite number in `[0, 1)`
    - `countdownSeconds(nextAtMs, nowMs)` as `ceil(diff / 1000)` clamped to 0..20, 0 for non-finite input
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.15_

  - [ ] 2.5 Implement `apps/web/src/logic/hunt-found.ts`
    - `FoundEntry`, `FoundState`, `emptyFoundState`, `foundReducer`, `timeTakenSeconds`, `formatTimeTaken`, `CounterRow`, `counterRows`, `counterHeading`
    - Reducer returns the same state for another Hunt_ID, another total, an already found index, or a completed Hunt, and never mutates its input
    - _Requirements: 11.1, 11.2, 11.3, 11.5, 11.6, 11.8, 11.9, 11.10, 11.12, 11.13, 11.14, 13.1, 13.2, 13.3, 13.4_

  - [ ] 2.6 Implement `apps/web/src/logic/qr-layout.ts`
    - `QR_QUIET_MODULES` (4), `QR_MIN_CSS_PX_PER_MODULE` (3), `QR_MAX_CSS_PX_PER_MODULE` (8), `QR_MIN_CSS_SIZE` (160) and `layoutQr(moduleCount, availableCssPx, devicePixelRatio)`
    - `modulePx = floor(min(available / (n + 8), 8) * dpr)`, integer device pixels, `fits` as the design states
    - _Requirements: 6.4, 6.6_

  - [ ] 2.7 Implement `apps/web/src/logic/riddle-packs.ts`
    - `PackId`, `PackEntry`, `RiddlePack` and `RIDDLE_PACKS` with `office`, `home` and `classroom`, each with one opening, 7 entries (name, Hide_At, clue) and one finale
    - ASCII only, names up to 18 bytes and clues up to 60 bytes so every Packet stays at or under 90 bytes, clue k leads to the Hide_At of entry k+1, the opening leads to entry 1, the finale says the Hunt is over and where to return
    - _Requirements: 3.5, 3.6, 3.8_

  - [ ] 2.8 Write tests for `airtime.ts` in `apps/web/tests/logic/airtime.property.test.ts` and `airtime.test.ts`
    - **Property 13: Airtime** (Validates: Requirements 4.12, 4.13, 4.17, 16.14)
    - Unit tests: 26 bytes within 1 s of 2.3 s, 53 bytes within 1 s of 4 s, 140 bytes within 1 s of 9.3 s, and 0, `NaN`, -1, `Infinity` give 0 where the design says so
    - Unit test for `longClueNote` at 100 bytes (null) and 101 bytes (text)
    - _Requirements: 4.12, 4.13, 4.15, 4.16, 4.17, 16.14_

  - [ ] 2.9 Write tests for `hunt-id.ts` in `apps/web/tests/logic/hunt-id.property.test.ts`
    - **Property 7: Hunt_ID generation** (Validates: Requirements 2.2, 2.4, 2.5, 2.6, 2.7, 16.12)
    - Unit tests: all bytes 217 or more gives the error, a known byte array gives a known ID
    - _Requirements: 2.4, 2.5, 2.6, 2.7, 16.12_

  - [ ] 2.10 Write tests for `hunt-link.ts` in `apps/web/tests/logic/hunt-link.property.test.ts` and `hunt-link.test.ts`
    - **Property 8: Setup link shape and escaping** (Validates: Requirements 5.1, 5.2, 5.3, 5.4)
    - **Property 9: Setup link round trip** (Validates: Requirements 5.5, 5.6, 16.6)
    - **Property 10: Fragment decoding is total, deterministic and consistent** (Validates: Requirements 5.7, 5.8, 5.9, 5.10, 5.11, 5.12, 5.13, 5.14, 16.7)
    - Unit tests: empty fragment, only `#`, missing parameter, duplicated parameter, malformed percent-encoding, five parameters in another order, fragment over 2048 characters, `&`, `=`, `#`, `%`, `+` in name and clue
    - _Requirements: 5.1 to 5.14, 16.6, 16.7_

  - [ ] 2.11 Write tests for `beacon-schedule.ts` in `apps/web/tests/logic/beacon-schedule.property.test.ts` and `beacon-schedule.test.ts`
    - **Property 24: Beacon interval** (Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 16.10)
    - **Property 25: Countdown** (Validates: Requirements 8.15, 16.11)
    - Unit tests at random values 0, 0.5, the largest number below 1, `NaN`, 1, -1, and countdown at equal times, 1 ms before, 1 ms after and 20000 ms after
    - _Requirements: 8.1 to 8.5, 8.15, 16.10, 16.11_

  - [ ] 2.12 Write tests for `hunt-found.ts` in `apps/web/tests/logic/hunt-found.property.test.ts` and `hunt-found.test.ts`
    - **Property 30: Found reducer counts each Spirit once** (Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.9, 11.10, 16.8)
    - **Property 31: Completion exactly at the total** (Validates: Requirements 11.5, 11.6, 11.7, 11.8, 14.1, 16.8)
    - **Property 32: Reducer confluence** (Validates: Requirements 11.11, 16.8)
    - **Property 33: Time taken and its format** (Validates: Requirements 11.12, 11.13, 14.3)
    - **Property 35: Spirit counter rows** (Validates: Requirements 13.1, 13.2, 13.3, 13.4, 13.10)
    - Unit tests: first-find stamp, completion stamp, other Hunt_ID, other total, input after completion, negative difference gives 0
    - _Requirements: 11.1 to 11.13, 13.1 to 13.4, 14.3, 16.8, 16.9_

  - [ ] 2.13 Write tests for `qr-layout.ts` in `apps/web/tests/logic/qr-layout.property.test.ts`
    - **Property 12: QR layout is crisp, large enough and fits** (Validates: Requirements 6.4, 6.6, 15.2)
    - Unit test: 81 modules at 340 CSS px fits at device pixel ratios 1, 2 and 3
    - _Requirements: 6.4, 6.6_

  - [ ] 2.14 Write tests for `riddle-packs.ts` in `apps/web/tests/logic/riddle-packs.property.test.ts` and `riddle-packs.test.ts`
    - **Property 14: Built-in pack texts are valid** (Validates: Requirements 3.5, 3.8, 16.13)
    - **Property 15: Built-in clues fit in 90 bytes** (Validates: Requirements 3.8, 16.13)
    - Unit tests: the three pack names, 7 entries, one opening and one finale each, and a hand-checked chain from the opening to entry 1
    - _Requirements: 3.5, 3.6, 3.8, 16.13_

- [ ] 3. Checkpoint - Ensure all tests pass
  - Run `pnpm test` from the root. Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Dependent web logic
  - [ ] 4.1 Implement `apps/web/src/logic/hunt-progress.ts`
    - `StorageLike`, `PROGRESS_KEY_PREFIX` (`screech.hunt.`), `serializeFoundState`, `parseFoundState(text, expectedHuntId)`, `createProgressStore(storage | null)` with an in-memory map, `load`, `save` returning `{ persisted }`, `clear` returning `{ cleared }`
    - Storage only inside `try`, unreadable stored text is never deleted or overwritten by `load`, stored JSON has no clue text, Hide_At or opening
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.10, 12.11_

  - [ ] 4.2 Implement `apps/web/src/logic/hunt-setup.ts`
    - `SetupRow`, `SetupDraft` (7 rows always, `total`, `opening`, `openingCustom`, `appliedPack`, `pendingPack`, `packNote`), `setupReducer`, `initialDraft` (total 5), `fillPack`, `customCountToOverwrite`, `measureText`, `HIDE_AT_MAX` (40), `OPENING_MAX` (200)
    - `choosePack` fills at once when no field it would write holds Custom_Text, otherwise sets `pendingPack`. `confirmPack` and `cancelPack` as in the design. `setTotal` re-applies the pack or sets `packNote`
    - `rowStatus` with one `buildClue` call per row, labels `<size>/140 bytes · about <N> s` and `Too heavy to cross over (<n>/140 bytes)`, and the Long_Clue_Note above 100 bytes. `setupView` with `limitProblems`, `summary` and `canMakeLinks`
    - No typed text is ever changed by validation
    - _Requirements: 3.2, 3.3, 3.4, 3.7, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14, 3.15, 3.16, 3.18, 3.19, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.15, 4.16_

  - [ ] 4.3 Implement `apps/web/src/logic/hunt-note.ts`
    - `AlreadyNote` (with `huntId`), `NoteState`, `NoteEvent`, `EMPTY_NOTE`, `noteReducer`, `noteText` ("Already found · Spirit N of M · <name>")
    - Same Hunt_ID and index returns the input state unchanged, a different Spirit replaces the note with `clueShown: false` and a new `announceId`, `clear` returns `EMPTY_NOTE`
    - _Requirements: 10.8, 10.9, 10.15, 10.16, 10.17_

  - [ ] 4.4 Implement `apps/web/src/logic/beacon-machine.ts`
    - `BeaconState`, `BeaconEvent`, `BeaconCommand`, `beaconStep(state, event)` using `beaconInterval` from `beacon-schedule.ts`
    - Next due time is the previous screech start plus a new interval, `visible` after a long sleep gives one screech, a playing screech delays the next one, `wakeSucceeded` returns `screech` only from `quiet`, nothing happens after `stop`
    - _Requirements: 8.6, 8.7, 8.8, 8.9, 8.10, 8.11, 9.5, 9.6, 9.8_

  - [ ] 4.5 Write tests for `hunt-progress.ts` in `apps/web/tests/logic/hunt-progress.property.test.ts` and `hunt-progress.test.ts`
    - **Property 34: Saved progress** (Validates: Requirements 12.3, 12.4, 12.5, 12.11, 16.12)
    - Unit tests: unavailable storage (`null`), a storage that throws on read or write, text that is not a valid Found_State, two Hunt_IDs under separate keys, `clear` that throws
    - _Requirements: 12.1 to 12.5, 12.10, 12.11, 16.12_

  - [ ] 4.6 Write tests for `hunt-setup.ts` in `apps/web/tests/logic/hunt-setup.property.test.ts` and `hunt-setup.test.ts`
    - **Property 16: Filling a pack for a total** (Validates: Requirements 3.7, 3.11, 16.15)
    - **Property 17: Pack choice never destroys typed text without confirmation** (Validates: Requirements 3.9, 3.10, 3.11, 3.12)
    - **Property 18: Total change keeps and restores rows** (Validates: Requirements 3.3, 3.4, 3.9)
    - **Property 19: Total change re-applies or leaves the pack** (Validates: Requirements 3.13, 3.14, 16.15)
    - **Property 20: Hide_At and Opening_Riddle measure and limits** (Validates: Requirements 3.15, 3.16)
    - **Property 21: Hide_At and Opening_Riddle never reach the Packet or the link** (Validates: Requirements 3.18, 4.9, 16.15)
    - **Property 22: Row status mirrors the builder** (Validates: Requirements 3.19, 4.1 to 4.7, 4.9, 4.10, 4.15, 4.16)
    - Unit tests: a row at 100 bytes (no note), 101 bytes (note) and 140 bytes (no error), an incomplete row named in the summary, Hide_At of 40 and 41 characters, an opening of 200 and 201 characters
    - _Requirements: 3.2 to 3.4, 3.7, 3.9 to 3.16, 3.18, 3.19, 4.1 to 4.10, 4.15, 4.16, 16.15_

  - [ ] 4.7 Write tests for `hunt-note.ts` in `apps/web/tests/logic/hunt-note.property.test.ts`
    - **Property 29: Already_Note state** (Validates: Requirements 10.8, 10.9, 10.15, 10.16, 10.17)
    - Unit tests for the note text and for a note from another Hunt_ID with the same index
    - _Requirements: 10.8, 10.9, 10.15, 10.16, 10.17_

  - [ ] 4.8 Write tests for `beacon-machine.ts` in `apps/web/tests/logic/beacon-machine.property.test.ts` and `beacon-machine.test.ts`
    - **Property 26: Beacon machine safety** (Validates: Requirements 8.6 to 8.11, 9.5, 9.6, 9.8)
    - Unit tests: first screech at start, a screech still playing at the due time, a page that was hidden for 10 minutes sends exactly one screech, `stop` cancels, a builder skip keeps the schedule
    - _Requirements: 8.6 to 8.11, 9.5, 9.6, 9.8_

  - [ ] 4.9 Implement `apps/web/src/logic/qr-cards.ts`
    - `QrCardModel`, `PrintModel` and `buildPrintModel(huntId, draft, baseUrl)` returning `null` when links cannot be made
    - Cards in ascending index order, title "Spirit N of M", sanitised name, Hunt_ID, `Hide at: <Hide_At>` only when not empty, `alt` text, link from `encodeSetupLink`, `opening` only when not empty
    - _Requirements: 3.21, 6.2, 6.5, 6.12, 6.13, 6.16_

  - [ ] 4.10 Implement `apps/web/src/logic/hunt-route.ts`
    - `HuntRoute`, `huntRoute(result)` (`none` for multipart `hunt-clue`, `garbled` when the text does not parse, `clue` otherwise), `HuntIntake`, `HuntNavIntake` and `huntIntake(store, fields, nowMs)`
    - `new` saves before returning, `already` and `complete` write nothing, `already` carries the name stored at the first find
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.7, 10.8, 10.14, 12.1, 12.2, 14.9, 14.10_

  - [ ] 4.11 Write tests for `qr-cards.ts` in `apps/web/tests/logic/qr-cards.property.test.ts`
    - **Property 23: QR cards and print model** (Validates: Requirements 3.21, 6.5, 6.12, 6.13, 6.16)
    - Unit tests: empty Hide_At gives no line, empty opening gives `null`, blocked draft gives `null`
    - _Requirements: 3.21, 6.5, 6.12, 6.13, 6.16_

  - [ ] 4.12 Write tests for `hunt-route.ts` in `apps/web/tests/logic/hunt-route.property.test.ts` and `hunt-route.test.ts`
    - **Property 27: Hunt packet routing** (Validates: Requirements 10.1, 10.2, 10.3, 10.7)
    - **Property 28: Hunt_Intake classification** (Validates: Requirements 10.4, 10.5, 10.8, 10.14, 12.1, 12.2, 14.9, 14.10, 16.16)
    - Use a spying fake storage. Unit tests: an `already` intake changes no Found_State and makes 0 storage writes, a stored invalid state is treated as empty (first find)
    - _Requirements: 10.1 to 10.8, 10.14, 12.1, 12.2, 14.9, 14.10, 16.16_

  - [ ] 4.13 Write the QR scan test in `apps/web/tests/logic/qr-scan.property.test.ts`
    - Add `jsqr` as a dev dependency of `apps/web` (`pnpm --filter @screech/web add -D jsqr`)
    - **Property 11: A full-size Setup QR scans** (Validates: Requirements 6.1, 6.4)
    - Build links with `encodeSetupLink`, build the matrix with `QRCode.create(link, { errorCorrectionLevel: 'M' })`, lay it out with `layoutQr` at 340 CSS px and device pixel ratios 1, 2 and 3, rasterise with a 4-module quiet zone and the app colours, decode with `jsQR`
    - Generator favours the longest links (24-byte names, clues filling 128 bytes, punctuation, accents, emoji, CJK) and base URLs of 20 to 100 characters
    - _Requirements: 6.1, 6.4_

- [ ] 5. Flow and quiet-state changes
  - [ ] 5.1 Extend `apps/web/src/logic/flow.ts`
    - Add `'hunt-setup' | 'hunt-reveal' | 'hunt-complete'` to `Screen`, `huntReturn` and `hunt` to `FlowState` and `INITIAL_FLOW_STATE`
    - Add events `openHuntSetup`, `closeHuntSetup`, `huntReceived` (carries a `HuntNavIntake`), `huntRevealDone`, `huntBack` and `huntRestart`
    - `openHuntSetup` works from `awaken` and `speak` without mic status and does nothing while transmitting or listening. `huntReceived` sets `listening: false` and routes `new` to `hunt-reveal` and `complete` to `hunt-complete`. No event exists for an `already` clue
    - Leave every existing event unchanged
    - _Requirements: 3.1, 10.5, 10.8, 10.11, 10.14, 14.1, 14.6, 14.7, 14.8, 14.9_

  - [ ] 5.2 Update and extend flow tests in `apps/web/tests/logic/flow.test.ts` and `flow.property.test.ts`
    - Unit tests: `openHuntSetup` from awaken and speak without a granted mic, ignored while transmitting or listening, `huntReceived` routes `new` to `hunt-reveal` and `complete` to `hunt-complete`, `huntRevealDone` goes to `hunt-complete` only after the last Spirit
    - Extend the existing property generators so they include the new events and screens, and keep the exclusion properties passing
    - _Requirements: 3.1, 10.5, 10.14, 14.1_

  - [ ] 5.3 Add `beaconActive` to `quietState` in `apps/web/src/logic/haunt-rules.ts`
    - Optional `beaconActive` (default `false`) forces quiet
    - Treat `hunt-setup`, `hunt-reveal` and `hunt-complete` as non-quiet screens, so Quiet_State rules of `haunting-sounds` do not change
    - _Requirements: 7.10, 10.20, 14.11_

  - [ ] 5.4 Update quiet-state tests in `apps/web/tests/logic/haunt-p14-quiet-state.property.test.ts` and `haunt-rules.test.ts`
    - Add the three new screens to the `SCREENS` list and a case for `beaconActive` true
    - Keep every existing assertion passing unchanged
    - _Requirements: 7.10_

- [ ] 6. Checkpoint - Ensure all tests pass
  - Run `pnpm test` from the root. Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Audio, hooks and shared browser state
  - [ ] 7.1 Implement `apps/web/src/audio/wake-lock.ts`
    - `WakeStatus`, `WakeController`, `createWakeController(nav?)` with `acquire`, `release` and `onChange`
    - Returns `unsupported` when `navigator.wakeLock` is missing and `rejected` when the request throws, never throws itself
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.10_

  - [ ] 7.2 Write tests for `wake-lock.ts` in `apps/web/tests/audio/wake-lock.test.ts`
    - Fake `navigator`: granted, rejected, unsupported, browser-initiated release, release after acquire, release without acquire
    - _Requirements: 9.1, 9.3, 9.4, 9.10_

  - [ ] 7.3 Implement `apps/web/src/ui/hooks/useBeacon.ts`
    - Own the `BeaconState`, a 250 ms interval that reads `Date.now()`, and a `visibilitychange` listener that calls `ensureRunning()` and `beaconStep(visible)`
    - On a `screech` command: `ensureRunning`, a 1000 ms check that the context is running (else `contextFailed`), `buildClue` (error sends `screechSkipped` with a plain-words message), read the sample rate from the context at that moment, `loadEngine`, encode at `TRANSMIT_VOLUME`, `playWaveform`, `screechStarted`, then `screechEnded`
    - Start handler calls `unlockAudio()` as its first statement, races it against 3000 ms, then dispatches `start` and `acquire`. Stop cuts a playing screech and releases the wake lock. Wake handler calls `unlockAudio()` first
    - Return `{ phase, countdownSeconds, screeching, wake, quiet, error, start, stop, wake tap handler }`
    - _Requirements: 7.5, 7.6, 7.7, 7.12, 8.6 to 8.14, 9.1 to 9.12_

  - [ ] 7.4 Implement `apps/web/src/ui/hooks/useSpelling.ts`
    - The spelling timer used by `Reveal` (`performance.now`, 40 ms tick, `spellShown`), with no Haunting Sound calls, skip support and Reduced_Motion behaviour
    - _Requirements: 10.5, 15.6_

  - [ ] 7.5 Implement `apps/web/src/ui/hooks/listen-handoff.ts`
    - `queueListenStart(promise)` and a one-shot `takeListenStart()` that Listen consumes on mount
    - _Requirements: 10.11_

  - [ ] 7.6 Implement `apps/web/src/ui/hooks/progress-store.ts`
    - One shared `ProgressStore` created with `createProgressStore`, passing `window.localStorage` inside `try` or `null` when access throws
    - Used by Listen, HuntReveal and HuntComplete so the in-memory fallback is shared
    - _Requirements: 12.1, 12.2, 12.5, 12.6_

  - [ ] 7.7 Pass `beaconActive` through `useHauntBridge` in `apps/web/src/ui/hooks/useHaunt.ts`
    - Add an optional third argument `beaconActive` (default `false`) and forward it to `quietState`
    - _Requirements: 7.10_

  - [ ] 7.8 Write tests for `useBeacon` in `apps/web/tests/ui/use-beacon.test.tsx`
    - Fake timers, fake audio session, fake engine and fake wake controller
    - No sound before start, `unlockAudio` is the first call in the start handler, 3000 ms timeout message, first screech within 1000 ms of start, no overlap, `ensureRunning` before each screech, sample rate read per screech, context failure shows the quiet state and a wake tap resumes with one screech, builder error skips and keeps the schedule, stop cancels all timers and releases the wake lock
    - _Requirements: 7.5, 7.6, 7.7, 7.12, 8.6 to 8.14, 9.1 to 9.12_

- [ ] 8. Styles and components
  - [ ] 8.1 Add `apps/web/src/styles/hunt.css` and import it in `apps/web/src/main.tsx`
    - `.screen-wide` (wider container at 1280 px, single column at 390 px), `.qr-card`, `.hunt-opening` (24 px or more), byte counter states, Already_Note, Spirit_Counter marks, Beacon text
    - A `@media print` block: white page, black text and modules, every control, input and message hidden, `.qr-card { break-inside: avoid; page-break-inside: avoid; }`, `break-after: avoid` on the opening, QR 60 mm square
    - Every control uses `.hit` (44 px). Blood red only on error states. Motion off under Reduced_Motion and the Exorcise toggle
    - _Requirements: 3.17, 3.22, 6.4, 6.13, 6.14, 6.15, 13.9, 14.12, 15.1 to 15.9_

  - [ ] 8.2 Implement `apps/web/src/ui/components/SetupQr.tsx`
    - `QRCode.create(link, { errorCorrectionLevel: 'M' })`, draw the matrix as an inline `<svg>` with one `<path>`, `shape-rendering="crispEdges"`, a `viewBox` in modules with the 4-module quiet zone, size from `layoutQr`, `role="img"` and the model's `alt`
    - On a throw or `fits: false`, show the link as selectable text and a plain-words message. Redraw when `link` changes
    - _Requirements: 6.1, 6.3, 6.4, 6.5, 6.6, 6.10_

  - [ ] 8.3 Implement `apps/web/src/ui/components/QrCard.tsx`
    - Render one `QrCardModel`: `SetupQr`, "Spirit N of M", name, Hunt_ID and the "Hide at:" line when present, as plain text
    - _Requirements: 3.21, 6.5, 6.12_

  - [ ] 8.4 Implement `apps/web/src/ui/components/ByteCounter.tsx`
    - Show `RowStatus.label` in a polite live region, the Long_Clue_Note in bone white, and for errors a visible text label as well as blood red
    - 140/140 stays bone white with no error
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.11, 4.15, 4.16_

  - [ ] 8.5 Implement `apps/web/src/ui/components/PackConfirm.tsx`
    - Inline confirmation that states the number of fields holding Custom_Text, with confirm and cancel controls of 44 px or more
    - _Requirements: 3.10_

  - [ ] 8.6 Implement `apps/web/src/ui/components/SpiritCounter.tsx`
    - `counterHeading` and `counterRows`: filled shape and name for found, unfilled shape and "unknown" for the rest, names wrap with `overflow-wrap: anywhere`, one text value for assistive technology, names as plain text
    - _Requirements: 13.1 to 13.12_

  - [ ] 8.7 Implement `apps/web/src/ui/components/AlreadyNote.tsx`
    - A `role="status"` `aria-live="polite"` element holding `noteText`, keyed by `announceId`, the "Read clue again" control (44 px or more), and the Clue_Text as plain text outside the live region after activation
    - Text wraps at 320 px, nothing truncated, no link rendering, no sound
    - _Requirements: 10.8, 10.9, 10.15, 10.18, 10.19, 10.20, 10.22_

  - [ ] 8.8 Write component tests for `SetupQr` and `QrCard` in `apps/web/tests/ui/qr-card.test.tsx`
    - The SVG has `role="img"` and the alt text, redraws with the new link, a throwing `qrcode` shows the link text and a message, a non-fitting layout shows the link text, no `fetch` call, Hide_At line shown only when not empty
    - _Requirements: 6.1, 6.3, 6.5, 6.6, 6.10, 3.21_

  - [ ] 8.9 Write component tests for `ByteCounter` and `PackConfirm` in `apps/web/tests/ui/byte-counter.test.tsx`
    - OK label, exactly 140 bytes (no error), 141 bytes error text, Long_Clue_Note above 100 bytes, no note at 100 bytes, invalid field message, confirm and cancel callbacks, the count in the confirmation text
    - _Requirements: 3.10, 4.2 to 4.5, 4.11, 4.15, 4.16_

  - [ ] 8.10 Write component tests for `SpiritCounter` and `AlreadyNote` in `apps/web/tests/ui/spirit-counter.test.tsx` and `already-note.test.tsx`
    - Counter shows exactly Y entries with "unknown" for unfound, wraps a long name, renders `<b>` in a name as text. Note shows the exact text, Read clue again shows the clue as plain text, a link in the clue is not rendered as a link, the same note is not re-announced
    - _Requirements: 10.8, 10.9, 10.15, 10.18, 10.19, 13.1 to 13.4, 13.7, 13.8, 13.10, 13.11_

- [ ] 9. Screens
  - [ ] 9.1 Implement `apps/web/src/ui/screens/HuntSetup.tsx`
    - `.screen.screen-wide`. Opening_Riddle input and a large text display at the top (24 px or more), total selector with exactly 3 to 7, three pack buttons with `PackConfirm`, one row per Spirit (Spirit_Index, name, Hide_At and clue inputs each with a visible label naming field and index), `ByteCounter`, `QrCard`, copy control with 2 to 5 second confirmation and a selectable-text fallback
    - Hunt_ID generated on open with `crypto.getRandomValues` in `try` (failure shows the plain-words message and disables link controls), shown as text, and a regenerate control that keeps all typed text
    - Print control that calls `window.print()` in `try`, disabled when `canMakeLinks` is false. Base URL is the page origin and path with query and fragment removed. Makes no network request
    - Back control dispatches `closeHuntSetup`
    - _Requirements: 2.1, 2.3, 2.8, 2.9, 2.10, 2.11, 3.1, 3.2, 3.3, 3.16, 3.17, 3.19, 3.20, 3.21, 3.23, 4.1, 4.6, 4.7, 6.1, 6.2, 6.7 to 6.11, 6.17, 15.3_

  - [ ] 9.2 Implement `apps/web/src/ui/screens/Beacon.tsx` and `BeaconError.tsx`
    - Beacon: heading "BEACON · Spirit N of M", name and Hunt_ID as text, start control (44 px), clue shown only while running, "Next screech in N s" or "Screeching now", wake text, volume and silent-switch text, "Tap to wake the beacon", hold-to-stop key using `useHold`, no sound, no mic, no URL opened
    - BeaconError: plain-words error (for `too-large`, "Too heavy to cross over (<n>/140 bytes)") and "Open the normal app" that strips the fragment with `history.replaceState` and shows Awaken without a reload
    - Reduced_Motion makes the countdown update with 0 ms transitions
    - _Requirements: 7.1 to 7.15, 8.13, 8.14, 8.16, 9.1 to 9.11_

  - [ ] 9.3 Implement `apps/web/src/ui/screens/HuntReveal.tsx`
    - Spirit_Name and "Spirit N of M" first, then `OuijaBoard` driven by `useSpelling`, skip control, then `SpiritCounter` and the Follow_Line "Follow the K-II meter. More lights, closer spirit." as one static line
    - Note "Progress will be lost when this page closes." when `persisted` is false, clear control with a confirm step naming the Hunt_ID and the number of found Spirits, "The saved progress could not be cleared." on failure
    - Back to Listen calls `unlockAudio()` first and `queueListenStart`, then dispatches the back event. When the last Spirit ends or is skipped it dispatches `huntRevealDone`. Plays no sound
    - _Requirements: 10.5, 10.6, 10.11, 10.18, 10.19, 10.20, 12.6 to 12.10, 13.5, 13.6, 13.13, 14.1_

  - [ ] 9.4 Implement `apps/web/src/ui/screens/HuntComplete.tsx`
    - "Hunt complete" in phosphor green, `M:SS` from `formatTimeTaken`, every Spirit by index, Hunt_ID, "Spirits found: Y of Y", Return to Speak, Start over with a confirm step that clears the Hunt through the shared store and resumes Listen through `queueListenStart`
    - Declining keeps the screen and the Found_State. No sound, no animation other than state-driven, 0 ms durations under Reduced_Motion
    - _Requirements: 14.2 to 14.8, 14.11, 14.12, 14.13_

  - [ ] 9.5 Extend `apps/web/src/ui/screens/Listen.tsx` for Hunt packets
    - In `onPacketBytes`, call `huntRoute(decode(bytes))` before `screenState`. `none` keeps the existing path
    - `garbled`: clear the note, then the existing garbled path. `clue`: dedupe with the existing module-level map (key `hunt:` plus hex), then `huntIntake` with the shared store. `already` dispatches the note event and does not stop capture. `new` and `complete` clear the note, stop listening and dispatch `huntReceived`
    - Hold `useReducer(noteReducer, EMPTY_NOTE)`, render `AlreadyNote` above `KIIMeter`, clear it whenever listening stops and on unmount, and consume `takeListenStart()` on mount to start without a second tap
    - Keep `resetListenDedupe` and every existing label and test id
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.7, 10.8, 10.11, 10.12, 10.13, 10.14, 10.15, 10.16, 10.17, 10.21, 10.22_

  - [ ] 9.6 Add the Ghost Hunt entry control to `Awaken.tsx` and `Speak.tsx`
    - A control (44 px or more) that dispatches `openHuntSetup` and requests no microphone access
    - _Requirements: 3.1_

  - [ ] 9.7 Write component tests for `HuntSetup` in `apps/web/tests/ui/hunt-setup.test.tsx`
    - Hunt_ID shown on open, regenerate keeps rows, failing `crypto.getRandomValues` disables link controls, opening riddle shown at the top, labels name field and index, pack confirmation shows the count and cancel leaves text alone, incomplete row named, one error blocks every QR, over-limit Hide_At message, clipboard success and failure, `window.print` throwing shows the message, print disabled when blocked, no `fetch` call
    - _Requirements: 2.1, 2.3, 2.9, 2.11, 3.10, 3.12, 3.16, 3.17, 3.19, 3.23, 4.6, 6.8, 6.9, 6.10, 6.11, 6.17_

  - [ ] 9.8 Write component tests for `Beacon` and `BeaconError` in `apps/web/tests/ui/beacon.test.tsx`
    - No mic request, no sound before the tap, clue hidden before start and after stop, a tap does not stop and a hold does, `<b>` in a name rendered as text, wake text for granted, released, rejected and unsupported, "Tap to wake the beacon" flow, too-large and fragment errors with the open-normal-app control, no Haunting Sound
    - _Requirements: 7.1 to 7.15, 9.1 to 9.11_

  - [ ] 9.9 Write component tests for `HuntReveal` and `HuntComplete` in `apps/web/tests/ui/hunt-reveal.test.tsx` and `hunt-complete.test.tsx`
    - Reveal: name and "Spirit N of M" before spelling, counter after spelling or skip, Follow_Line text, links not rendered as links, no URL opened, no sound, back resumes capture, clear with confirm and cancel, save-failure note, clear-failure note
    - Complete: shown after the last reveal, saved completed Hunt skips spelling, `M:SS` text, start over with confirm and decline
    - _Requirements: 10.5, 10.6, 10.11, 10.18 to 10.21, 12.6 to 12.10, 13.5, 13.6, 13.13, 14.1 to 14.9_

  - [ ] 9.10 Write component tests for Listen with Hunt packets in `apps/web/tests/ui/listen-hunt.test.tsx`
    - An `already` clue shows the Already_Note above the K_II_Meter with the exact text, capture keeps running, no navigation, no sound, 0 store writes. Read clue again shows plain text. A repeat of the same Spirit leaves note and clue unchanged. A different found Spirit replaces the note and hides the clue. A `new` clue, a garbled clue or a stop removes the note. A repeat within 5 seconds is ignored and one after 5 seconds is handled again. A multipart `hunt-clue` is ignored. Existing `listen.test.tsx` stays unchanged and passing
    - _Requirements: 10.1 to 10.4, 10.7, 10.8, 10.9, 10.12, 10.13, 10.15, 10.16, 10.17_

  - [ ] 9.11 Write component tests for the entry control in `apps/web/tests/ui/hunt-entry.test.tsx`
    - The control appears on Awaken and Speak, opens the setup screen without a mic request, does nothing while transmitting or listening
    - _Requirements: 3.1_

- [ ] 10. App wiring
  - [ ] 10.1 Wire the screens in `apps/web/src/ui/App.tsx`
    - Read `decodeSetupFragment(location.hash)` once before the first render: `fields` with a good `buildClue` shows `Beacon`, `too-large` or `error` shows `BeaconError`, `none` keeps the existing flow
    - Add `hunt-setup`, `hunt-reveal` and `hunt-complete` cases to the switch and pass `beaconActive` to `useHauntBridge`
    - _Requirements: 3.1, 7.1, 7.13, 7.14, 7.15, 10.5, 14.1, 14.9_

  - [ ] 10.2 Write App-level tests in `apps/web/tests/ui/hunt-flow.test.tsx`
    - A valid fragment opens the Beacon with no mic request and no sound, an invalid fragment shows the error, a clean URL opens Awaken. A full pass: setup, new clue, Hunt_Reveal, back, an already-found clue shows the note and stays on Listen, the last clue shows Hunt_Complete. Existing `full-flow.test.tsx` stays passing
    - _Requirements: 7.1, 7.13, 7.14, 10.5, 10.8, 14.1_

- [ ] 11. Static and theme checks
  - [ ] 11.1 Extend `apps/web/tests/ui/theme.test.ts` for Ghost Hunt
    - Every Ghost Hunt control uses `.hit`, every text and background pair has a contrast ratio of at least 4.5:1 (Already_Note, Byte_Counter, Long_Clue_Note, QR card), blood red only on error states, no emoji, no gradient, print block has `break-inside: avoid` on `.qr-card`, a white background, dark text and hidden controls
    - _Requirements: 4.11, 6.14, 6.15, 13.12, 14.13, 15.1, 15.4, 15.5, 15.8_

  - [ ] 11.2 Add `apps/web/tests/ui/hunt-static.test.ts`
    - Scan the Ghost Hunt source files for `fetch`, `XMLHttpRequest` and `sendBeacon` (0 allowed), for the `any` type, and for any import of `qrcode` outside `SetupQr.tsx`
    - Check that `hunt-progress.ts` takes storage as a parameter and reads no global `localStorage`
    - _Requirements: 6.10, 15.13, 15.14_

- [ ] 12. Final checkpoint - Ensure all tests pass
  - Run `pnpm test` and `pnpm build` from the root. Ensure all tests pass, ask the user if questions arise.

## Notes

- Every test task is required. No task in this plan is optional.
- Each task references requirement clauses for traceability, and each property test names its property from the design.
- Waves in the dependency graph put a module before its tests and before every file that imports it. Tasks that edit the same file are in different waves.
- Setup, Beacon and result screens are verified in jsdom. Layout at 320, 390, 430 and 1280 px, print output and Beacon behaviour on a locked phone are manual checks and are not tasks.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "2.2", "2.4", "2.6", "2.7", "7.1", "7.4", "7.5", "8.1", "8.5"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.3", "2.5", "2.8", "2.9", "2.11", "2.13", "2.14", "4.2", "4.3", "4.4", "7.2", "8.2"] },
    { "id": 2, "tasks": ["2.10", "2.12", "4.1", "4.6", "4.7", "4.8", "4.9", "4.13", "7.3", "8.4", "8.6", "8.7"] },
    { "id": 3, "tasks": ["4.5", "4.10", "4.11", "7.6", "7.8", "8.3", "8.9", "8.10", "9.2"] },
    { "id": 4, "tasks": ["4.12", "5.1", "8.8", "9.8"] },
    { "id": 5, "tasks": ["5.2", "5.3", "9.1", "9.3", "9.4", "9.5", "9.6"] },
    { "id": 6, "tasks": ["5.4", "7.7", "9.7", "9.9", "9.10", "9.11"] },
    { "id": 7, "tasks": ["10.1"] },
    { "id": 8, "tasks": ["10.2", "11.1", "11.2"] }
  ]
}
```
