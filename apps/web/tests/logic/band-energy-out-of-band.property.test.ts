import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  bandEnergy,
  binFrequency,
  SCREECH_BAND_LOW_HZ,
  SCREECH_BAND_HIGH_HZ,
} from '../../src/logic/band-energy';

// Feature: spirit-box-app, Property 18: Band energy ignores out-of-band bins
describe('Property 18: Band energy ignores out-of-band bins', () => {
  it('changing out-of-band bins does not change bandEnergy', () => {
    // **Validates: Requirements 11.8**
    fc.assert(
      fc.property(
        fc.constantFrom(22050, 32000, 44100, 48000, 96000),
        fc.constantFrom(256, 512, 1024, 2048, 4096),
        fc.integer({ min: 0, max: 600 }),
        fc.infiniteStream(fc.integer({ min: 0, max: 255 })),
        fc.infiniteStream(fc.integer({ min: 0, max: 255 })),
        (sampleRate, fftSize, length, origStream, replStream) => {
          const orig = origStream[Symbol.iterator]();
          const repl = replStream[Symbol.iterator]();
          const before: number[] = [];
          const after: number[] = [];
          for (let i = 0; i < length; i++) {
            const a = orig.next().value as number;
            const b = repl.next().value as number;
            before.push(a);
            const f = binFrequency(i, sampleRate, fftSize);
            const inBand = f >= SCREECH_BAND_LOW_HZ && f <= SCREECH_BAND_HIGH_HZ;
            after.push(inBand ? a : b);
          }
          expect(
            bandEnergy(after, sampleRate, fftSize, SCREECH_BAND_LOW_HZ, SCREECH_BAND_HIGH_HZ),
          ).toBe(
            bandEnergy(before, sampleRate, fftSize, SCREECH_BAND_LOW_HZ, SCREECH_BAND_HIGH_HZ),
          );
        },
      ),
      { numRuns: 200 },
    );
  });
});
