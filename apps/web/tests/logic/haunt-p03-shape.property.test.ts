// Feature: haunting-sounds, Property 3: Valid shape and duration
// **Validates: Requirements 1.2, 1.6, 1.7, 8.9**

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  MAX_SAMPLE_RATE,
  MIN_SAMPLE_RATE,
  SOUND_NAMES,
  SOUND_SPECS,
  generateSound,
  type SoundName,
} from '../../src/logic/haunt-synth';

/** Requirement 8.9 ranges, in seconds. */
const REQ_8_9: Partial<Record<SoundName, readonly [number, number]>> = {
  'planchette-scrape': [0.15, 0.5],
  whisper: [0.8, 2.0],
  'broken-crackle': [0.4, 1.2],
  'sealed-thud': [0.4, 1.5],
};

describe('Property 3: Valid shape and duration', () => {
  it('every sound is non-empty, finite, within -1..1 and of valid duration at any rate', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SOUND_NAMES),
        fc.integer({ min: MIN_SAMPLE_RATE, max: MAX_SAMPLE_RATE }),
        fc.integer({ min: -0x80000000, max: 0xffffffff }),
        (name, rate, seed) => {
          const out = generateSound(name, rate, seed);
          expect(out).toBeInstanceOf(Float32Array);
          expect(out.length).toBeGreaterThan(0);

          let ok = true;
          for (let i = 0; i < out.length; i++) {
            const v = out[i] as number;
            if (!Number.isFinite(v) || v < -1 || v > 1) {
              ok = false;
              break;
            }
          }
          expect(ok).toBe(true);

          const sec = out.length / rate;
          const spec = SOUND_SPECS[name];
          expect(sec).toBeGreaterThanOrEqual(spec.minSec);
          expect(sec).toBeLessThanOrEqual(spec.maxSec);

          if (name === 'drone') {
            expect(sec).toBeGreaterThanOrEqual(2.0);
            expect(sec).toBeLessThanOrEqual(8.0);
          } else {
            expect(sec).toBeGreaterThanOrEqual(0.15);
            expect(sec).toBeLessThanOrEqual(3.0);
          }
          const r = REQ_8_9[name];
          if (r !== undefined) {
            expect(sec).toBeGreaterThanOrEqual(r[0]);
            expect(sec).toBeLessThanOrEqual(r[1]);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
