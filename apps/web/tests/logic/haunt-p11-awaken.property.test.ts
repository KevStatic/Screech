// Feature: haunting-sounds, Property 11: Awaken has three ordered parts
// **Validates: Requirements 1.9**
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { AWAKEN_LAYOUT, generateAwaken } from '../../src/logic/haunt-synth';
import { dominantFrequency } from './haunt-fft';

const TICK_JITTER_SEC = 0.015;
const MIN_GAP_SEC = 0.02;

const rates = fc.oneof(
  fc.constantFrom(44100, 48000),
  fc.integer({ min: 22050, max: 96000 }),
);
const seeds = fc.integer({ min: -2147483648, max: 2147483647 });

function peakAbs(x: Float32Array, from: number, to: number): number {
  let peak = 0;
  for (let i = from; i < to; i++) peak = Math.max(peak, Math.abs(x[i] as number));
  return peak;
}

describe('Property 11: Awaken has three ordered parts', () => {
  it('has a thunk, then a rising hum, then at least three separated ticks', () => {
    fc.assert(
      fc.property(rates, seeds, (rate, seed) => {
        const { thunk, hum, tickStartsSec, tickDurSec } = AWAKEN_LAYOUT;

        // Order in the layout: thunk, then hum, then ticks.
        expect(thunk.startSec).toBeLessThan(hum.startSec);
        expect(thunk.endSec).toBeLessThanOrEqual(hum.endSec);
        expect(hum.endSec).toBeLessThanOrEqual(tickStartsSec[0] as number);
        expect(tickStartsSec.length).toBeGreaterThanOrEqual(3);

        const x = generateAwaken(rate, seed);

        // Hum glides up: last 100 ms dominant frequency is above the first 100 ms.
        const first = dominantFrequency(x, rate, hum.startSec, hum.startSec + 0.1);
        const last = dominantFrequency(x, rate, hum.endSec - 0.1, hum.endSec);
        expect(last).toBeGreaterThan(first);

        // Ticks: each has energy, and ticks are separated by quiet gaps of >= 20 ms.
        const regions = tickStartsSec.map((s) => ({
          from: Math.floor(s * rate),
          to: Math.min(x.length, Math.ceil((s + TICK_JITTER_SEC + tickDurSec) * rate)),
        }));
        let audible = 0;
        for (let t = 0; t < regions.length; t++) {
          const r = regions[t]!;
          const peak = peakAbs(x, r.from, r.to);
          if (peak <= 0) continue;
          audible++;
          if (t + 1 < regions.length) {
            const nextFrom = regions[t + 1]!.from;
            const gapStart = r.to;
            expect((nextFrom - gapStart) / rate).toBeGreaterThanOrEqual(MIN_GAP_SEC);
            expect(peakAbs(x, gapStart, nextFrom)).toBeLessThan(0.05 * peak);
          }
        }
        expect(audible).toBeGreaterThanOrEqual(3);
      }),
      { numRuns: 100 },
    );
  });
});
