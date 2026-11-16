import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { attackTimeMs, checkSound, maxStep, peakOf } from '../../src/logic/haunt-check';
import { SOUND_NAMES, generateSound } from '../../src/logic/haunt-synth';

const RATE = 22050;

/** A clean ramp up and down: zero edges, slow attack, small steps. */
function goodArray(peak: number, rate: number = RATE): Float32Array {
  const n = Math.round(rate * 0.5);
  const out = new Float32Array(n);
  const rise = Math.round(rate * 0.1);
  for (let i = 0; i < n; i++) {
    const up = Math.min(1, i / rise);
    const down = Math.min(1, (n - 1 - i) / rise);
    out[i] = peak * Math.min(up, down);
  }
  return out;
}

describe('helpers', () => {
  it('peakOf finds the largest magnitude', () => {
    expect(peakOf(Float32Array.from([0, -0.5, 0.25, 0]))).toBe(0.5);
    expect(peakOf(new Float32Array(0))).toBe(0);
  });

  it('maxStep finds the largest jump', () => {
    expect(maxStep(Float32Array.from([0, 0.25, 0.125, -0.25]))).toBe(0.375);
    expect(maxStep(Float32Array.from([0.5]))).toBe(0);
  });

  it('attackTimeMs reports the time of the first sample at 90 percent of the peak', () => {
    const s = new Float32Array(1000);
    s[100] = 0.5;
    s[500] = 1;
    expect(attackTimeMs(s, 1000)).toBe(500);
    s[200] = 0.95;
    expect(attackTimeMs(s, 1000)).toBe(200);
    expect(attackTimeMs(new Float32Array(10), 1000)).toBe(0);
  });

  it('property: peak is at least every sample and attack is inside the array', () => {
    fc.assert(
      fc.property(
        fc.array(fc.float({ min: -1, max: 1, noNaN: true }), { minLength: 1, maxLength: 200 }),
        (xs) => {
          const s = Float32Array.from(xs);
          const p = peakOf(s);
          expect(xs.every((v) => Math.abs(Math.fround(v)) <= p)).toBe(true);
          const a = attackTimeMs(s, 1000);
          expect(a).toBeGreaterThanOrEqual(0);
          expect(a).toBeLessThan(s.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('checkSound on generated sounds', () => {
  for (const name of SOUND_NAMES) {
    it(`${name} passes at 22050 and 44100 Hz`, () => {
      for (const rate of [22050, 44100]) {
        const r = checkSound(name, generateSound(name, rate, 7), rate);
        expect(r.problems).toEqual([]);
        expect(r.ok).toBe(true);
      }
    });
  }
});

describe('checkSound on bad arrays', () => {
  it('accepts the hand-built good array', () => {
    expect(checkSound('card-flip', goodArray(0.1), RATE).ok).toBe(true);
  });

  it('rejects a nonzero first sample', () => {
    const s = goodArray(0.1);
    s[0] = 0.01;
    const r = checkSound('card-flip', s, RATE);
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.startsWith('first sample is'))).toBe(true);
  });

  it('rejects a nonzero last sample', () => {
    const s = goodArray(0.1);
    s[s.length - 1] = -0.01;
    const r = checkSound('card-flip', s, RATE);
    expect(r.problems.some((p) => p.startsWith('last sample is'))).toBe(true);
  });

  it('rejects a peak above the global limit', () => {
    const r = checkSound('awaken', goodArray(0.3), RATE);
    expect(r.ok).toBe(false);
    expect(r.problems).toContain('peak 0.3 is above 0.2');
  });

  it('rejects a peak above the per-sound limit but under the global one', () => {
    const r = checkSound('whisper', goodArray(0.15), RATE);
    expect(r.ok).toBe(false);
    expect(r.problems).toEqual(['peak 0.15 is above the whisper limit 0.1']);
  });

  it('rejects a short attack', () => {
    const n = RATE / 2;
    const s = new Float32Array(n);
    s.fill(0.05);
    s[0] = 0;
    s[n - 1] = 0;
    s[1] = 0.025;
    const r = checkSound('card-flip', s, RATE);
    expect(r.problems.some((p) => p.includes('is shorter than 30 ms'))).toBe(true);
  });

  it('rejects a large step', () => {
    const s = goodArray(0.1);
    const mid = s.length >> 1;
    s[mid] = 0;
    s[mid + 1] = 0.1;
    const r = checkSound('card-flip', s, RATE);
    expect(r.problems.some((p) => p.endsWith('is above 0.05') && p.startsWith('step'))).toBe(true);
  });

  it('rejects a drone sample at or above 0.1 even when the spec peak allows it', () => {
    const r = checkSound('drone', goodArray(0.12), RATE);
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.startsWith('drone sample'))).toBe(true);
  });

  it('rejects empty, silent and non-finite input', () => {
    expect(checkSound('card-flip', new Float32Array(0), RATE).problems).toContain('sound has no samples');
    expect(checkSound('card-flip', new Float32Array(100), RATE).problems).toContain('sound is silent');
    const s = goodArray(0.1);
    s[100] = Number.NaN;
    expect(checkSound('card-flip', s, RATE).problems.some((p) => p.includes('not a finite number'))).toBe(true);
  });

  it('reports the measured values', () => {
    const r = checkSound('card-flip', goodArray(0.1), RATE);
    expect(r.peak).toBeCloseTo(0.1, 6);
    expect(r.attackMs).toBeGreaterThanOrEqual(30);
    expect(r.maxStep).toBeLessThanOrEqual(0.05);
  });
});
