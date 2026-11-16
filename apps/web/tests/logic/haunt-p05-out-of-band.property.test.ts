// Feature: haunting-sounds, Property 5: Energy stays out of the Screech_Band
import { describe, it } from 'vitest';
import fc from 'fast-check';
import {
  HAUNT_CEILING_HZ,
  OUT_OF_BAND_LIMIT,
  SOUND_NAMES,
  generateSound,
} from '../../src/logic/haunt-synth';
import { bandShare, outOfBandRatio } from './haunt-fft';

const SCREECH_LOW_HZ = 1875;
const SCREECH_HIGH_HZ = 6400;

describe('Property 5: Energy stays out of the Screech_Band', () => {
  it(
    'keeps energy above the ceiling and inside 1875..6400 Hz under the limit',
    () => {
      // **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.7, 2.8, 2.9**
      fc.assert(
        fc.property(
          fc.constantFrom(...SOUND_NAMES),
          fc.constantFrom(44100, 48000),
          fc.integer({ min: 0, max: 4294967295 }),
          (name, rate, seed) => {
            const samples = generateSound(name, rate, seed);
            const above = outOfBandRatio(samples, rate, HAUNT_CEILING_HZ);
            if (!(above < OUT_OF_BAND_LIMIT)) {
              throw new Error(
                `${name} at ${rate} Hz, seed ${seed}: out-of-band ratio above ${HAUNT_CEILING_HZ} Hz is ${above}, limit ${OUT_OF_BAND_LIMIT}`,
              );
            }
            const inBand = bandShare(samples, rate, SCREECH_LOW_HZ, SCREECH_HIGH_HZ);
            if (!(inBand < OUT_OF_BAND_LIMIT)) {
              throw new Error(
                `${name} at ${rate} Hz, seed ${seed}: Screech_Band share (${SCREECH_LOW_HZ}..${SCREECH_HIGH_HZ} Hz) is ${inBand}, limit ${OUT_OF_BAND_LIMIT}`,
              );
            }
          },
        ),
        { numRuns: 100 },
      );
    },
    60_000,
  );
});
