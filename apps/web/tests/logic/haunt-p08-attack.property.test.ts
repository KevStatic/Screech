// Feature: haunting-sounds, Property 8: Gentle attack
// **Validates: Requirements 3.4**

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { attackTimeMs } from '../../src/logic/haunt-check';
import {
  MAX_SAMPLE_RATE,
  MIN_ATTACK_MS,
  MIN_SAMPLE_RATE,
  SOUND_NAMES,
  generateSound,
} from '../../src/logic/haunt-synth';

/** Independent attack time: first sample with abs >= 0.9 * peak, in ms. */
function plainAttackMs(samples: Float32Array, rate: number): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i] as number);
    if (a > peak) peak = a;
  }
  if (peak === 0) return 0;
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i] as number) >= 0.9 * peak) return (i / rate) * 1000;
  }
  return 0;
}

describe('Property 8: Gentle attack', () => {
  it('every sound takes at least MIN_ATTACK_MS to reach 90% of its peak', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SOUND_NAMES),
        fc.integer({ min: MIN_SAMPLE_RATE, max: MAX_SAMPLE_RATE }),
        fc.integer({ min: -0x80000000, max: 0xffffffff }),
        (name, rate, seed) => {
          const out = generateSound(name, rate, seed);
          const fromCheck = attackTimeMs(out, rate);
          const fromLoop = plainAttackMs(out, rate);
          expect(fromCheck).toBeCloseTo(fromLoop, 9);
          expect(fromLoop).toBeGreaterThanOrEqual(MIN_ATTACK_MS);
          expect(fromCheck).toBeGreaterThanOrEqual(MIN_ATTACK_MS);
        },
      ),
      { numRuns: 100 },
    );
  });
});
