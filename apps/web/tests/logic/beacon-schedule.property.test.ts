import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { beaconInterval, countdownSeconds } from '../../src/logic/beacon-schedule';

describe('beacon-schedule properties', () => {
  // Feature: ghost-hunt, Property 24: Beacon interval
  // **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 16.10**
  it('Property 24: interval is an integer in 15000..20000 and monotonic', () => {
    const unit = fc.double({ min: 0, max: 1, noNaN: true, maxExcluded: true });
    fc.assert(
      fc.property(unit, unit, (a, b) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        const x = beaconInterval(lo);
        const y = beaconInterval(hi);
        expect(Number.isInteger(x)).toBe(true);
        expect(x).toBeGreaterThanOrEqual(15000);
        expect(y).toBeLessThanOrEqual(20000);
        expect(x).toBeLessThanOrEqual(y);
      }),
      { numRuns: 200 },
    );
    expect(beaconInterval(0)).toBe(15000);
  });

  // Feature: ghost-hunt, Property 24: Beacon interval
  // **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 16.10**
  it('Property 24: any value outside [0, 1) gives 15000 without throwing', () => {
    const bad = fc.oneof(
      fc.double({ min: 1, max: 1e9 }),
      fc.double({ min: -1e9, max: -Number.MIN_VALUE }),
      fc.constantFrom(NaN, Infinity, -Infinity),
    );
    fc.assert(
      fc.property(bad, (v) => {
        expect(beaconInterval(v)).toBe(15000);
      }),
      { numRuns: 200 },
    );
  });

  // Feature: ghost-hunt, Property 25: Countdown
  // **Validates: Requirements 8.15, 16.11**
  it('Property 25: countdown is ceil of seconds remaining, else 0', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000_000 }),
        fc.integer({ min: -30000, max: 20000 }),
        (now, diff) => {
          const next = now + diff;
          const s = countdownSeconds(next, now);
          expect(Number.isInteger(s)).toBe(true);
          expect(s).toBeGreaterThanOrEqual(0);
          expect(s).toBeLessThanOrEqual(20);
          expect(s).toBe(next > now ? Math.ceil(diff / 1000) : 0);
        },
      ),
      { numRuns: 200 },
    );
  });
});
