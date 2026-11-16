// Feature: haunting-sounds, Property 9: Smooth steps
// **Validates: Requirements 3.5**

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  MAX_SAMPLE_RATE,
  MAX_STEP,
  MIN_SAMPLE_RATE,
  SOUND_NAMES,
  generateSound,
} from '../../src/logic/haunt-synth';

function maxStep(out: Float32Array): number {
  let m = 0;
  for (let i = 1; i < out.length; i++) {
    m = Math.max(m, Math.abs((out[i] as number) - (out[i - 1] as number)));
  }
  return m;
}

describe('Property 9: Smooth steps', () => {
  it('no two consecutive samples differ by more than MAX_STEP', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SOUND_NAMES),
        fc.oneof(
          { arbitrary: fc.integer({ min: MIN_SAMPLE_RATE, max: MIN_SAMPLE_RATE + 2000 }), weight: 1 },
          { arbitrary: fc.constantFrom(22050, 44100, 48000, 96000), weight: 1 },
          { arbitrary: fc.integer({ min: MIN_SAMPLE_RATE, max: MAX_SAMPLE_RATE }), weight: 2 },
        ),
        fc.integer({ min: -0x80000000, max: 0xffffffff }),
        (name, rate, seed) => {
          expect(maxStep(generateSound(name, rate, seed))).toBeLessThanOrEqual(MAX_STEP);
        },
      ),
      { numRuns: 150 },
    );
  });
});
