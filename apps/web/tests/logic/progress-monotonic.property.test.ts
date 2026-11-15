import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { progress, percent, remainingSeconds } from '../../src/logic/progress';

const time = fc.double({ min: -1e6, max: 1e6, noNaN: true });
const duration = fc.double({ min: 1e-3, max: 1e6, noNaN: true });

describe('progress properties', () => {
  /**
   * Feature: spirit-box-app, Property 16: Progress is monotonic
   * **Validates: Requirements 10.10**
   */
  it('Property 16: Progress is monotonic', () => {
    fc.assert(
      fc.property(time, time, duration, (a, b, d) => {
        const t1 = Math.min(a, b);
        const t2 = Math.max(a, b);
        expect(progress(t1, d)).toBeLessThanOrEqual(progress(t2, d));
        expect(remainingSeconds(t1, d)).toBeGreaterThanOrEqual(remainingSeconds(t2, d));
        expect(percent(progress(t1, d))).toBeLessThanOrEqual(percent(progress(t2, d)));
      }),
      { numRuns: 200 },
    );
  });
});
