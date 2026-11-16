import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  STEP_GUARD,
  assertSampleRate,
  createPrng,
  finishLoop,
  finishSound,
  hannRise,
  highpass4,
  lowpass8,
  runCascade,
} from '../../src/logic/haunt-dsp';

const NUM_RUNS = 50;
const RATES = [22050, 32000, 44100, 48000, 96000] as const;
const rateArb = fc.constantFrom(...RATES);

function noise(n: number, seed: number): Float64Array {
  const p = createPrng(seed);
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = p.next() * 2 - 1;
  return x;
}

function peakOf(x: Float32Array): number {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  return m;
}

function maxStep(x: Float32Array): number {
  let m = 0;
  for (let i = 1; i < x.length; i++) m = Math.max(m, Math.abs((x[i] as number) - (x[i - 1] as number)));
  return m;
}

function rms(x: Float64Array): number {
  let s = 0;
  for (const v of x) s += v * v;
  return Math.sqrt(s / x.length);
}

function sine(freq: number, rate: number, n: number): Float64Array {
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = Math.sin((2 * Math.PI * freq * i) / rate);
  return x;
}

describe('createPrng', () => {
  it('gives the same sequence for the same seed and values in [0, 1)', () => {
    const a = createPrng(42);
    const b = createPrng(42);
    for (let i = 0; i < 100; i++) {
      const v = a.next();
      expect(v).toBe(b.next());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('treats seeds as unsigned 32-bit values', () => {
    expect(createPrng(-1).next()).toBe(createPrng(0xffffffff).next());
    expect(createPrng(2 ** 32 + 5).next()).toBe(createPrng(5).next());
  });

  it('throws a RangeError naming the value for a non-integer seed', () => {
    expect(() => createPrng(1.5)).toThrow(RangeError);
    expect(() => createPrng(1.5)).toThrow('1.5');
    expect(() => createPrng(NaN)).toThrow('NaN');
    expect(() => createPrng(Infinity)).toThrow('Infinity');
  });

  it('property: deterministic and in range for any integer seed', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const a = createPrng(seed);
        const b = createPrng(seed);
        for (let i = 0; i < 20; i++) {
          const v = a.next();
          if (v !== b.next() || v < 0 || v >= 1) return false;
        }
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('assertSampleRate', () => {
  it('accepts the bounds and common rates', () => {
    for (const r of [22050, 96000, ...RATES]) expect(() => assertSampleRate(r)).not.toThrow();
  });

  it('throws the exact message for bad values', () => {
    for (const bad of [NaN, Infinity, -Infinity, 0, -44, 22049, 96001, 30000.5]) {
      expect(() => assertSampleRate(bad)).toThrow(RangeError);
      expect(() => assertSampleRate(bad)).toThrow(
        `Sample rate ${String(bad)} is outside the supported range 22050 to 96000 Hz (whole numbers only)`,
      );
    }
  });

  it('property: throws exactly when the value is not a whole number in range', () => {
    fc.assert(
      fc.property(fc.oneof(fc.double({ noDefaultInfinity: false }), fc.integer({ min: 0, max: 120000 })), (r) => {
        const valid = Number.isInteger(r) && r >= 22050 && r <= 96000;
        let threw = false;
        try {
          assertSampleRate(r);
        } catch (e) {
          threw = e instanceof RangeError;
        }
        return threw === !valid;
      }),
      { numRuns: 200 },
    );
  });
});

describe('filters', () => {
  it('have four and two sections', () => {
    expect(lowpass8(800, 22050).sections).toHaveLength(4);
    expect(highpass4(300, 22050).sections).toHaveLength(2);
  });

  it('reject a bad corner or rate', () => {
    expect(() => lowpass8(0, 22050)).toThrow(RangeError);
    expect(() => lowpass8(11025, 22050)).toThrow(RangeError);
    expect(() => highpass4(300, 100)).toThrow(RangeError);
  });

  it('lowpass8 passes a tone below the corner and cuts one above', () => {
    const rate = 22050;
    const n = 8192;
    const low = rms(runCascade(lowpass8(800, rate), sine(200, rate, n)).subarray(2000));
    const high = rms(runCascade(lowpass8(800, rate), sine(2400, rate, n)).subarray(2000));
    expect(low).toBeGreaterThan(0.69);
    expect(high).toBeLessThan(0.001);
  });

  it('highpass4 cuts a tone below the corner and passes one above', () => {
    const rate = 22050;
    const n = 8192;
    const low = rms(runCascade(highpass4(400, rate), sine(60, rate, n)).subarray(2000));
    const high = rms(runCascade(highpass4(400, rate), sine(2000, rate, n)).subarray(2000));
    expect(low).toBeLessThan(0.01);
    expect(high).toBeGreaterThan(0.69);
  });

  it('runCascade does not modify its input and is repeatable', () => {
    const x = noise(500, 3);
    const copy = Float64Array.from(x);
    const c = lowpass8(700, 22050);
    const a = runCascade(c, x);
    expect(x).toEqual(copy);
    expect(runCascade(c, x)).toEqual(a);
    expect(a).toBeInstanceOf(Float64Array);
  });

  it('property: output is finite and the same length at every rate', () => {
    fc.assert(
      fc.property(rateArb, fc.integer({ min: 200, max: 400 }), fc.integer(), (rate, corner, seed) => {
        const x = noise(2000, seed);
        const lp = runCascade(lowpass8(corner * 2, rate), x);
        const hp = runCascade(highpass4(corner, rate), lp);
        return hp.length === x.length && hp.every(Number.isFinite);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('hannRise', () => {
  it('is 0 at the start, 1 at the end and 0.5 in the middle', () => {
    expect(hannRise(100, 0)).toBe(0);
    expect(hannRise(100, 100)).toBe(1);
    expect(hannRise(100, 50)).toBeCloseTo(0.5, 12);
  });

  it('property: stays in [0, 1] and never falls as i grows', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5000 }), (n) => {
        let prev = hannRise(n, 0);
        if (prev !== 0 || hannRise(n, n) !== 1) return false;
        for (let i = 1; i <= n; i++) {
          const v = hannRise(n, i);
          if (v < prev || v > 1) return false;
          prev = v;
        }
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('finishSound', () => {
  const opts = { peak: 0.15, attackMs: 45, releaseMs: 60 };

  it('zeroes both edges, hits the peak and returns a Float32Array', () => {
    const rate = 22050;
    const out = finishSound(sine(300, rate, rate / 2), rate, opts);
    expect(out).toBeInstanceOf(Float32Array);
    expect(out[0]).toBe(0);
    expect(out[out.length - 1]).toBe(0);
    expect(peakOf(out)).toBeLessThanOrEqual(opts.peak + 1e-6);
    expect(peakOf(out)).toBeGreaterThan(opts.peak * 0.5);
  });

  it('keeps a peak of 0.19 at or below 0.2 after the Float32 conversion', () => {
    const out = finishSound(noise(10000, 5), 22050, { peak: 0.19, attackMs: 40, releaseMs: 40 });
    expect(peakOf(out)).toBeLessThanOrEqual(0.2);
  });

  it('applies the step guard to a loud, high-frequency tone', () => {
    const rate = 22050;
    const raw = sine(5000, rate, rate);
    const out = finishSound(raw, rate, { peak: 0.19, attackMs: 40, releaseMs: 40 });
    expect(maxStep(out)).toBeLessThanOrEqual(STEP_GUARD + 1e-6);
  });

  it('slows a sound that would jump to full level at once', () => {
    const rate = 22050;
    const raw = new Float64Array(rate);
    raw.fill(1);
    raw[0] = 0;
    const out = finishSound(raw, rate, { peak: 0.15, attackMs: 40, releaseMs: 40 });
    const early = Math.floor(0.035 * rate);
    let first = -1;
    for (let i = 0; i < out.length; i++) {
      if (Math.abs(out[i] as number) >= 0.9 * peakOf(out)) {
        first = i;
        break;
      }
    }
    expect(first).toBeGreaterThanOrEqual(early);
  });

  it('enforces a 40 ms minimum envelope', () => {
    const rate = 22050;
    const raw = new Float64Array(rate);
    raw.fill(1);
    const out = finishSound(raw, rate, { peak: 0.1, attackMs: 1, releaseMs: 1 });
    const at20ms = Math.abs(out[Math.floor(0.02 * rate)] as number);
    expect(at20ms).toBeLessThan(0.1 * 0.6);
  });

  it('does not change its input', () => {
    const raw = noise(3000, 9);
    const copy = Float64Array.from(raw);
    finishSound(raw, 22050, opts);
    expect(raw).toEqual(copy);
  });

  it('throws for NaN or Infinity in the raw data', () => {
    const bad = noise(1000, 2);
    bad[500] = NaN;
    expect(() => finishSound(bad, 22050, opts)).toThrow(RangeError);
    bad[500] = Infinity;
    expect(() => finishSound(bad, 22050, opts)).toThrow(RangeError);
  });

  it('throws for a bad sample rate and a bad peak', () => {
    expect(() => finishSound(noise(100, 1), 1000, opts)).toThrow('Sample rate 1000');
    expect(() => finishSound(noise(100, 1), 22050, { ...opts, peak: 0 })).toThrow(RangeError);
  });

  it('handles all-zero and empty input without producing NaN', () => {
    expect(finishSound(new Float64Array(2000), 22050, opts).every((v) => v === 0)).toBe(true);
    expect(finishSound(new Float64Array(0), 22050, opts)).toHaveLength(0);
  });

  it('property: edges are 0, peak <= table peak, step <= STEP_GUARD, all finite', () => {
    fc.assert(
      fc.property(
        rateArb,
        fc.integer(),
        fc.double({ min: 0.02, max: 0.19, noNaN: true }),
        fc.integer({ min: 40, max: 400 }),
        fc.integer({ min: 40, max: 400 }),
        fc.double({ min: 0.1, max: 0.6, noNaN: true }),
        (rate, seed, peak, attackMs, releaseMs, seconds) => {
          const raw = noise(Math.round(rate * seconds), seed);
          const out = finishSound(raw, rate, { peak, attackMs, releaseMs });
          return (
            out.length === raw.length &&
            out[0] === 0 &&
            out[out.length - 1] === 0 &&
            peakOf(out) <= peak + 1e-6 &&
            peakOf(out) <= 0.2 &&
            maxStep(out) <= STEP_GUARD + 1e-6 &&
            out.every(Number.isFinite)
          );
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('property: first sample at 90 percent of the peak is never before 35 ms', () => {
    fc.assert(
      fc.property(rateArb, fc.integer(), fc.double({ min: 0.05, max: 0.19, noNaN: true }), (rate, seed, peak) => {
        const raw = noise(Math.round(rate * 0.4), seed);
        const out = finishSound(raw, rate, { peak, attackMs: 40, releaseMs: 60 });
        const pk = peakOf(out);
        const idx = out.findIndex((v) => Math.abs(v) >= 0.9 * pk);
        return idx >= Math.floor(0.035 * rate);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('finishLoop', () => {
  it('scales to the peak, zeroes both edges and does not apply envelopes', () => {
    const rate = 22050;
    const raw = sine(220, rate, 4 * rate + 1);
    raw[0] = 0.5;
    raw[raw.length - 1] = -0.5;
    const out = finishLoop(raw, rate, 0.085);
    expect(out[0]).toBe(0);
    expect(out[out.length - 1]).toBe(0);
    expect(peakOf(out)).toBeCloseTo(0.085, 5);
    // A Hann envelope would make the middle quieter than the first 40 ms.
    expect(peakOf(out.subarray(0, Math.floor(0.04 * rate)))).toBeGreaterThan(0.05);
  });

  it('throws for non-finite data', () => {
    const raw = new Float64Array(100);
    raw[3] = NaN;
    expect(() => finishLoop(raw, 22050, 0.1)).toThrow(RangeError);
  });

  it('property: edges 0, peak <= requested, step <= STEP_GUARD', () => {
    fc.assert(
      fc.property(
        rateArb,
        fc.integer({ min: 100, max: 4000 }),
        fc.double({ min: 0.02, max: 0.19, noNaN: true }),
        (rate, freq, peak) => {
          const out = finishLoop(sine(freq, rate, rate), rate, peak);
          return (
            out[0] === 0 &&
            out[out.length - 1] === 0 &&
            peakOf(out) <= peak + 1e-6 &&
            maxStep(out) <= STEP_GUARD + 1e-6 &&
            out.every(Number.isFinite)
          );
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
