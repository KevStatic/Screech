import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { CANDLE_CAPACITY, splitCandles } from '../../src/logic/candle-split';

const NUM_RUNS = 200;

/** Lists of distinct-ish items, lengths straddling the 100 boundary. */
const listArb = fc.oneof(
  fc.array(fc.integer(), { maxLength: 250 }),
  fc.integer({ min: CANDLE_CAPACITY - 2, max: CANDLE_CAPACITY + 2 }).chain((n) =>
    fc.array(fc.string(), { minLength: n, maxLength: n }),
  ),
);

describe('Feature: seance, Property 13: Candle_Circle split preserves order and count', () => {
  /** **Validates: Requirements 11.10** */
  it('concatenation equals the input and lengths add up', () => {
    fc.assert(
      fc.property(listArb, (items) => {
        const { circle, overflow } = splitCandles(items);
        expect([...circle, ...overflow]).toEqual(items);
        expect(circle.length + overflow.length).toBe(items.length);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  /** **Validates: Requirements 11.10** */
  it('circle holds the first 100 and overflow only exists past 100', () => {
    fc.assert(
      fc.property(listArb, (items) => {
        const { circle, overflow } = splitCandles(items);
        expect(circle.length).toBe(Math.min(items.length, CANDLE_CAPACITY));
        expect(overflow.length).toBe(Math.max(0, items.length - CANDLE_CAPACITY));
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
