// Feature: haunting-sounds, Property 7: Level limit
// **Validates: Requirements 3.3, 3.9**
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DRONE_PEAK_LIMIT,
  HAUNT_PEAK_LIMIT,
  MAX_SAMPLE_RATE,
  MIN_SAMPLE_RATE,
  SOUND_NAMES,
  SOUND_SPECS,
  generateSound,
} from '../../src/logic/haunt-synth';

const NUM_RUNS = 100;
const EPS = 1e-6; // Float32 rounding slack

describe('Property 7: Level limit', () => {
  it('peak never exceeds HAUNT_PEAK_LIMIT or the sound spec peak; drone stays under DRONE_PEAK_LIMIT', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SOUND_NAMES),
        fc.integer({ min: MIN_SAMPLE_RATE, max: MAX_SAMPLE_RATE }),
        fc.integer({ min: 0, max: 0xffffffff }),
        (name, rate, seed) => {
          const samples = generateSound(name, rate, seed);
          let peak = 0;
          for (let i = 0; i < samples.length; i++) {
            const a = Math.abs(samples[i] as number);
            if (a > peak) peak = a;
            if (name === 'drone' && !(a < DRONE_PEAK_LIMIT)) return false;
          }
          return peak <= HAUNT_PEAK_LIMIT + EPS && peak <= SOUND_SPECS[name].peak + EPS;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('spec peaks themselves respect the limits', () => {
    for (const name of SOUND_NAMES) {
      expect(SOUND_SPECS[name].peak).toBeLessThanOrEqual(HAUNT_PEAK_LIMIT);
    }
    expect(SOUND_SPECS.drone.peak).toBeLessThan(DRONE_PEAK_LIMIT);
  });
});
