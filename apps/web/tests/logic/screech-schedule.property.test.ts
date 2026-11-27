import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { screechInterval, SCREECH_MIN_MS, SCREECH_MAX_MS } from '../../src/logic/screech-schedule';

describe('screech-schedule properties', () => {
  // Feature: seance, Property 14: Screech interval stays in range
  // **Validates: Requirements 12.2**
  it('Property 14: any value in [0, 1) gives an integer in 10000..15000', () => {
    const unit = fc.double({ min: 0, max: 1, noNaN: true, maxExcluded: true });
    fc.assert(
      fc.property(unit, (r) => {
        const v = screechInterval(r);
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(SCREECH_MIN_MS);
        expect(v).toBeLessThanOrEqual(SCREECH_MAX_MS);
      }),
      { numRuns: 200 },
    );
    expect(SCREECH_MIN_MS).toBe(10000);
    expect(SCREECH_MAX_MS).toBe(15000);
  });

  // Feature: seance, Property 14: Screech interval stays in range
  // **Validates: Requirements 12.2**
  it('Property 14: any invalid input gives SCREECH_MIN_MS without throwing', () => {
    const bad = fc.oneof(
      fc.double({ min: 1, max: 1e9 }),
      fc.double({ min: -1e9, max: -Number.MIN_VALUE }),
      fc.constantFrom(NaN, Infinity, -Infinity, 1, -0.5),
      fc.constantFrom<unknown>(undefined, null, '0.5', {}, [], true).map((x) => x as number),
    );
    fc.assert(
      fc.property(bad, (r) => {
        expect(screechInterval(r)).toBe(SCREECH_MIN_MS);
      }),
      { numRuns: 200 },
    );
  });
});
