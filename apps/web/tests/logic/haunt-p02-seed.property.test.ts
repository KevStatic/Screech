// Feature: haunting-sounds, Property 2: Seed sensitivity
// **Validates: Requirements 1.5**

import fc from 'fast-check';
import { describe, it } from 'vitest';

import {
  MAX_SAMPLE_RATE,
  MIN_SAMPLE_RATE,
  SOUND_NAMES,
  generateSound,
  type OneShotName,
} from '../../src/logic/haunt-synth';

const ONE_SHOTS: readonly OneShotName[] = SOUND_NAMES.filter(
  (n): n is OneShotName => n !== 'drone',
);

const seedArb = fc.integer({ min: 0, max: 4294967295 });

describe('Property 2: Seed sensitivity', () => {
  it('two different seeds give audio that differs in at least one sample', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ONE_SHOTS),
        fc.integer({ min: MIN_SAMPLE_RATE, max: MAX_SAMPLE_RATE }),
        fc.tuple(seedArb, seedArb).filter(([a, b]) => a !== b),
        (name, rate, [seedA, seedB]) => {
          const a = generateSound(name, rate, seedA);
          const b = generateSound(name, rate, seedB);
          if (a.length !== b.length) return true;
          for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) return true;
          }
          return false;
        },
      ),
      { numRuns: 100 },
    );
  });
});
