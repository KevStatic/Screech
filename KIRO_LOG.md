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
