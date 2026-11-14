# Implementation Plan: Screech Protocol

## Overview

This plan implements the Packet_V1 codec in `packages/core` in TypeScript (strict mode, no `any`), as specified in design.md. All logic is pure functions over `Uint8Array` and plain values. Tasks run in dependency order: constants and types, UTF-8 helpers, frame, body encodings (URL, text, Wi-Fi), the synchronous codec, sealing and opening, sender state, then the public API, static scans and the final verification.

Each module's unit tests and property tests are sub-tasks of the task that implements the module. Source files go in `packages/core/src/`. Tests go in `packages/core/tests/` with Vitest and fast-check. Every fast-check property uses `NUM_RUNS` (100) from `tests/helpers.ts` and carries the tag comment `Feature: screech-protocol, Property N: <title>`. Run tests with `pnpm test` from the repository root.

## Tasks

- [x] 1. Constants, types, results, guards and shared test support
  - [x] 1.1 Create the foundation modules in `packages/core/src`
    - `constants.ts`: `MAGIC_NIBBLE` (0xC), `VERSION`, `HEADER_BYTE` (0xC1), `TYPE_VALUE`, flag bits and reserved mask, `SECURITY_VALUE`, `SIZE_CAP`, overheads, body limits, key, ID, counter and tag lengths, `NONCE_LENGTH`
    - `types.ts`: `PacketType`, `WifiSecurity`, `Payload`, `PacketFlags`, `DecodedPacket`, `SenderState`
    - `result.ts`: `CodecErrorCode` (16 codes), `CodecError`, `Result<T>`, `ok`, `err`
    - `guards.ts`: `isUint8Array` (cross-realm safe), `isSenderId`, `isCounter`, `isRoomKey`; none may throw
    - _Requirements: 1.1, 2.1, 2.3, 3.1, 3.4, 8.14, 10.6, 10.7_

  - [x] 1.2 Create `tests/helpers.ts` with `NUM_RUNS = 100` and independent reference implementations
    - Header classifier that applies the order: truncated, bad-magic, unsupported-version, unknown-type, reserved-flags
    - Reference URL compressor and reference Wi-Fi body builder written from the design, without importing from `src/`
    - _Requirements: 12.11, 12.12_

  - [x] 1.3 Create `tests/arbitraries.ts` with shared generators
    - `payloadArb` (all six types, with length weighting near the 123, 124, 137 and 138 byte boundaries, U+0000, U+FEFF and multi-byte characters), `urlArb`, `wifiArb` and one generator per invalid Wi-Fi case
    - `keyArb`, `senderIdArb`, `counterArb` (weighted to 0 and 65535), `anyBytesArb` (0 to 300 bytes, biased to start with 0xC1), `anythingArb`, `stringWithLoneSurrogateArb`
    - _Requirements: 12.1, 12.3, 12.4, 12.5_

  - [x] 1.4 Write unit tests and a property test for guards and results in `tests/guards.test.ts`
    - Unit tests for `isUint8Array`, `isSenderId`, `isCounter`, `isRoomKey`, `ok` and `err`
    - Property: guards never throw for any value from `anythingArb` (supports Property 20)
    - _Requirements: 8.9, 8.12, 8.13, 10.7_

- [x] 2. UTF-8 helpers
  - [x] 2.1 Implement `src/utf8.ts`
    - `encodeUtf8Strict` (rejects lone surrogates), `decodeUtf8Strict` (`TextDecoder` with `fatal: true` and `ignoreBOM: true`), `hasLoneSurrogate`
    - _Requirements: 4.1, 4.2, 4.3, 7.1, 7.2, 7.3_

  - [x] 2.2 Write unit and property tests in `tests/utf8.test.ts`
    - Unit tests: U+FEFF kept, U+0000 kept, lone surrogate rejected, invalid byte sequences rejected
    - Property: strict encode then strict decode returns the original string for strings without lone surrogates
    - Supports **Property 3: Unsealed round trip** and **Property 10: Text-like bodies must be valid UTF-8**
    - _Requirements: 4.2, 4.3, 7.3, 7.5_

- [x] 3. Frame
  - [x] 3.1 Implement `src/frame.ts`
    - `buildFrame` writes 0xC1, the type value and the flags byte, then copies the body
    - `parseFrame` runs the header checks in the design order and returns copies of the body bytes
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.6, 10.5_

  - [x] 3.2 Write property test for frame round trip in `tests/frame.property.test.ts`
    - **Property 1: Frame round trip**
    - **Validates: Requirements 1.1, 1.5, 2.1, 2.3, 2.6**

  - [x] 3.3 Write unit tests in `tests/frame.test.ts`
    - Fixed bytes for each type and each flag combination
    - Empty input, 1 and 2 bytes give `truncated` before any other check; each of `bad-magic`, `unsupported-version`, `unknown-type`, `reserved-flags` with fixed bytes
    - _Requirements: 1.2, 1.3, 1.4, 2.2, 2.4_

- [x] 4. URL compression and Prefix_Table
  - [x] 4.1 Implement `src/prefix-table.ts` and `src/url-body.ts`
    - `PREFIX_TABLE` as a single `as const` definition with codes 0x01 to 0x10; `compressUrl` and `expandUrl` both read from it
    - URL body encode (scheme removed, longest case-sensitive prefix replaced, scheme byte, compressed flag always set) and decode (including the literal form with the compressed flag clear)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9_

  - [x] 4.2 Write property test for URL canonical form in `tests/url-body.property.test.ts`
    - **Property 4: URL compression canonical form**
    - Compare against the reference compressor in `tests/helpers.ts`
    - **Validates: Requirements 5.1, 5.2, 5.3**

  - [x] 4.3 Write property test for the Prefix_Table in `tests/prefix-table.property.test.ts`
    - **Property 5: Prefix_Table is a bijection**
    - **Validates: Requirements 5.8**

  - [x] 4.4 Write property test for invalid URLs in `tests/url-body-invalid.property.test.ts`
    - **Property 6: Invalid URL payloads and bodies are rejected**
    - **Validates: Requirements 5.5, 5.6, 5.7**

  - [x] 4.5 Write unit tests in `tests/url-body.test.ts`
    - Fixed bytes for a `https://github.com/...` URL using code 0x02, an `http://` URL with no prefix, mixed-case scheme normalized to lowercase, and an uppercase host left uncompressed
    - Literal URL with the compressed flag clear, accepted and rejected (no scheme) cases; undefined code 0x11 and empty body give `invalid-body`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.9_

- [x] 5. Text-like bodies
  - [x] 5.1 Implement `src/text-body.ts`
    - Encode and decode for text, contact, checkin and hunt-clue: strict UTF-8, compressed flag clear
    - Decoder rejects the compressed flag and invalid UTF-8 with `invalid-body`; encoder rejects empty text and lone surrogates with `invalid-payload` and `field: 'text'`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 5.2 Write property test for text-like bodies in `tests/text-body.property.test.ts`
    - **Property 10: Text-like bodies must be valid UTF-8**
    - **Validates: Requirements 4.3, 7.3**

  - [x] 5.3 Write unit tests in `tests/text-body.test.ts`
    - Fixed bytes for each of the four types, multi-byte characters, empty text, compressed flag set, invalid UTF-8 body
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6, 7.1, 7.3, 7.4, 7.6_

- [x] 6. Wi-Fi body
  - [x] 6.1 Implement `src/wifi-body.ts`
    - Encode with the check order from the design (`invalid-payload` and `invalid-wifi`), compressed flag always set; decode with the strict mirror checks (`invalid-body`)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11_

  - [x] 6.2 Write property test for Wi-Fi encoding rules in `tests/wifi-body.property.test.ts`
    - **Property 7: Wi-Fi encoding rules**
    - Compare accepted bodies against the reference builder in `tests/helpers.ts`
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.6, 6.7, 6.8**

  - [x] 6.3 Write property test for malformed Wi-Fi bodies in `tests/wifi-body-invalid.property.test.ts`
    - **Property 8: Malformed Wi-Fi bodies are rejected**
    - **Validates: Requirements 6.5**

  - [x] 6.4 Write unit tests in `tests/wifi-body.test.ts`
    - Fixed bytes for open, WPA and WEP; open with a password gives `invalid-wifi`; SSID of 0 and 33 bytes; password of 64 bytes; WPA with an empty password
    - Decoder: compressed flag clear, undefined security byte, length past the body, leftover bytes, invalid UTF-8 in SSID and password
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.10, 6.11_

- [x] 7. Body dispatcher
  - [x] 7.1 Implement `src/body.ts`
    - `encodeBody(payload)` returns type, compressed flag and body; `decodeBody(type, compressed, body)` dispatches to the per-type modules
    - Unknown payload shapes return `invalid-payload` with the offending field
    - _Requirements: 3.3, 4.1, 5.3, 6.1, 7.1, 10.6, 10.7_

  - [x] 7.2 Write unit tests in `tests/body.test.ts`
    - Dispatch for each of the six types; non-object payload, unknown `type` value and non-string fields give `invalid-payload` with the field named
    - _Requirements: 3.3, 10.7_

- [x] 8. Synchronous codec (`encode`, `decode`)
  - [x] 8.1 Implement `src/codec.ts`
    - `encode`: encode body, compute `3 + body.length`, return `too-large` with the length when above 140, otherwise `buildFrame`; never sets the sealed or multipart bit
    - `decode`: `parseFrame`, sealed flag gives `key-required`, multipart flag returns the raw body copy, otherwise `decodeBody`; non-`Uint8Array` input gives `invalid-payload` with `field: 'packet'`; wrap in `try/catch` so nothing throws
    - _Requirements: 1.1 to 1.5, 2.1 to 2.6, 3.1, 3.2, 3.4, 4.5, 8.17, 10.1, 10.6, 10.7, 10.11_

  - [x] 8.2 Write property test for the unsealed round trip in `tests/codec-roundtrip.property.test.ts`
    - **Property 3: Unsealed round trip**
    - **Validates: Requirements 4.1, 4.2, 5.4, 6.1, 6.4, 6.9, 7.1, 7.2, 7.5, 11.1**

  - [x] 8.3 Write property test for header validation in `tests/codec-header.property.test.ts`
    - **Property 2: Header validation matches the reference model** (the `decode` half; the `open` half is in task 11.6)
    - **Validates: Requirements 1.2, 1.3, 1.4, 2.2, 2.4**

  - [x] 8.4 Write property test for invalid payloads in `tests/codec-invalid-payload.property.test.ts`
    - **Property 9: Invalid payloads are rejected without a packet**
    - Includes a check that the input Payload is unchanged
    - **Validates: Requirements 3.3, 4.4, 7.4**

  - [x] 8.5 Write property tests for size cap and determinism in `tests/codec-size.property.test.ts`
    - **Property 11: Size cap is never exceeded** (the `encode` half; `seal` half is in task 10.4)
    - **Property 14: Determinism** (the `encode` half; `seal` half is in task 10.4)
    - **Validates: Requirements 3.1, 3.2, 3.4, 4.5, 10.3, 11.3, 12.3**

  - [x] 8.6 Write property tests for totality and input safety in `tests/codec-totality.property.test.ts`
    - **Property 20: Totality** (`encode` and `decode` with arbitrary values and 0 to 300 byte arrays)
    - **Property 21: Inputs are not modified or retained** (the `decode` half)
    - **Validates: Requirements 10.5, 10.6, 10.7, 10.11, 12.4**

  - [x] 8.7 Write property test for multipart passthrough in `tests/codec-multipart.property.test.ts`
    - **Property 22: Multipart passthrough** (unsealed half; sealed half is in task 11.7)
    - **Validates: Requirements 2.5**

  - [x] 8.8 Write unit tests in `tests/codec.test.ts`
    - Fixed example bytes for each of the six types, including the 0xC1 header, a compressed URL with code 0x02, and Wi-Fi for each security type
    - Size boundaries: an unsealed packet of exactly 140 bytes (137-byte body) is produced and decoded; a payload that would be 141 bytes gives `too-large` with `length: 141`
    - Sealed-flag packet to `decode` gives `key-required`; `encode` and `decode` results are not thenable; `decode(null)` gives `invalid-payload` with `field: 'packet'`
    - _Requirements: 2.6, 3.1, 3.2, 8.17, 10.1, 10.11, 12.7, 12.8_

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Sealer (`deriveNonce`, `seal`) and cryptographic test helpers
  - [x] 10.1 Implement `deriveNonce` and `seal` in `src/seal.ts`
    - `deriveNonce`: Sender_ID, Counter big-endian, six zero bytes
    - `seal`: validate in the design order (key, Sender_ID, Counter, payload, size), AAD is the first three bytes, `importKey` with a copy of the key, `encrypt` with `tagLength: 64`, output `aad || senderId || counter || ciphertext || tag`
    - Uses only `crypto.subtle`; missing or failing SubtleCrypto gives `crypto-unavailable`; every `await` inside `try/catch` so the Promise never rejects
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.9, 8.11, 8.12, 8.13, 8.14, 8.15, 10.2, 10.8, 10.9_

  - [x] 10.2 Extend `tests/helpers.ts` with independent crypto references
    - Known-answer builder using Node.js `node:crypto` (`createCipheriv('aes-128-gcm', key, nonce, { authTagLength: 8 })`, `setAAD` with the first three bytes) that builds the nonce and packet layout itself, with no import of `deriveNonce` or `buildFrame` from `src/`
    - Direct `SubtleCrypto` decrypt helper (`tagLength: 64`, AAD of the first three bytes) for the sealed round-trip property
    - _Requirements: 8.2, 8.3, 8.4, 12.14_

  - [x] 10.3 Write property test for nonce derivation in `tests/nonce.property.test.ts`
    - **Property 13: Nonce derivation**
    - **Validates: Requirements 8.3, 12.6**

  - [x] 10.4 Write property tests for sealer size, determinism and argument validation in `tests/seal.property.test.ts`
    - **Property 11: Size cap is never exceeded** (the `seal` half; `too-large.length` equals `17 + body length`)
    - **Property 14: Determinism** (the `seal` half)
    - **Property 18: Sealer and Opener argument validation** (the `seal` half: `invalid-key`, `invalid-sender-id`, `invalid-counter`)
    - **Validates: Requirements 8.9, 8.12, 8.13, 8.14, 8.15, 10.3, 11.3, 12.3**

  - [x] 10.5 Write property tests for invalid payloads when sealing in `tests/seal-invalid-payload.property.test.ts`
    - **Property 7: Wi-Fi encoding rules** (`seal` returns `invalid-wifi` for open with a password)
    - **Property 9: Invalid payloads are rejected without a packet** (the `seal` half)
    - **Validates: Requirements 3.3, 6.8, 12.1**

  - [x] 10.6 Write unit tests in `tests/seal.test.ts`
    - Known-answer test: fixed Room_Key, Sender_ID, Counter and Payload; expected bytes computed only by the `node:crypto` helper from 10.2, never taken from `seal()`
    - A payload with a 123-byte body gives a 140-byte sealed packet; a 124-byte body gives `too-large`
    - `seal` resolves to `crypto-unavailable` when `globalThis.crypto.subtle` is stubbed to `undefined`; `seal` result is thenable
    - _Requirements: 8.1, 8.2, 8.14, 8.15, 10.2, 10.9, 12.7, 12.8, 12.14_

- [x] 11. Opener (`open`)
  - [x] 11.1 Implement `open` in `src/seal.ts`
    - Header checks, then `not-sealed`, then `truncated` for under 17 bytes, then `key-required` and `invalid-key`, then decrypt with the first three bytes as AAD
    - Tag mismatch gives `auth-failed`; other crypto failures give `crypto-unavailable`; after decrypt, clear the sealed bit and follow the same multipart or `decodeBody` path as `decode`
    - _Requirements: 1.2 to 1.5, 2.2, 2.4, 2.5, 8.5 to 8.10, 8.16, 10.8, 10.9, 10.11_

  - [x] 11.2 Write property test for sealed round trip and layout in `tests/open-roundtrip.property.test.ts`
    - **Property 12: Sealed round trip and layout**
    - Uses the independent `SubtleCrypto` decrypt helper from 10.2
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 11.2**

  - [x] 11.3 Write property test for tampering in `tests/open-tamper.property.test.ts`
    - **Property 15: Tampering is detected** (flip any single bit; any Codec_Error code is accepted)
    - **Validates: Requirements 8.6, 12.2**

  - [x] 11.4 Write property test for wrong keys in `tests/open-wrong-key.property.test.ts`
    - **Property 16: Wrong key fails authentication**
    - **Validates: Requirements 8.6, 11.4**

  - [x] 11.5 Write property test for sealed-flag routing in `tests/open-routing.property.test.ts`
    - **Property 17: Sealed-flag routing**
    - **Validates: Requirements 8.8, 8.10, 8.16, 8.17**

  - [x] 11.6 Write property tests for Opener validation and totality in `tests/open-totality.property.test.ts`
    - **Property 2: Header validation matches the reference model** (the `open` half; `auth-failed` is never returned for a header failure)
    - **Property 18: Sealer and Opener argument validation** (the `open` half: `invalid-key`)
    - **Property 20: Totality** (the Promise from `open` always resolves for 0 to 300 byte arrays and arbitrary values)
    - **Validates: Requirements 1.2, 1.3, 1.4, 2.2, 2.4, 8.7, 8.9, 10.8, 10.11, 12.5**

  - [x] 11.7 Write property tests for input safety and sealed multipart in `tests/open-inputs.property.test.ts`
    - **Property 21: Inputs are not modified or retained** (`seal` key and Sender_ID, `open` packet and key)
    - **Property 22: Multipart passthrough** (sealed half: `open` returns the decrypted body unchanged)
    - **Validates: Requirements 2.5, 10.5**

  - [x] 11.8 Write unit tests in `tests/open.test.ts`
    - A 16-byte sealed-flag packet gives `truncated`; a 17-byte one does not
    - A 140-byte sealed packet (123-byte body) is produced and opened; a 141-byte one is rejected by `seal` with `too-large`
    - `auth-failed` for a wrong key; `key-required` for a missing key; `invalid-key` for a 15-byte key; `not-sealed` for an unsealed packet
    - `open` resolves to `crypto-unavailable` when `globalThis.crypto.subtle` is stubbed to `undefined`; `open` result is thenable
    - _Requirements: 8.5, 8.6, 8.8, 8.9, 8.10, 8.15, 8.16, 10.2, 10.9, 12.7, 12.8_

- [x] 12. Sender state rotation
  - [x] 12.1 Implement `src/sender-state.ts`
    - `nextSenderState(previous?, fill?)` with injectable `RandomFill`, default `crypto.getRandomValues`; this is the only file that calls `getRandomValues`
    - Validation order: Sender_ID then Counter; at Counter 65535 draw a fresh ID and XOR byte 0 with 0x01 if it equals the old one; returned arrays are fresh copies
    - `getRandomValues` missing or throwing gives `crypto-unavailable`
    - _Requirements: 9.1, 9.2, 9.3, 9.5, 9.6, 9.7, 10.10_

  - [x] 12.2 Write property tests for rotation in `tests/sender-state.property.test.ts`
    - **Property 19: Sender state rotation** (increment below 65535; rollover to a different ID at 65535 even when the random source returns the old ID; initial state; invalid inputs)
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.5, 9.6, 12.6**

  - [x] 12.3 Write property tests for totality and input safety in `tests/sender-state-totality.property.test.ts`
    - **Property 20: Totality** (`nextSenderState` with arbitrary values never throws)
    - **Property 21: Inputs are not modified or retained** (the Sender_ID passed in is unchanged and not retained)
    - **Validates: Requirements 9.5, 9.6, 10.5, 10.7**

  - [x] 12.4 Write unit tests in `tests/sender-state.test.ts`
    - Fixed examples: initial state, Counter increment, rollover at 65535 with Counter reset to 0, `invalid-counter`, `invalid-sender-id`
    - `crypto-unavailable` when `getRandomValues` is stubbed to throw or removed
    - Result is synchronous (not thenable)
    - _Requirements: 9.1, 9.2, 9.3, 9.5, 9.6, 9.7, 10.10, 12.9_

  - [x] 12.5 Write the deterministic no-repeat test in `tests/sender-state-norepeat.test.ts`
    - One plain unit test, not a fast-check property: call `nextSenderState` 70,000 consecutive times from no state with an injected `fill` that writes a 32-bit counter big-endian (never repeats an ID)
    - Record each `(senderId, counter)` pair in a `Set` of strings and fail on a repeat
    - _Requirements: 9.4, 12.13_

- [x] 13. Public API, error-code coverage and static scans
  - [x] 13.1 Wire the public API in `src/index.ts`
    - Replace the placeholder export; re-export `encode`, `decode`, `seal`, `open`, `deriveNonce`, `nextSenderState`, `buildFrame`, `parseFrame`, the types, `CodecErrorCode`, `PREFIX_TABLE` and the constants needed by apps
    - Update or remove the placeholder `tests/index.test.ts` so it matches the new exports
    - _Requirements: 3.4, 10.1, 10.2_

  - [x] 13.2 Write the source scan test in `tests/static-scan.test.ts`
    - Read only the files in `packages/core/src` (never `tests/`) and fail if any contains `node:`, `require(`, `Buffer` or `process.`
    - Fail if `getRandomValues` appears outside `sender-state.ts`, or `crypto.subtle` outside `seal.ts`
    - Fail if the word `any` is used as a type annotation (for example `: any`, `as any`, `<any>`)
    - _Requirements: 8.11, 9.7, 10.4_

  - [x] 13.3 Write the error-code coverage test in `tests/errors.test.ts`
    - One fixed-input example for each of the 16 codes: `bad-magic`, `unsupported-version`, `truncated`, `unknown-type`, `reserved-flags`, `too-large`, `invalid-payload`, `invalid-wifi`, `invalid-body`, `auth-failed`, `key-required`, `invalid-key`, `invalid-counter`, `invalid-sender-id`, `not-sealed`, `crypto-unavailable`
    - Imports only from `src/index.ts`, so it also checks the public API
    - _Requirements: 12.7_

- [x] 14. Final checkpoint - Verify the full suite and time budget
  - [x] 14.1 Run `pnpm test` from the repository root and confirm the result
    - Confirm 0 failed tests and exit code 0, and that the `packages/core` suite finishes in under 20 seconds
    - If over budget, reduce generator sizes; do not lower any property below `NUM_RUNS = 100`
    - Confirm a failing property prints its seed and counterexample (default fast-check reporting is not suppressed)
    - Ensure all tests pass, ask the user if questions arise.
    - _Requirements: 12.10, 12.11, 12.12, 12.15_

## Notes

- All test tasks are required. No task or sub-task is optional.
- Each property from design.md is implemented as exactly one fast-check test per module half. Properties that cover both unsealed and sealed paths (2, 7, 9, 11, 14, 18, 20, 21, 22) have one test in the task that owns the unsealed side and one in the task that owns the sealed side.
- Every sub-task that writes a test file uses its own file name, so tasks in the same wave never write to the same file.
- `tests/helpers.ts` is written in task 1.2 and extended in task 10.2. Its reference implementations must not import from `src/`.
- Only `tests/` may use Node.js APIs such as `node:crypto`. The scan in 13.2 enforces that `src/` does not.
- Manual check, not automated: run a seal and open round trip on iOS Safari and Android Chrome over HTTPS to confirm `tagLength: 64` support.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "2.1", "3.1", "12.1"] },
    { "id": 2, "tasks": ["2.2", "3.2", "3.3", "4.1", "5.1", "6.1"] },
    { "id": 3, "tasks": ["4.2", "4.3", "4.4", "4.5", "5.2", "5.3", "6.2", "6.3", "6.4", "7.1", "12.2", "12.3", "12.4", "12.5"] },
    { "id": 4, "tasks": ["7.2", "8.1", "10.1", "10.2"] },
    { "id": 5, "tasks": ["8.2", "8.3", "8.4", "8.5", "8.6", "8.7", "8.8", "10.3", "10.4", "10.5", "10.6", "11.1"] },
    { "id": 6, "tasks": ["11.2", "11.3", "11.4", "11.5", "11.6", "11.7", "11.8", "13.1"] },
    { "id": 7, "tasks": ["13.2", "13.3"] },
    { "id": 8, "tasks": ["14.1"] }
  ]
}
```
