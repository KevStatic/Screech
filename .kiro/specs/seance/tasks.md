# Implementation Plan: Séance

## Overview

The plan runs in this order: Core pure logic with property tests, then the Checkin_API (handler logic in `src/`, one thin Netlify Function entry file per endpoint) with in-memory store tests, then web logic, then the screens and wiring, then `netlify.toml`, local-dev setup, the README and final checks. All code is TypeScript (strict, no `any`), following the design. Every task builds on the earlier ones, and the wiring task connects everything so no module is left orphaned. Every test task is required.

## Tasks

- [x] 1. Core: Checkin_Builder and Checkin_Parser
  - [x] 1.1 Implement `packages/core/src/checkin-body.ts`
    - Add `CheckinFields`, `CheckinFieldsInput`, `CHECKIN_PREFIX`, `SESSION_ID_LENGTH`, `ROLLING_CODE_LENGTH`
    - Add `validateCheckinFields`, `buildCheckinText`, `buildCheckin` (validate, text, `encode()`) and `parseCheckinText` (strict inverse that rebuilds the canonical text and rejects any mismatch)
    - Reuse `HUNT_ALPHABET` from `hunt-clue.ts`; follow the check orders in 1.5 and 1.6; never throw
    - Export the new API from `packages/core/src/index.ts`
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 1.7_

  - [x] 1.2 Write property test for the fixed layout and size cap
    - **Property 1: Checkin_Builder produces a fixed, size-capped layout**
    - **Validates: Requirements 1.1, 1.2**

  - [x] 1.3 Write property test for the round trip
    - **Property 2: Build/encode/decode/parse round trip**
    - **Validates: Requirements 1.3, 1.4**

  - [x] 1.4 Write property test for parser rejection
    - **Property 3: Parser rejects every malformed text, and only malformed text**
    - **Validates: Requirements 1.5**

  - [x] 1.5 Write property test for builder rejection
    - **Property 4: Builder rejects every malformed field, and only malformed fields**
    - **Validates: Requirements 1.6**

  - [x] 1.6 Write property test for parser totality
    - **Property 5: Parser totality**
    - **Validates: Requirements 1.7**

  - [x] 1.7 Write unit tests for checkin-body
    - Cover the exact `S1:<id>:<code>` text, the error order, null/undefined/non-string input, trailing newline and trailing `:`
    - _Requirements: 1.1, 1.5, 1.6_

- [x] 2. Core: Rolling code
  - [x] 2.1 Implement `packages/core/src/rolling-code.ts`
    - Add `WINDOW_SECONDS`, `windowNumber`, `rollingCode` (Web Crypto HMAC-SHA-256 over the decimal Window_Number text, RFC 4226 dynamic truncation, 6 digits zero-padded) and `verifyCode` (current and previous Window; false on malformed code or non-finite, negative or non-number time; never throws)
    - Return false from `verifyCode` when `crypto.subtle` is unavailable
    - Extend the allow-list in `packages/core/tests/static-scan.test.ts` so `crypto.subtle` is allowed in `rolling-code.ts` as well as `seal.ts`
    - Export from `index.ts`
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 2.6, 2.7, 2.8, 2.11_

  - [x] 2.2 Write unit tests with the fixed test vectors
    - Reproduce the 7 vectors from the design table, including the two with a leading zero and Window_Number 0
    - Cross-check random secrets and windows against a from-scratch HMAC-SHA-256 reference written inside the test file (no import from `src/`)
    - _Requirements: 2.10_

  - [x] 2.3 Write property test for code shape, determinism and windows
    - **Property 6: Rolling-code shape, determinism and window behavior**
    - Filter out colliding neighbouring windows with fast-check `filter` (option a in the design)
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**

  - [x] 2.4 Write property test for verifier totality
    - **Property 7: Code_Verifier totality on malformed input**
    - **Validates: Requirements 2.8, 2.11**

  - [x] 2.5 Write property test for the acceptance set
    - **Property 8: Code_Verifier acceptance set**
    - Use the weaker "equal or differ" assertion for rejected codes (option b in the design)
    - **Validates: Requirements 2.5, 2.6, 2.7, 2.9**

- [x] 3. Core: Checkin_Log and Attendee_Name
  - [x] 3.1 Implement `packages/core/src/checkin-log.ts`
    - Add `CheckIn`, `CheckinLog`, `EMPTY_CHECKIN_LOG`, `AddResult`, `addCheckIn` (first write wins), `listCheckIns` (ascending `at`, ties by insertion order) and `soulCount`
    - Immutable values, in the style of `hunt-found.ts`
    - Export from `index.ts`
    - _Requirements: 3.1, 3.2, 3.5, 3.6, 3.7_

  - [x] 3.2 Implement `packages/core/src/attendee-name.ts`
    - Add `validateAttendeeName(input: unknown)`: trim, count Unicode code points, accept 1 to 32, return `Result`
    - Add `validateTitle(input: unknown)` for the 1 to 60 rule, so the API and the web app share it
    - Export from `index.ts`
    - _Requirements: 5.3, 8.5, 14.2, 14.3, 17.7_

  - [x] 3.3 Write property test for the dedupe invariant and first-write-wins
    - **Property 9: Checkin_Log dedupe invariant and first-write-wins**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.5, 3.7**

  - [x] 3.4 Write property test for replay idempotence
    - **Property 10: Replaying a sequence is a no-op**
    - **Validates: Requirements 3.4**

  - [x] 3.5 Write property test for ordering
    - **Property 11: Checkin_Log ordering**
    - **Validates: Requirements 3.6**

  - [x] 3.6 Write property test for name validation
    - **Property 16: Attendee-name validation**
    - **Validates: Requirements 14.2, 14.3**

  - [x] 3.7 Write unit tests for checkin-log
    - Cover the empty log, a repeat with a different name and an earlier time, and equal-time ordering
    - Cover name and title boundaries 0/1/32/33 and 0/1/60/61
    - _Requirements: 3.1, 3.2, 3.5, 3.6, 3.7, 5.3, 8.5_

- [x] 4. Core: CSV export
  - [x] 4.1 Implement `packages/core/src/csv.ts`
    - Add `exportCsv`: header `name,checked_in_at`, CRLF between lines and none at the end, RFC 4180 quoting, a leading `'` for names starting with `=`, `+`, `-`, `@`, tab or CR, then quoting
    - Export from `index.ts`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.7_

  - [x] 4.2 Write property test for the CSV round trip
    - **Property 12: CSV export round trip**
    - Parse with a small RFC 4180 reader defined in the test file
    - **Validates: Requirements 4.3, 4.5, 4.6**

  - [x] 4.3 Write unit tests for the CSV exporter
    - Cover the header-only output for an empty list, no trailing CRLF, and each guarded first character
    - _Requirements: 4.1, 4.2, 4.4, 4.5, 4.7_

- [x] 5. Checkpoint - Core complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Checkin_API: package, shared helpers and store
  - [x] 6.1 Set up the `apps/checkin-api` package
    - Add `package.json` with dependencies `@netlify/blobs`, `@netlify/functions` and `"@screech/core": "workspace:*"`, plus dev dependencies Vitest and fast-check; add `tsconfig.json` (strict) and `vitest.config.ts`
    - Create the layout from the design: `netlify/functions/` (entry files only), `src/` (handler logic, store, http helpers) and `tests/`
    - Make sure the root `pnpm test` runs this package; `pnpm-workspace.yaml` already covers `apps/*`
    - _Requirements: 17.1, 17.7, 18.1, 18.5, 18.6_

  - [x] 6.2 Implement `apps/checkin-api/src/http.ts`
    - Add `json()` with `Content-Type: application/json` and `Cache-Control: no-store`, no `Set-Cookie`
    - Add `methodGuard(allowed, method)` (405 with an `Allow` header listing the allowed methods and `Cache-Control: no-store`), `readJsonBody()` (413 above 2,048 bytes before parsing, 400 on invalid JSON), `timingSafeEqual()` and a single `seanceNotFound()` helper
    - Add a generic 500 helper with a fixed message and no stack trace or stored value
    - _Requirements: 6.4, 6.5, 7.5, 7.6, 17.8, 17.10, 17.11, 19.3, 19.7, 19.8_

  - [x] 6.3 Implement `apps/checkin-api/src/seance.ts` and `seance-store.ts`
    - Define `StoredSeance`, `StoredCheckIn`, key helpers, the 24-hour expiry check with an injected `now`, and the `SeanceStore` interface
    - Add `listSeanceIds()` and `deleteSeance()` (with its check-ins) to the interface, which the cleanup function needs and the design interface does not list
    - Implement `createMemoryStore()` (two Maps, atomic `addCheckIn`) and `createBlobsStore()` (`seance-sessions` and `seance-checkins`, `setJSON` with `onlyIfNew`, list by prefix); wrap Blobs failures in `StoreUnavailableError`
    - _Requirements: 5.7, 5.8, 17.2, 17.3, 17.4, 17.5, 17.6, 18.6, 19.1, 19.2_

  - [x] 6.4 Write tests for the in-memory store
    - Unit tests for create, get, expiry, list and delete
    - Concurrent `addCheckIn` for one key yields exactly one winner
    - _Requirements: 17.3, 17.4, 17.5, 18.6_

  - [x] 6.5 Write unit tests for `http.ts`
    - Cover the `methodGuard` 405 response (status, `Allow` header equal to the allowed list, `Cache-Control: no-store`), 413 on an oversized body, 400 on bad JSON, `timingSafeEqual` results, and no `Set-Cookie` on any response
    - _Requirements: 17.8, 17.11, 19.3, 19.7_

- [x] 7. Checkin_API: endpoint handlers and entry files
  - [x] 7.1 Implement `apps/checkin-api/src/seance-create.ts` (`handleCreate`, `POST /api/seance`)
    - Export an `ALLOWED` constant and start with `methodGuard`
    - Validate the Title with the Core rule before any store access
    - Generate the Session_ID (8 Hunt_Alphabet characters) and Host_Secret (32 bytes, 43 base64url characters) from a secure random source, retry up to 10 times on a collision, then answer 503
    - Answer 201 with the Session_ID, trimmed Title and Host_Secret; store only the five allowed fields
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.9, 17.11, 19.2, 19.8, 19.9_

  - [x] 7.2 Write unit tests for create
    - Import `handleCreate` from `src/` with `createMemoryStore()` and an injected clock
    - Cover 201, title boundaries, bad JSON, non-string title, ID collision retries, the 503 path, the stored fields, and 405 with `Allow` for an unsupported method (for example `GET`, `PUT`) with no store access
    - _Requirements: 5.1, 5.3, 5.4, 5.5, 5.6, 5.7, 17.11_

  - [x] 7.3 Implement `apps/checkin-api/src/seance-public.ts` (`handlePublic`, `GET /api/seance/:id/public`)
    - Export an `ALLOWED` constant and start with `methodGuard`
    - Return Title and `open`; answer a malformed, missing or expired ID with the same 404; never return the secret, check-ins or Device_IDs; never write
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 5.8, 17.11_

  - [x] 7.4 Write unit tests for public
    - Cover open and ended, 404 for a malformed, unknown and expired ID with identical bodies, no mutation, and 405 with `Allow` for an unsupported method with no store access
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6, 17.11_

  - [x] 7.5 Implement `apps/checkin-api/src/seance-host.ts` (`handleHost`, `GET /api/seance/:id`)
    - Export an `ALLOWED` constant and start with `methodGuard`
    - Check the Host_Secret with `timingSafeEqual` and answer 404 through `seanceNotFound()` when it is missing or wrong
    - Return Title, `open` and check-ins (name and time only) sorted via the Core `listCheckIns` rules
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 9.5, 17.11_

  - [x] 7.6 Write unit tests for host view
    - Cover an empty list, ordering with equal times, no Device_ID or secret in the body, a missing or wrong secret giving a body identical to a missing séance, and 405 with `Allow` for an unsupported method with no store access
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 17.11_

  - [x] 7.7 Implement `apps/checkin-api/src/seance-checkin.ts` (`handleCheckin`, `POST /api/seance/:id/checkin`)
    - Export an `ALLOWED` constant and start with `methodGuard`
    - Validate all fields before any store access (name, Device_ID, code), naming each bad field
    - Apply the order of checks from assumption 8: session exists, repeat Device_ID answered 200 with `alreadyCheckedIn: true`, ended gives 410, `verifyCode` against the server clock gives 403, then `addCheckIn` with `onlyIfNew`
    - Read the time only from the injected server clock; ignore any client time; never log the secret, code or Device_ID
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11, 9.6, 17.2, 17.3, 17.4, 17.5, 17.9, 17.11, 19.1, 19.8, 19.9_

  - [x] 7.8 Write unit tests for check-in
    - Cover each status (200 new, 200 repeat, 400 name, 400 device or code, 403, 404, 410), the repeat after the séance ended or the code expired, different devices both stored, name returned as plain JSON, and 405 with `Allow` for an unsupported method (for example `GET`, `PUT`) with no store access
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.9, 8.11, 17.11_

  - [x] 7.9 Write property test for client-supplied time
    - **Property 18: Check-in handler ignores client-supplied time**
    - **Validates: Requirements 8.10**

  - [x] 7.10 Write property test for concurrent same-device check-ins
    - **Property 19: Concurrent same-device check-ins resolve to exactly one new record**
    - **Validates: Requirements 8.8, 17.3, 17.5**

  - [x] 7.11 Implement `apps/checkin-api/src/seance-end.ts` (`handleEnd`, `POST /api/seance/:id/end`)
    - Export an `ALLOWED` constant and start with `methodGuard`
    - Check the Host_Secret as in the host view, set `ended`, return the check-in count; a second call returns the same count and changes nothing
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 17.11_

  - [x] 7.12 Write unit tests for end
    - Cover the count, a wrong or missing secret, an expired or unknown séance, a rejected check-in after the end, and 405 with `Allow` for an unsupported method with no store access
    - _Requirements: 9.1, 9.3, 9.4, 9.6, 17.11_

  - [x] 7.13 Write property test for idempotent end
    - **Property 20: Ending a séance is idempotent**
    - **Validates: Requirements 9.2**

  - [x] 7.14 Implement `apps/checkin-api/src/seance-cleanup.ts` (`runCleanup`)
    - Take the store and an injected `now`; list sessions through the store and delete every séance that is 24 hours old or more together with its check-ins
    - Keep open and ended séances under 24 hours old, because ended séances must stay readable
    - Keep it out of request handling so request latency and the expiry check in `getSeance` are unaffected
    - _Requirements: 17.6, 9.5_

  - [x] 7.15 Write unit tests for cleanup in `tests/seance-cleanup.test.ts`
    - Import `runCleanup` from `src/` with the in-memory store and an injected clock
    - Expired séances and their check-ins are removed; open and ended séances under 24 hours old are kept
    - _Requirements: 17.6, 18.6_

  - [x] 7.16 Implement the Netlify Function entry files in `apps/checkin-api/netlify/functions/`
    - Create exactly six top-level files: `seance-create.ts`, `seance-public.ts`, `seance-host.ts`, `seance-checkin.ts`, `seance-end.ts` and `seance-cleanup.ts`
    - Use the Functions v2 format: a default export `(req: Request, context: Context)` and `export const config` from `@netlify/functions`
    - Routing: `seance-create.ts` `{ path: '/api/seance', method: 'POST' }`; `seance-public.ts` `{ path: '/api/seance/:id/public', method: 'GET' }`; `seance-host.ts` `{ path: '/api/seance/:id', method: 'GET' }`; `seance-checkin.ts` `{ path: '/api/seance/:id/checkin', method: 'POST' }`; `seance-end.ts` `{ path: '/api/seance/:id/end', method: 'POST' }`
    - Read `:id` from `context.params.id` (create ignores params) and pass it to the handler, which re-validates it
    - `seance-cleanup.ts` exports `config = { schedule: '@hourly' }` and calls `runCleanup`
    - Entry files hold no logic: they only wire in `createBlobsStore()` and `() => Date.now()` and delegate to `src/`
    - Each entry's `config.method` must equal the handler's `ALLOWED`
    - _Requirements: 17.1, 17.6, 17.11, 18.1, 18.2_

  - [x] 7.17 Write `tests/entry-config.test.ts`
    - Import only each entry file's `config` export (never call the default export, so no Blobs access happens)
    - Assert the `path` and `method` values in the routing table, that `method` equals the matching handler's `ALLOWED`, that `seance-cleanup.ts` has `schedule: '@hourly'`, and that `netlify/functions/` holds exactly the six entry files
    - _Requirements: 17.6, 17.11, 18.1, 18.6_

- [x] 8. Checkpoint - Checkin_API complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Web logic modules
  - [x] 9.1 Implement `logic/screech-schedule.ts` and `logic/screech-machine.ts`
    - `SCREECH_MIN_MS`, `SCREECH_MAX_MS` and `screechInterval(random)`, returning an integer from 10,000 to 15,000 and `SCREECH_MIN_MS` for any invalid input
    - `screechStep` with the `stopped` / `running{ nextDueAt, playing }` shape of `beacon-machine.ts`: delay while a screech plays, no quiet state, and an audio-blocked event that does not stop the loop
    - _Requirements: 12.2, 12.4, 12.11, 12.13, 12.15_

  - [x] 9.2 Implement `logic/host-clock.ts`
    - `parseDateHeader`, `clockOffsetMs`, `correctedNowSeconds`
    - _Requirements: 12.3_

  - [x] 9.3 Implement `logic/device-id.ts` and `logic/seance-storage.ts`
    - `isDeviceId` and `randomDeviceId(randomBytes)`
    - Storage helpers: host record in `sessionStorage` key `seance.host`; `seance.deviceId` and `seance.lastName` in `localStorage`; no other keys and no Host_Secret outside `sessionStorage`
    - _Requirements: 10.6, 10.10, 14.1, 14.5, 14.6, 19.5, 19.6_

  - [x] 9.4 Implement `logic/checkin-client.ts`
    - `ApiOutcome`, `parseCreateResponse`, `parsePublicResponse`, `parseHostResponse`, `parseCheckinResponse`, `parseEndResponse` and `joinErrorMessage`
    - Add a fetch wrapper with an `AbortController` timeout (10 s, and 5 s for polls) that takes `fetch` as a dependency; every URL is relative and begins with `/api/`
    - _Requirements: 10.5, 11.6, 11.8, 13.7, 14.8, 16.1, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8, 16.9, 18.3_

  - [x] 9.5 Implement `logic/checkin-route.ts` and extend `logic/flow.ts`
    - `checkinRoute(result)` returns `{ kind: 'checkin', fields }` only for a successful, non-multipart `checkin` Packet that `parseCheckinText` accepts; otherwise `{ kind: 'none' }`
    - Add the `'seance-host'` screen and `openSeanceHost` / `closeSeanceHost` events in the shape of `openHuntSetup` / `closeHuntSetup`
    - _Requirements: 10.1, 10.2, 13.1, 13.9, 12.14_

  - [x] 9.6 Implement `logic/candle-split.ts`
    - `splitCandles(checkIns)`: first 100 on the circle, the rest in the scrolling list
    - _Requirements: 11.10_

  - [x] 9.7 Write property test for the screech interval
    - **Property 14: Screech interval stays in range**
    - **Validates: Requirements 12.2**

  - [x] 9.8 Write unit tests for the screech machine
    - Cover a delayed next screech while one plays, the start within 1 s of its end, and the loop continuing after an audio-blocked event
    - _Requirements: 12.2, 12.4, 12.11, 12.13_

  - [x] 9.9 Write unit tests for host-clock, device-id and storage
    - Cover a bad `Date` header, the offset arithmetic, 32 lowercase hex characters, and the Host_Secret never touching `localStorage`
    - _Requirements: 12.3, 14.5, 19.5, 19.6_

  - [x] 9.10 Write property test for join-error messages
    - **Property 17: Join-error message mapping never leaks internals**
    - **Validates: Requirements 16.9**

  - [x] 9.11 Write unit tests for checkin-client
    - Cover each response parser and the exact messages from Requirements 16.1 to 16.8
    - _Requirements: 16.1, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8_

  - [x] 9.12 Write property test for `checkinRoute`
    - **Property 15: `checkinRoute` total classification**
    - **Validates: Requirements 13.1**

  - [x] 9.13 Write unit tests for the flow extension
    - Cover opening the host screen only from Awaken or Speak, blocked while transmitting or listening, and returning to the origin screen
    - _Requirements: 10.1, 10.2_

  - [x] 9.14 Write property test for `splitCandles`
    - **Property 13: Candle_Circle split preserves order and count**
    - **Validates: Requirements 11.10**

- [x] 10. Checkpoint - Web logic complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Screens and wiring
  - [x] 11.1 Build presentation components and styles
    - `components/CandleCircle.tsx` (lit and unlit candles, name under each, still flame under Exorcise or `prefers-reduced-motion`, no more than 3 flashes per second), `components/SeanceControl.tsx`, and `styles/seance.css`
    - Follow the ui-theme: phosphor green and bone white, Creepster for the Title only, no red on the Lit_Screen, 44 px touch targets, no horizontal scroll from 390 px to 1440 px; names rendered as React text nodes
    - Reference `docs/design/Seance.dc.html`
    - _Requirements: 10.1, 11.2, 11.4, 11.11, 11.12, 11.13, 11.14, 11.15, 15.4, 15.5, 15.8, 15.9, 19.4_

  - [x] 11.2 Implement `ui/hooks/useSeanceHost.ts`
    - Create flow (AudioContext created or resumed in the tap handler, no mic request), resume from `sessionStorage` with the 404 reset, Poll_Loop (2 s, no overlap, 5 s timeout, immediate poll on tab visible), clock offset from the `Date` header, Screech_Loop built on `screech-machine` and the existing transmit path (one loop only), wake lock via the existing `wake-lock.ts`, end flow, CSV download with a UTF-8 BOM, and cleanup on leave
    - _Requirements: 4.8, 4.9, 10.3, 10.4, 10.5, 10.6, 10.8, 10.9, 10.10, 10.11, 11.3, 11.5, 11.6, 11.7, 11.8, 11.9, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.9, 12.10, 12.11, 12.12, 12.13, 12.14, 12.15, 19.5_

  - [x] 11.3 Implement `ui/hooks/useJoin.ts`
    - State for the stored Session_ID and newest code, the public request with Retry, the check-in request (one request per tap, "Joining..." while pending), error mapping through `joinErrorMessage`, saved name, "Listen again" and Leave actions
    - _Requirements: 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 13.10, 14.1, 14.4, 14.6, 14.7, 14.8, 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8, 16.10_

  - [x] 11.4 Implement the `SeanceHost` screen
    - Start_Form (field, Start button, keep-this-tab-open text, validation and failure messages) and Room_Display (Title, Candle_Circle, scrolling list past 100, Soul_Count with "1 soul present", countdown and screeching indicator, no-signal and silent-laptop messages, Download_Button, End_Hold using `useHold`, ended view)
    - _Requirements: 10.2, 10.4, 10.5, 10.7, 10.8, 10.9, 10.12, 10.13, 11.1, 11.2, 11.5, 11.8, 11.10, 11.14, 12.5, 12.6, 12.7, 12.8, 12.11, 12.12, 12.13_

  - [x] 11.5 Implement the `Join` and `Lit` screens
    - Join_Screen (Title or "Reaching the séance...", Name_Field with remaining count, Join, Retry, Leave and "Listen again" buttons, errors in red) and Lit_Screen ("Your candle is lit", name, Title, the one-time Candle_Animation of at most 3 s, "You were already counted." note, "Back to listening", no check-in control, no red)
    - _Requirements: 13.3, 13.4, 13.5, 13.6, 13.7, 14.2, 14.3, 14.9, 14.10, 14.11, 14.12, 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8, 15.9, 16.9_

  - [x] 11.6 Wire everything into the app
    - Add `SeanceControl` to Awaken and Speak and render `SeanceHost` for `flow.screen === 'seance-host'` in `App.tsx`
    - In `Listen.tsx` check `checkinRoute` before `huntRoute` and `screenState`: stop capture, store the Session_ID and code, show Join; a repeat packet only replaces the code; a packet for the same Session_ID is ignored on the Lit_Screen; a rejected `checkin` Packet keeps the Reveal_Screen
    - Play no UI_Sound on Join or Lit; extend `scripts/check-no-audio.mjs` if it covers these screens
    - _Requirements: 10.1, 10.2, 13.1, 13.9, 13.10, 13.11, 13.12, 14.12, 15.7, 16.2_

  - [x] 11.7 Write component tests for the host screens
    - With a mocked `fetch`: Start_Form messages and kept Title, resume and 404 reset, candle lighting, no-signal message, CSV download and its no-data error, End_Hold failure messages, and `<script>` text appearing as literal text
    - _Requirements: 4.8, 4.9, 10.5, 10.7, 10.8, 10.9, 10.11, 11.3, 11.8, 12.7, 19.4_

  - [x] 11.8 Write component tests for Join and Lit
    - Cover pending, ended and 404 states, Retry, each error message, disabled "Joining..." state, name prefill and count, first versus repeat check-in on the Lit_Screen, and reduced motion
    - _Requirements: 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 14.1, 14.2, 14.3, 14.7, 14.8, 15.2, 15.3, 15.4, 16.1, 16.3, 16.5, 16.6, 16.7_

  - [x] 11.9 Write integration and scan tests
    - Listen routes a parsing `checkin` Packet to Join and a malformed one to Reveal, no second public request on a repeat packet, no UI_Sound on Join or Lit, no `dangerouslySetInnerHTML` or `innerHTML` for Title or names, and no hard-coded host in Checkin_API URLs
    - _Requirements: 13.1, 13.9, 13.10, 13.11, 18.3, 19.4_

- [x] 12. Deployment config, local dev, README and final checks
  - [x] 12.1 Add `netlify.toml` at the repository root
    - `[build]`: `command = "pnpm --filter @screech/core build && pnpm --filter @screech/web build"`, `publish = "apps/web/dist"`, `functions = "apps/checkin-api/netlify/functions"`
    - `[functions]`: `node_bundler = "esbuild"`; `[build.environment]`: `NODE_VERSION = "22"`
    - `[dev]`: `framework = "#custom"`, `command = "pnpm --filter @screech/web dev"`, `targetPort = 5173`, `port = 8888`
    - No `[[redirects]]` for `/api/*`: routing comes only from each function's `config.path`
    - _Requirements: 18.1, 18.2_

  - [x] 12.2 Write `apps/checkin-api/README.md`
    - Document each endpoint (method, path, inputs, outputs), the two Blobs stores and their keys, the cleanup function, the entry-file layout, the test command, and the diagnostic step that tells a functions failure from an app failure
    - Document local development on phones: run `netlify dev` from the repository root, run `cloudflared tunnel --url http://localhost:8888`, then open the printed HTTPS tunnel URL on the laptop (Host_Screen) and on the phones (Listen_Screen), all on one origin so no CORS is needed
    - _Requirements: 18.2, 18.3, 18.4, 18.7_

  - [x] 12.3 Write delivery-config tests in `apps/checkin-api/tests/delivery-config.test.ts`
    - Read `netlify.toml` and assert the build command, publish directory, functions directory, `node_bundler = "esbuild"`, `NODE_VERSION = "22"`, the `[dev]` block values (`framework`, `command`, `targetPort`, `port`), and that it contains no `/api` redirect
    - Read `apps/checkin-api/package.json` and assert it lists `@netlify/blobs` and `@netlify/functions`, and `@screech/core` as `workspace:*`
    - _Requirements: 18.1, 18.2, 18.5, 18.6_

  - [x] 12.4 Make `apps/web/vite.config.ts` load `basicSsl` conditionally
    - Use `const plugins = [react(), ...(process.env.NETLIFY_DEV ? [] : [basicSsl()])]`
    - Plain `pnpm --filter @screech/web dev` keeps its HTTPS behaviour; under `netlify dev` Vite serves plain HTTP on 5173
    - _Requirements: 18.2, 18.3_

  - [x] 12.5 Write a test for the Vite config in `apps/web/tests/vite-config.test.ts`
    - Load the config with and without `NETLIFY_DEV` set and assert that the `basicSsl` plugin is present only when it is unset
    - _Requirements: 18.2, 18.3_

- [x] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Every test task is required; no task is optional
- Each property test goes in its own test file so tasks in the same wave do not write to the same file
- Property tests use the existing `NUM_RUNS` pattern and a comment tag `Feature: seance, Property N: ...`
- Handler tests import from `apps/checkin-api/src/` with `createMemoryStore()` and an injected clock only; none imports from `netlify/functions/` (except `entry-config.test.ts`, which reads only the `config` exports) or touches the real Blobs store
- Task 6.3 adds `listSeanceIds` and `deleteSeance` to the store interface, which the design omitted
- Routing is declared only by each entry file's `config.path`; requirement 18.1's `/api/` redirect mapping is superseded by the design on this point

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "1.5", "1.6", "1.7", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.5", "3.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "3.4", "3.5", "3.7"] },
    { "id": 4, "tasks": ["3.6", "4.1"] },
    { "id": 5, "tasks": ["4.2", "4.3", "6.1"] },
    { "id": 6, "tasks": ["6.2", "6.3"] },
    { "id": 7, "tasks": ["6.4", "6.5", "7.1", "7.3", "7.5", "7.7", "7.11", "7.14"] },
    { "id": 8, "tasks": ["7.2", "7.4", "7.6", "7.8", "7.9", "7.10", "7.12", "7.13", "7.15", "7.16"] },
    { "id": 9, "tasks": ["7.17", "12.1", "12.4"] },
    { "id": 10, "tasks": ["9.1", "9.2", "9.3", "9.4", "9.5", "9.6", "12.2", "12.3", "12.5"] },
    { "id": 11, "tasks": ["9.7", "9.8", "9.9", "9.10", "9.11", "9.12", "9.13", "9.14"] },
    { "id": 12, "tasks": ["11.1", "11.2", "11.3"] },
    { "id": 13, "tasks": ["11.4", "11.5"] },
    { "id": 14, "tasks": ["11.6"] },
    { "id": 15, "tasks": ["11.7", "11.8", "11.9"] }
  ]
}
```
