import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { airtimeSeconds } from '../../src/logic/airtime';

// Feature: ghost-hunt, Property 13: Airtime
describe('Property 13: Airtime', () => {
  it('equals ceil(0.7 + 0.0614 * bytes) and is an integer for finite bytes >= 0', () => {
    // **Validates: Requirements 4.12, 4.13, 4.17, 16.14**
    fc.assert(
      fc.property(fc.double({ min: 0, max: 100000, noNaN: true }), (bytes) => {
        const s = airtimeSeconds(bytes);
        expect(s).toBe(Math.ceil(0.7 + 0.0614 * bytes));
        expect(Number.isInteger(s)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('does not decrease as bytes increase', () => {
    // **Validates: Requirements 4.12, 4.13, 4.17, 16.14**
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 100000, noNaN: true }),
        fc.double({ min: 0, max: 100000, noNaN: true }),
        (a, b) => {
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          expect(airtimeSeconds(lo)).toBeLessThanOrEqual(airtimeSeconds(hi));
        },
      ),
      { numRuns: 200 },
    );
  });

  it('returns 0 without throwing for anything that is not a finite number >= 0', () => {
    // **Validates: Requirements 4.12, 4.13, 4.17, 16.14**
    const bad = fc.oneof(
      fc.double({ max: -Number.MIN_VALUE, noNaN: true }),
      fc.constantFrom(NaN, Infinity, -Infinity),
      fc.string(),
      fc.constantFrom(null, undefined, {}, [], true),
    );
    fc.assert(
      fc.property(bad, (v) => {
        expect(() => airtimeSeconds(v as number)).not.toThrow();
        expect(airtimeSeconds(v as number)).toBe(0);
      }),
      { numRuns: 200 },
    );
  });
});
