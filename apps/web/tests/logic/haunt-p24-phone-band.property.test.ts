// Feature: haunting-sounds, Property 24: Most energy lies in the Phone_Band
import { describe, it } from 'vitest';
import fc from 'fast-check';
import {
  PHONE_BAND_HIGH_HZ,
  PHONE_BAND_LOW_HZ,
  PHONE_BAND_MIN_SHARE,
  SOUND_NAMES,
  generateSound,
} from '../../src/logic/haunt-synth';
import { bandShare } from './haunt-fft';

describe('Property 24: Most energy lies in the Phone_Band', () => {
  it(
    'puts at least PHONE_BAND_MIN_SHARE of the energy in the Phone_Band',
    () => {
      // **Validates: Requirements 2.10, 2.11, 2.15, 2.16**
      fc.assert(
        fc.property(
          fc.constantFrom(...SOUND_NAMES),
          fc.constantFrom(44100, 48000),
          fc.integer({ min: 0, max: 4294967295 }),
          (name, rate, seed) => {
            const samples = generateSound(name, rate, seed);
            const share = bandShare(samples, rate, PHONE_BAND_LOW_HZ, PHONE_BAND_HIGH_HZ);
            if (!(share >= PHONE_BAND_MIN_SHARE)) {
              throw new Error(
                `${name} at ${rate} Hz, seed ${seed}: Phone_Band share (${PHONE_BAND_LOW_HZ}..${PHONE_BAND_HIGH_HZ} Hz) is ${share}, minimum ${PHONE_BAND_MIN_SHARE}`,
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
