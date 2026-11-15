import { describe, expect, it } from 'vitest';
import {
  SCREECH_BAND_HIGH_HZ,
  SCREECH_BAND_LOW_HZ,
  bandEnergy,
  binFrequency,
  meterSteps,
} from '../../src/logic/band-energy';

const FFT = 2048;
const BINS = FFT / 2;

/** Bin indices whose frequency lies inside the Screech band, computed with binFrequency. */
function inBand(sampleRate: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < BINS; i++) {
    const f = binFrequency(i, sampleRate, FFT);
    if (f >= SCREECH_BAND_LOW_HZ && f <= SCREECH_BAND_HIGH_HZ) out.push(i);
  }
  return out;
}

function energyWithOnly(index: number, sampleRate: number): number {
  const mags = new Uint8Array(BINS);
  mags[index] = 255;
  return bandEnergy(mags, sampleRate, FFT, SCREECH_BAND_LOW_HZ, SCREECH_BAND_HIGH_HZ);
}

describe('band constants', () => {
  it('are 1875 Hz and 6400 Hz', () => {
    expect(SCREECH_BAND_LOW_HZ).toBe(1875);
    expect(SCREECH_BAND_HIGH_HZ).toBe(6400);
  });
});

describe('binFrequency', () => {
  it('is index * sampleRate / fftSize', () => {
    expect(binFrequency(80, 48000, 2048)).toBe(1875);
    expect(binFrequency(0, 44100, 2048)).toBe(0);
  });
});

describe.each([44100, 48000])('band edges at %i Hz', (sampleRate) => {
  const bins = inBand(sampleRate);
  const first = bins[0];
  const last = bins[bins.length - 1];

  it('band bins are contiguous', () => {
    expect(bins).toHaveLength(last - first + 1);
  });

  it('first and last in-band bins count, their neighbours do not', () => {
    const one = 1 / bins.length;
    expect(energyWithOnly(first, sampleRate)).toBeCloseTo(one, 10);
    expect(energyWithOnly(last, sampleRate)).toBeCloseTo(one, 10);
    expect(energyWithOnly(first - 1, sampleRate)).toBe(0);
    expect(energyWithOnly(last + 1, sampleRate)).toBe(0);
  });

  it('the first bin is the first at or above 1875 Hz and the last is at or below 6400 Hz', () => {
    expect(binFrequency(first, sampleRate, FFT)).toBeGreaterThanOrEqual(1875);
    expect(binFrequency(first - 1, sampleRate, FFT)).toBeLessThan(1875);
    expect(binFrequency(last, sampleRate, FFT)).toBeLessThanOrEqual(6400);
    expect(binFrequency(last + 1, sampleRate, FFT)).toBeGreaterThan(6400);
  });

  it('full-scale magnitudes in every bin give energy 1', () => {
    const mags = new Uint8Array(BINS).fill(255);
    expect(bandEnergy(mags, sampleRate, FFT, 1875, 6400)).toBe(1);
  });
});

describe('bin counts at the band edges', () => {
  it('48000 Hz: bin 80 is exactly 1875 Hz and is included', () => {
    expect(binFrequency(80, 48000, FFT)).toBe(1875);
    expect(inBand(48000)[0]).toBe(80);
  });

  it('44100 Hz: neither edge falls exactly on a bin', () => {
    const bins = inBand(44100);
    expect(binFrequency(bins[0], 44100, FFT)).toBeGreaterThan(1875);
    expect(binFrequency(bins[bins.length - 1], 44100, FFT)).toBeLessThan(6400);
  });

  it('an inclusive edge: a band ending exactly on a bin frequency includes that bin', () => {
    const mags = new Uint8Array(BINS);
    mags[100] = 255;
    const f = binFrequency(100, 48000, FFT);
    expect(bandEnergy(mags, 48000, FFT, f, f)).toBe(1);
  });
});

describe('bandEnergy edge cases', () => {
  it('empty magnitudes return 0', () => {
    expect(bandEnergy(new Uint8Array(0), 48000, FFT, 1875, 6400)).toBe(0);
  });

  it('non-finite magnitudes count as 0 but still count as bins', () => {
    const mags = new Array<number>(BINS).fill(0);
    const bins = inBand(48000);
    mags[bins[0]] = NaN;
    mags[bins[1]] = Infinity;
    mags[bins[2]] = -Infinity;
    mags[bins[3]] = 255;
    expect(bandEnergy(mags, 48000, FFT, 1875, 6400)).toBeCloseTo(1 / bins.length, 10);
  });

  it('invalid sample rate or fft size gives 0', () => {
    const mags = new Uint8Array(BINS).fill(255);
    expect(bandEnergy(mags, 0, FFT, 1875, 6400)).toBe(0);
    expect(bandEnergy(mags, NaN, FFT, 1875, 6400)).toBe(0);
    expect(bandEnergy(mags, 48000, 0, 1875, 6400)).toBe(0);
  });
});

describe('meterSteps', () => {
  it('rounds to the nearest step with the default of 5', () => {
    expect(meterSteps(0)).toBe(0);
    expect(meterSteps(0.09)).toBe(0);
    expect(meterSteps(0.11)).toBe(1);
    expect(meterSteps(0.3)).toBe(2);
    expect(meterSteps(0.5)).toBe(3);
    expect(meterSteps(0.69)).toBe(3);
    expect(meterSteps(0.71)).toBe(4);
    expect(meterSteps(1)).toBe(5);
  });

  it('clamps out-of-range energy', () => {
    expect(meterSteps(-3)).toBe(0);
    expect(meterSteps(7)).toBe(5);
  });

  it('non-finite energy gives 0', () => {
    expect(meterSteps(NaN)).toBe(0);
    expect(meterSteps(Infinity)).toBe(0);
  });

  it('honours a custom step count', () => {
    expect(meterSteps(0.5, 10)).toBe(5);
    expect(meterSteps(1, 8)).toBe(8);
  });
});
