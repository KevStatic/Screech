// Feature: haunting-sounds, Property 18: Candle crackle limit
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CRACKLE_LIMIT_MS, crackleAllowed, candleChanged } from '../../src/logic/haunt-rules';

interface Reading {
  readonly value: number;
  readonly dt: number;
}

const readingArb = fc.record({
  value: fc.integer({ min: 0, max: 5 }),
  dt: fc.integer({ min: 0, max: 900 }),
});

interface Run {
  readonly starts: number[];
  readonly crackledAt: boolean[];
}

/** Mirrors the bridge: crackle only on a change that the limiter allows. */
function simulate(readings: readonly Reading[]): Run {
  const starts: number[] = [];
  const crackledAt: boolean[] = [];
  let prev: number | null = null;
  let last: number | null = null;
  let now = 0;
  for (const r of readings) {
    now += r.dt;
    const crackle = candleChanged(prev, r.value) && crackleAllowed(last, now);
    if (crackle) {
      starts.push(now);
      last = now;
    }
    crackledAt.push(crackle);
    prev = r.value;
  }
  return { starts, crackledAt };
}

describe('Property 18: Candle crackle limit', () => {
  // **Validates: Requirements 7.5, 7.6**
  it('crackle starts are at least 400 ms apart', () => {
    fc.assert(
      fc.property(fc.array(readingArb, { maxLength: 60 }), (readings) => {
        const { starts } = simulate(readings);
        for (let i = 1; i < starts.length; i += 1) {
          expect((starts[i] as number) - (starts[i - 1] as number)).toBeGreaterThanOrEqual(
            CRACKLE_LIMIT_MS,
          );
        }
      }),
      { numRuns: 200 },
    );
  });

  it('an unchanged value never crackles, and the first reading never crackles', () => {
    fc.assert(
      fc.property(fc.array(readingArb, { minLength: 1, maxLength: 60 }), (readings) => {
        const { crackledAt } = simulate(readings);
        expect(crackledAt[0]).toBe(false);
        for (let i = 1; i < readings.length; i += 1) {
          if ((readings[i] as Reading).value === (readings[i - 1] as Reading).value) {
            expect(crackledAt[i]).toBe(false);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it('candleChanged: null prev is never a change; unchanged is not a change', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1000, max: 1000 }), (v) => {
        expect(candleChanged(null, v)).toBe(false);
        expect(candleChanged(v, v)).toBe(false);
        expect(candleChanged(v, v + 1)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('crackleAllowed: null is true, >= 400 true, [0,400) false, negative true', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 5000 }),
        fc.integer({ min: 1, max: 5000 }),
        (t, diff, neg) => {
          expect(crackleAllowed(null, t)).toBe(true);
          expect(crackleAllowed(t, t + diff)).toBe(diff >= CRACKLE_LIMIT_MS);
          expect(crackleAllowed(t, t - neg)).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });
});
