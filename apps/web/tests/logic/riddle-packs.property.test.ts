import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildClue, HUNT_ALPHABET, HUNT_ID_LENGTH } from '@screech/core';
import { RIDDLE_PACKS, type PackId } from '../../src/logic/riddle-packs';

const PACK_IDS: readonly PackId[] = ['office', 'home', 'classroom'];

const huntIdArb = fc
  .array(fc.constantFrom(...HUNT_ALPHABET.split('')), {
    minLength: HUNT_ID_LENGTH,
    maxLength: HUNT_ID_LENGTH,
  })
  .map((chars) => chars.join(''));

const totalArb = fc.integer({ min: 3, max: 7 });

/** Any pack, any entry of it, any valid total and an index within that total. */
const clueCaseArb = fc
  .record({
    packId: fc.constantFrom(...PACK_IDS),
    entryIdx: fc.integer({ min: 0, max: 6 }),
    huntId: huntIdArb,
    total: totalArb,
  })
  .chain((c) =>
    fc.integer({ min: 1, max: c.total }).map((index) => ({ ...c, index })),
  );

// Feature: ghost-hunt, Property 14: Built-in pack texts are valid
describe('Property 14: Built-in pack texts are valid', () => {
  it('every entry builds a clue for any valid Hunt_ID, index and total, with ASCII text and limits kept', () => {
    // **Validates: Requirements 3.5, 3.8, 16.13**
    fc.assert(
      fc.property(clueCaseArb, ({ packId, entryIdx, huntId, total, index }) => {
        const pack = RIDDLE_PACKS[packId];
        const entry = pack.entries[entryIdx]!;
        const built = buildClue({
          huntId,
          index,
          total,
          name: entry.name,
          clue: entry.clue,
        });
        expect(built.ok).toBe(true);

        for (const text of [entry.name, entry.hideAt, entry.clue, pack.opening, pack.finale]) {
          // eslint-disable-next-line no-control-regex
          expect(/^[\x20-\x7e]+$/.test(text)).toBe(true);
          expect(text).toBe(text.trim());
        }
        expect(entry.hideAt.length).toBeGreaterThanOrEqual(1);
        expect(entry.hideAt.length).toBeLessThanOrEqual(40);
        expect(pack.opening.length).toBeGreaterThanOrEqual(1);
        expect(pack.opening.length).toBeLessThanOrEqual(200);
      }),
      { numRuns: 200 },
    );
  });
});

// Feature: ghost-hunt, Property 15: Built-in clues fit in 90 bytes
describe('Property 15: Built-in clues fit in 90 bytes', () => {
  it('every built Packet is at most 90 bytes', () => {
    // **Validates: Requirements 3.8, 16.13**
    fc.assert(
      fc.property(clueCaseArb, ({ packId, entryIdx, huntId, total, index }) => {
        const entry = RIDDLE_PACKS[packId].entries[entryIdx]!;
        const built = buildClue({
          huntId,
          index,
          total,
          name: entry.name,
          clue: entry.clue,
        });
        expect(built.ok).toBe(true);
        if (built.ok) expect(built.value.length).toBeLessThanOrEqual(90);
      }),
      { numRuns: 200 },
    );
  });
});
