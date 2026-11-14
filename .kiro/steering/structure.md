# Project Structure

- `packages/core/`: TypeScript library (`src/`, `tests/`), tested with Vitest + fast-check
  - `src/frame.ts`: frame layout (header and fields)
  - `src/*-body.ts` (`text`, `url`, `wifi`) and `body.ts`: payload body encoders/decoders per type
  - `src/codec.ts`: encode/decode of messages, including multipart
  - Supporting modules: `constants`, `guards`, `prefix-table`, `result`, `types`, `utf8`, `index` (public exports)
  - Upcoming: `seal` (sealed mode encryption) and `sender-state`
- `apps/web/`: React + Vite app (`src/`)
- `apps/checkin-api/`: placeholder, README only
- `apps/spike/`: throwaway ggwave sound test, not part of the product
- `.kiro/`: Kiro configuration
  - `steering/`: `product.md`, `tech.md`, `structure.md`, and `log.md` (manual steering, run with `/log` to update `KIRO_LOG.md`)
  - `specs/`: feature specs (currently `screech-protocol`)
  - `hooks/`: automation hooks (currently `run-core-tests-on-save.json`)
- `KIRO_LOG.md`: dated log of work done with Kiro
