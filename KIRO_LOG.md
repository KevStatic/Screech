# Kiro Log

## November 14, 2026

- Initialized pnpm monorepo scaffold.
- Created `packages/core` (TypeScript library, Vitest + fast-check).
- Created `apps/web` (React + Vite + TypeScript).
- Created `apps/checkin-api` (placeholder with README).
- Added root `.gitignore` (Node defaults, `.kiro/` not ignored).
- Added `apps/spike`, a throwaway ggwave sound test with a `dev:spike` root script, and noted it in the structure steering file.
- Added a `log.md` steering file that defines the `/log` command for updating this file.
- Kiro features used: chat, steering.
- Wrote a spec for the Screech protocol (`.kiro/specs/screech-protocol`: requirements, design, tasks).
- Added a hook that runs the `packages/core` tests, including the property-based ones, whenever a TypeScript file in `src` or `tests` is saved.
- Kiro features used: spec, hook.
