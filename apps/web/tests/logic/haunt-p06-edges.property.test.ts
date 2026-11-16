// Feature: haunting-sounds, Property 6: Silent edges
// **Validates: Requirements 3.1, 3.2, 4.1**

import fc from 'fast-check';
import { describe, it } from 'vitest';

import {
  MAX_SAMPLE_RATE,
  MIN_SAMPLE_RATE,
  SOUND_NAMES,
  generateSound,
} from '../../src/logic/haunt-synth';

describe('Property 6: Silent edges', () => {
  it('first and last sample are exactly 0 for every sound, rate and seed', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SOUND_NAMES),
        fc.integer({ min: MIN_SAMPLE_RATE, max: MAX_SAMPLE_RATE }),
        fc.integer({ min: 0, max: 4294967295 }),
        (name, rate, seed) => {
          const out = generateSound(name, rate, seed);
          if (out.length === 0) return false;
          return out[0] === 0 && out[out.length - 1] === 0;
        },
      ),
      { numRuns: 200 },
    );
  });
});
