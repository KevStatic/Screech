# Kiro Log

## November 14, 2026

- 12:59 AM - Initialized pnpm monorepo scaffold.
- 1:07 AM - Created `packages/core` (TypeScript library, Vitest + fast-check).
- 1:07 AM - Created `apps/web` (React + Vite + TypeScript).
- 1:07 AM - Created `apps/checkin-api` (placeholder with README).
- 1:07 AM - Added root `.gitignore` (Node defaults, `.kiro/` not ignored).
- 10:04 AM - Added `apps/spike`, a throwaway ggwave sound test with a `dev:spike` root script, and noted it in the structure steering file.
- 10:34 AM - Added a `log.md` steering file that defines the `/log` command for updating this file.
- Kiro features used: chat, steering.
- 12:19 PM - Wrote a spec for the Screech protocol (`.kiro/specs/screech-protocol`: requirements, design, tasks).
- 12:28 PM - Added a hook that runs the `packages/core` tests, including the property-based ones, whenever a TypeScript file in `src` or `tests` is saved.
- Kiro features used: spec, hook.
- 6:55 PM - Finished spec task 1: the foundation of `packages/core`. Source modules are `constants.ts`, `types.ts`, `result.ts` (16 error codes, `Result`, `ok`, `err`) and `guards.ts`. Shared test support is `tests/helpers.ts` (with independent reference implementations), `tests/arbitraries.ts` (fast-check generators) and `tests/guards.test.ts`. Ticked off in `tasks.md`.
- Kiro features used: spec (task execution), property tests.
- 6:59 PM - Finished spec task 2: `packages/core/src/utf8.ts` with strict UTF-8 encode/decode (lone surrogates and invalid bytes return null, BOM kept) and `hasLoneSurrogate`, plus unit and fast-check property tests in `tests/utf8.test.ts`. Ticked the task off in `tasks.md`.
- 7:01 PM - Adjusted the build setup to support it: added a `typecheck` script and `@types/node` to core, the DOM lib in the core tsconfig, a separate `rootDir` and `include` in `tsconfig.build.json`, and `--passWithNoTests` for the web app so `pnpm test` passes from the root.
- Kiro features used: spec (task execution), property tests, chat.
- 7:07 PM - Finished spec task 3: `packages/core/src/frame.ts` with `buildFrame` (writes 0xC1, type and flags, copies the body) and `parseFrame` (checks truncated, bad magic, version, type and reserved flags in the design order, never throws). Added a round-trip property test in `tests/frame.property.test.ts` and fixed-byte unit tests in `tests/frame.test.ts`. Ticked off in `tasks.md`.
- Kiro features used: spec (task execution), property tests.
- 7:16 PM - Finished spec task 4: URL compression. `packages/core/src/prefix-table.ts` holds the Prefix_Table and `src/url-body.ts` encodes and decodes URL bodies. Added property tests for the canonical URL form, the Prefix_Table and invalid URLs, plus unit tests in `tests/url-body.test.ts`. Ticked off in `tasks.md`.
- Kiro features used: spec (task execution), property tests.
- 7:36 PM - Finished spec task 5: `packages/core/src/text-body.ts` encodes and decodes the text, contact, checkin and hunt-clue bodies as strict UTF-8. The decoder rejects the compressed flag and invalid UTF-8, and the encoder rejects empty text and lone surrogates. Added a property test in `tests/text-body.property.test.ts` and unit tests in `tests/text-body.test.ts`. Ticked off in `tasks.md`.
- Kiro features used: spec (task execution), property tests.
- 7:40 PM - Finished spec task 6: `packages/core/src/wifi-body.ts` encodes and decodes Wi-Fi bodies. The encoder checks in the design order and always sets the compressed flag, and the decoder applies the strict mirror checks. Added property tests for the encoding rules (compared against the reference builder in `tests/helpers.ts`) and for malformed bodies, plus unit tests in `tests/wifi-body.test.ts`. Ticked off in `tasks.md`.
- Kiro features used: spec (task execution), property tests.
- 7:45 PM - Finished spec task 7: `packages/core/src/body.ts` has `encodeBody` and `decodeBody`, which dispatch to the per-type body modules for all six packet types. Payloads with an unknown shape return `invalid-payload` with the offending field named. Added unit tests in `tests/body.test.ts`. Ticked off in `tasks.md`.
- Kiro features used: spec (task execution).
- 7:50 PM - Finished spec task 8: `packages/core/src/codec.ts` has the synchronous `encode` and `decode`, built on the frame and body modules. Added six property-test files (unsealed round trip, header validation, invalid payloads, size cap and determinism, totality and input safety, multipart passthrough) and unit tests in `tests/codec.test.ts`. Ticked off in `tasks.md`.
- Kiro features used: spec (task execution), property tests.
- 8:04 PM - Passed spec task 9, the checkpoint after the synchronous codec. `pnpm test` from the root runs 22 test files and 183 tests in `packages/core`, all passing. Ticked off in `tasks.md`.
- Kiro features used: spec (task execution), property tests.
- 8:42 PM - Finished spec task 10: `packages/core/src/seal.ts` has `deriveNonce` and `seal` (AES-GCM through `crypto.subtle`, 8-byte tag, header bytes as AAD, `crypto-unavailable` instead of a rejected Promise). Extended `tests/helpers.ts` with independent crypto references (a known-answer builder on `node:crypto` and a direct SubtleCrypto decrypt). Added property tests for nonce derivation, sealer size, determinism and argument validation, and invalid payloads, plus unit tests in `tests/seal.test.ts`. Ticked off in `tasks.md`.
- 8:39 PM - Updated the structure steering file to describe the `packages/core` modules, `apps/spike` and the `.kiro/` folders (steering, specs, hooks).
- Kiro features used: spec (task execution), property tests, steering.
- 8:49 PM - Finished spec task 11: added `open` to `packages/core/src/seal.ts`, the counterpart of `seal`. Added six property-test files (sealed round trip and layout, tampering, wrong keys, sealed-flag routing, validation and totality, input safety and sealed multipart) and unit tests in `tests/open.test.ts`. Ticked off in `tasks.md`.
- Kiro features used: spec (task execution), property tests.
- 9:12 PM - Finished spec task 12: `packages/core/src/sender-state.ts` has `nextSenderState`, which increments the counter and picks a fresh Sender_ID at rollover (65535), forcing it to differ from the old one even if the random source returns the same ID. The random source can be injected, and a missing or failing `getRandomValues` gives `crypto-unavailable`. Added property tests for rotation, totality and input safety, unit tests, and a deterministic test that calls it 70,000 times without repeating an ID. Ticked off in `tasks.md`.
- Kiro features used: spec (task execution), property tests.
- 9:15 PM - Finished spec task 13: replaced the placeholder in `packages/core/src/index.ts` with the public API (`encode`, `decode`, `seal`, `open`, `deriveNonce`, `nextSenderState`, `buildFrame`, `parseFrame`, `PREFIX_TABLE`, the types and the constants apps need) and updated `tests/index.test.ts`. Added `tests/static-scan.test.ts`, which fails if the source uses Node-only APIs, `getRandomValues` outside `sender-state.ts`, `crypto.subtle` outside `seal.ts`, or `any` as a type. Added `tests/errors.test.ts` with one fixed example for each of the 16 error codes, using only the public API. Ticked off in `tasks.md`.
- Kiro features used: spec (task execution).
- 9:29 PM - Finished spec task 14, the final checkpoint, which completes the screech-protocol spec. `pnpm test` from the root passes: 39 test files and 275 tests, with the `packages/core` suite finishing in 6.27 seconds against the 20 second budget. Ticked off in `tasks.md`.
- Still open: the spec lists a manual check of a seal and open round trip on iOS Safari and Android Chrome over HTTPS, to confirm `tagLength: 64` works there.
- Kiro features used: spec (task execution), property tests.
- 9:32 PM - Edited `packages/core/tests/open-totality.property.test.ts` after the final checkpoint. Its four property tests still pass when run on their own. This was the only file changed since the last entry.
- Kiro features used: chat, property tests.
- 9:36 PM - Added a crypto self-test button to the `apps/spike` page so the sealed mode can be checked on a real phone, which is the manual iOS Safari and Android Chrome check still open from the spec. `apps/spike/src/selftest.ts` seals and opens a message with `@screech/core` (now a workspace dependency of the spike) and also compares one sealed packet against a known answer generated with `node:crypto`. Results are listed as PASS or FAIL on the page. It has not been run on a phone yet.
- Kiro features used: chat.

## November 15, 2026

- 9:52 AM - Added the UI design reference in `docs/design/`: a README and seven `.dc.html` mockup screens (Awaken, Speak, Screeching, Listen, Reveal, Cursed packet, Séance room). They are reference only and are meant to be rebuilt in React in `apps/web`.
- 9:56 AM - Added a `ui-theme.md` steering file, "the spirit box". It sets the colours, the three fonts, mobile-first sizing (390 px wide, 44 px touch targets, 4.5:1 contrast), the reduced-motion and Exorcise rules, and the copy voice. Its main rule is that every spooky effect must show real state.
- Kiro features used: steering.
- 10:32 AM - Wrote a second spec, `.kiro/specs/spirit-box-app` (requirements first), for the Screech web app in `apps/web`: the Awaken, Speak, Screeching, Listen and Reveal screens, built on `@screech/core`. The design splits the app into pure logic (`src/logic`, where the properties are tested), an audio engine (`src/audio`) and the React UI (`src/ui`). The 18 tasks run from project setup to a final checkpoint, and none are started. Sealed rooms, the Cursed screen, the Séance room and the check-in API are out of scope for this spec.
- Kiro features used: spec, steering (the design follows the `ui-theme` rules).
