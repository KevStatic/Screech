import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { progress, percent, remainingSeconds, formatDuration } from '../../src/logic/progress';

// Feature: spirit-box-app, Property 15: Progress values are bounded
// **Validates: Requirements 10.3, 10.9, 10.12**

const elapsedArb = fc.oneof(
  fc.double({ noNaN: false }),
  fc.double({ min: -1e12, max: 1e12, noNaN: true }),
  fc.constantFrom(NaN, Infinity, -Infinity, 0, -0, Number.MAX_VALUE, -Number.MAX_VALUE),
);

const durationArb = fc.oneof(
  fc.double({ min: 1e-6, max: 1e6, noNaN: true }),
  fc.double({ min: 1e-9, max: 1e15, noNaN: true }),
  fc.constantFrom(0.1, 1, 8.5, 60),
);

describe('Feature: spirit-box-app, Property 15: Progress values are bounded', () => {
  it('keeps progress, percent, remaining seconds and formatted duration in range', () => {
    fc.assert(
      fc.property(elapsedArb, durationArb, (elapsed, duration) => {
        const p = progress(elapsed, duration);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);

        const pct = percent(p);
        expect(Number.isInteger(pct)).toBe(true);
        expect(pct).toBeGreaterThanOrEqual(0);
        expect(pct).toBeLessThanOrEqual(100);

        const rem = remainingSeconds(elapsed, duration);
        expect(Number.isInteger(rem)).toBe(true);
        expect(rem).toBeGreaterThanOrEqual(0);
        expect(rem).toBeLessThanOrEqual(Math.ceil(duration));

        expect(formatDuration(duration)).toMatch(/^\d+\.\d$/);
        expect(formatDuration(rem)).toMatch(/^\d+\.\d$/);
      }),
      { numRuns: 200 },
    );
  });
});
