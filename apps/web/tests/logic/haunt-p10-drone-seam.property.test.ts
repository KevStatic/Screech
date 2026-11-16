// Feature: haunting-sounds, Property 10: Drone loop seam
// **Validates: Requirements 4.2**
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { generateDrone } from '../../src/logic/haunt-synth';

describe('Property 10: Drone loop seam', () => {
  it('starts and ends at exactly 0, with a seam step no larger than the largest in-buffer step', () => {
    fc.assert(
      fc.property(fc.integer({ min: 22050, max: 96000 }), (rate) => {
        const x = generateDrone(rate);
        expect(x.length).toBe(4 * rate + 1);
        expect(x[0]).toBe(0);
        expect(x[x.length - 1]).toBe(0);
        let maxStep = 0;
        for (let i = 1; i < x.length; i++) {
          maxStep = Math.max(maxStep, Math.abs(x[i]! - x[i - 1]!));
        }
        expect(Math.abs(x[x.length - 1]! - x[0]!)).toBeLessThanOrEqual(maxStep);
      }),
      { numRuns: 100 },
    );
  });
});
