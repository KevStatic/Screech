import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { HUNT_ALPHABET, HUNT_ID_LENGTH, SPIRIT_TOTAL_MAX, SPIRIT_TOTAL_MIN } from '@screech/core';
import type { FoundState } from '../../src/logic/hunt-found';
import {
  PROGRESS_KEY_PREFIX,
  createProgressStore,
  parseFoundState,
  serializeFoundState,
  type StorageLike,
} from '../../src/logic/hunt-progress';

const huntIdArb = fc
  .array(fc.constantFrom(...HUNT_ALPHABET.split('')), { minLength: HUNT_ID_LENGTH, maxLength: HUNT_ID_LENGTH })
  .map((chars) => chars.join(''));

// Names that survive clue sanitising unchanged: no edge spaces, no controls, well under 24 bytes.
const nameArb = fc
  .array(fc.constantFrom(...'abcXYZ019 éñ漢-'.split('')), { minLength: 1, maxLength: 6 })
  .map((chars) => chars.join(''))
  .filter((s) => s.trim() === s && !s.includes('  '));

const stateArb: fc.Arbitrary<FoundState> = fc
  .tuple(huntIdArb, fc.integer({ min: SPIRIT_TOTAL_MIN, max: SPIRIT_TOTAL_MAX }))
  .chain(([huntId, total]) =>
    fc
      .tuple(
        fc.shuffledSubarray(
          Array.from({ length: total }, (_, i) => i + 1),
          { minLength: 0, maxLength: total },
        ),
        fc.array(nameArb, { minLength: total, maxLength: total }),
        fc.integer({ min: 0, max: 1_000_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
      )
      .map(([picked, names, first, span]) => {
        const indexes = [...picked].sort((a, b) => a - b);
        const found = indexes.map((index) => ({ index, name: names[index - 1]! }));
        const complete = found.length === total;
        return {
          huntId,
          total,
          found,
          firstFoundAt: found.length === 0 ? null : first,
          completedAt: complete ? first + span : null,
        };
      }),
  );

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('hunt-progress properties', () => {
  // Feature: ghost-hunt, Property 34: Saved progress
  // **Validates: Requirements 12.3, 12.4, 12.5, 12.11, 16.12**
  it('Property 34: round trip, no clue text', () => {
    fc.assert(
      fc.property(stateArb, (s) => {
        const text = serializeFoundState(s);
        expect(parseFoundState(text, s.huntId)).toEqual(s);
        const keys = Object.keys(JSON.parse(text) as Record<string, unknown>).sort();
        expect(keys).toEqual(['done', 'first', 'found', 'huntId', 'total', 'v']);
      }),
      { numRuns: 200 },
    );
  });

  // Feature: ghost-hunt, Property 34: Saved progress
  // **Validates: Requirements 12.3, 12.4, 12.5, 12.11, 16.12**
  it('Property 34: invalid text parses to null and load leaves it untouched', () => {
    const badTextArb = fc.oneof(
      fc.string(),
      fc.json(),
      stateArb.chain((s) =>
        fc.integer({ min: 0, max: serializeFoundState(s).length - 1 }).map((n) => ({
          text: serializeFoundState(s).slice(0, n),
          huntId: s.huntId,
        })),
      ),
    );
    fc.assert(
      fc.property(huntIdArb, badTextArb, (id, bad) => {
        const huntId = typeof bad === 'string' ? id : bad.huntId;
        const text = typeof bad === 'string' ? bad : bad.text;
        expect(parseFoundState(text, huntId)).toBeNull();
        const storage = memoryStorage();
        const key = `${PROGRESS_KEY_PREFIX}${huntId}`;
        storage.data.set(key, text);
        expect(createProgressStore(storage).load(huntId)).toBeNull();
        expect(storage.data.get(key)).toBe(text);
        expect(storage.data.size).toBe(1);
      }),
      { numRuns: 200 },
    );
  });

  // Feature: ghost-hunt, Property 34: Saved progress
  // **Validates: Requirements 12.3, 12.4, 12.5, 12.11, 16.12**
  it('Property 34: a state for another Hunt_ID is rejected', () => {
    fc.assert(
      fc.property(stateArb, huntIdArb, (s, other) => {
        fc.pre(other !== s.huntId);
        expect(parseFoundState(serializeFoundState(s), other)).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  // Feature: ghost-hunt, Property 34: Saved progress
  // **Validates: Requirements 12.3, 12.4, 12.5, 12.11, 16.12**
  it('Property 34: saving or clearing one Hunt never changes another', () => {
    fc.assert(
      fc.property(stateArb, stateArb, fc.boolean(), (a, b, useStorage) => {
        fc.pre(a.huntId !== b.huntId);
        const store = createProgressStore(useStorage ? memoryStorage() : null);
        store.save(a);
        expect(store.load(a.huntId)).toEqual(a);
        store.save(b);
        expect(store.load(a.huntId)).toEqual(a);
        expect(store.load(b.huntId)).toEqual(b);
        store.clear(b.huntId);
        expect(store.load(b.huntId)).toBeNull();
        expect(store.load(a.huntId)).toEqual(a);
      }),
      { numRuns: 100 },
    );
  });
});
