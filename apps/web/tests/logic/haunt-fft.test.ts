import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  bandShare,
  cachedSpectrum,
  clearSpectrumCache,
  dominantFrequency,
  fftInPlace,
  nextPowerOfTwo,
  outOfBandRatio,
  peakBandShare,
  powerSpectrum,
  spectrumKey,
} from './haunt-fft';

function tones(
  parts: ReadonlyArray<readonly [number, number]>,
  rate: number,
  seconds: number,
): Float64Array {
  const out = new Float64Array(Math.floor(rate * seconds));
  for (let i = 0; i < out.length; i++) {
    let v = 0;
    for (const [f, a] of parts) v += a * Math.sin((2 * Math.PI * f * i) / rate);
    out[i] = v;
  }
  return out;
}

describe('haunt-fft', () => {
  it('zero-pads to a power of two', () => {
    expect(nextPowerOfTwo(1000)).toBe(1024);
    expect(nextPowerOfTwo(1024)).toBe(1024);
    const s = powerSpectrum(new Float64Array(3000), 48000);
    expect(s.size).toBe(4096);
    expect(s.power.length).toBe(2049);
  });

  it('rejects non power-of-two FFT lengths', () => {
    expect(() => fftInPlace(new Float64Array(6), new Float64Array(6))).toThrow(RangeError);
  });

  it('finds a pure sine within one bin', () => {
    for (const rate of [44100, 48000]) {
      const x = tones([[1000, 0.5]], rate, 0.5);
      const bin = powerSpectrum(x, rate).binHz;
      expect(Math.abs(dominantFrequency(x, rate, 0, 0.5) - 1000)).toBeLessThanOrEqual(bin);
    }
  });

  it('puts a sine almost entirely in its band and on the right side of the ceiling', () => {
    const rate = 48000;
    const x = tones([[1000, 0.5]], rate, 0.5);
    expect(bandShare(x, rate, 950, 1050)).toBeGreaterThan(0.99);
    expect(outOfBandRatio(x, rate, 2000)).toBeLessThan(0.001);
    expect(outOfBandRatio(x, rate, 500)).toBeGreaterThan(0.99);
    expect(peakBandShare(x, rate, 10)).toBeGreaterThan(0.9);
  });

  it('splits power between two tones', () => {
    const rate = 48000;
    const x = tones([[500, 1], [3000, 0.5]], rate, 0.5); // power ratio 4:1
    const low = bandShare(x, rate, 450, 550);
    const high = bandShare(x, rate, 2950, 3050);
    expect(low).toBeCloseTo(0.8, 1);
    expect(high).toBeCloseTo(0.2, 1);
    expect(low + high).toBeGreaterThan(0.99);
    expect(outOfBandRatio(x, rate, 1000)).toBeCloseTo(0.2, 1);
  });

  it('dominantFrequency follows the time slice', () => {
    const rate = 48000;
    const a = tones([[800, 0.5]], rate, 0.25);
    const b = tones([[2400, 0.5]], rate, 0.25);
    const x = new Float64Array(a.length + b.length);
    x.set(a, 0);
    x.set(b, a.length);
    expect(Math.abs(dominantFrequency(x, rate, 0, 0.25) - 800)).toBeLessThan(10);
    expect(Math.abs(dominantFrequency(x, rate, 0.25, 0.5) - 2400)).toBeLessThan(10);
  });

  it('returns 0 shares for silence', () => {
    const z = new Float64Array(2048);
    expect(bandShare(z, 48000, 0, 24000)).toBe(0);
    expect(outOfBandRatio(z, 48000, 100)).toBe(0);
    expect(peakBandShare(z, 48000)).toBe(0);
  });

  it('satisfies Parseval: sum|X|^2 over all bins = N * sum (w x)^2', () => {
    const n = 1024;
    const x = new Float64Array(n);
    for (let i = 0; i < n; i++) x[i] = Math.sin(i * 0.37) + 0.3 * Math.cos(i * 1.9);
    const s = powerSpectrum(x, 48000);
    let freq = s.power[0] as number;
    for (let k = 1; k < n / 2; k++) freq += 2 * (s.power[k] as number);
    freq += s.power[n / 2] as number;
    let time = 0;
    for (let i = 0; i < n; i++) {
      const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
      time += (x[i] as number) * w * ((x[i] as number) * w);
    }
    expect(freq / (n * time)).toBeCloseTo(1, 9);
  });

  it('cache returns the same object and computes once', () => {
    clearSpectrumCache();
    let calls = 0;
    const key = spectrumKey('rain', 48000, 7);
    const make = () => {
      calls++;
      return powerSpectrum(new Float64Array(64), 48000);
    };
    const a = cachedSpectrum(key, make);
    const b = cachedSpectrum(key, make);
    expect(b).toBe(a);
    expect(calls).toBe(1);
    expect(cachedSpectrum(spectrumKey('rain', 44100, 7), make)).not.toBe(a);
    expect(calls).toBe(2);
  });
});

describe('haunt-fft properties', () => {
  it('shares stay within [0, 1] and full-range band share is 1 for non-silent input', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: -1, max: 1, noNaN: true }), { minLength: 8, maxLength: 600 }),
        fc.constantFrom(44100, 48000),
        (arr, rate) => {
          fc.pre(arr.some((v) => Math.abs(v) > 1e-3));
          const oob = outOfBandRatio(arr, rate, 3000);
          const full = bandShare(arr, rate, 0, rate / 2);
          const peak = peakBandShare(arr, rate, 10);
          expect(oob).toBeGreaterThanOrEqual(0);
          expect(oob).toBeLessThanOrEqual(1 + 1e-9);
          expect(peak).toBeLessThanOrEqual(1);
          expect(full).toBeCloseTo(1, 9);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('a sine is located within one bin and band shares are complementary', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 300, max: 8000 }),
        fc.constantFrom(44100, 48000),
        (freq, rate) => {
          const x = tones([[freq, 0.4]], rate, 0.25);
          const bin = powerSpectrum(x, rate).binHz;
          expect(Math.abs(dominantFrequency(x, rate, 0, 0.25) - freq)).toBeLessThanOrEqual(bin);
          const below = 1 - outOfBandRatio(x, rate, freq + 200);
          expect(below).toBeGreaterThan(0.98);
          expect(outOfBandRatio(x, rate, freq - 200)).toBeGreaterThan(0.98);
        },
      ),
      { numRuns: 30 },
    );
  });
});
