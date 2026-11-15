import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  bandEnergy,
  binFrequency,
  meterSteps,
  SCREECH_BAND_LOW_HZ as LOW,
  SCREECH_BAND_HIGH_HZ as HIGH,
} from '../../src/logic/band-energy';

// Feature: spirit-box-app, Property 17: Band energy is normalised
// **Validates: Requirements 11.5, 11.6, 11.7, 11.9**

const NUM_RUNS = 200;

const sampleRateArb = fc.integer({ min: 8000, max: 96000 });
const fftSizeArb = fc.integer({ min: 5, max: 13 }).map((e) => 2 ** e);
const magnitudeArb = fc.oneof(
  { weight: 9, arbitrary: fc.integer({ min: 0, max: 255 }) },
  { weight: 1, arbitrary: fc.constantFrom(NaN, Infinity, -Infinity) },
);
const magnitudesArb = fc.array(magnitudeArb, { maxLength: 2048 });

function inBandCount(length: number, sampleRate: number, fftSize: number): number {
  let n = 0;
  for (let i = 0; i < length; i++) {
    const f = binFrequency(i, sampleRate, fftSize);
    if (f >= LOW && f <= HIGH) n++;
  }
  return n;
}

describe('Feature: spirit-box-app, Property 17: Band energy is normalised', () => {
  it('returns a finite value in [0, 1] for any magnitudes, sample rate and FFT size', () => {
    fc.assert(
      fc.property(magnitudesArb, sampleRateArb, fftSizeArb, (mags, sr, fft) => {
        const e = bandEnergy(mags, sr, fft, LOW, HIGH);
        expect(Number.isFinite(e)).toBe(true);
        expect(e).toBeGreaterThanOrEqual(0);
        expect(e).toBeLessThanOrEqual(1);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('returns 0 for all-zero magnitudes', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2048 }), sampleRateArb, fftSizeArb, (len, sr, fft) => {
        expect(bandEnergy(new Array<number>(len).fill(0), sr, fft, LOW, HIGH)).toBe(0);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('returns 1 for all-255 magnitudes when the band has bins', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2048 }), sampleRateArb, fftSizeArb, (len, sr, fft) => {
        fc.pre(inBandCount(len, sr, fft) > 0);
        expect(bandEnergy(new Array<number>(len).fill(255), sr, fft, LOW, HIGH)).toBe(1);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('returns 0 for an empty array', () => {
    fc.assert(
      fc.property(sampleRateArb, fftSizeArb, (sr, fft) => {
        expect(bandEnergy([], sr, fft, LOW, HIGH)).toBe(0);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('meterSteps is an integer 0..5 and monotonic in energy', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (a, b) => {
          const [lo, hi] = a <= b ? [a, b] : [b, a];
          const sLo = meterSteps(lo);
          const sHi = meterSteps(hi);
          for (const s of [sLo, sHi]) {
            expect(Number.isInteger(s)).toBe(true);
            expect(s).toBeGreaterThanOrEqual(0);
            expect(s).toBeLessThanOrEqual(5);
          }
          expect(sLo).toBeLessThanOrEqual(sHi);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('meterSteps of bandEnergy output is always an integer 0..5', () => {
    fc.assert(
      fc.property(magnitudesArb, sampleRateArb, fftSizeArb, (mags, sr, fft) => {
        const s = meterSteps(bandEnergy(mags, sr, fft, LOW, HIGH));
        expect(Number.isInteger(s)).toBe(true);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(5);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
