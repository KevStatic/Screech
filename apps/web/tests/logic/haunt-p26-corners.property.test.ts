// Feature: haunting-sounds, Property 26: Filter corners keep noise in the Phone_Band and under the ceiling
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  FILTER_CORNERS,
  HAUNT_CEILING_HZ,
  OUT_OF_BAND_LIMIT,
  PHONE_BAND_LOW_HZ,
  SOUND_NAMES,
  SYNTH_CORNER_MAX_HZ,
  type FilterCorners,
  type SoundName,
} from '../../src/logic/haunt-synth';

const INTEGRATION_MAX_HZ = 48000;
const STEP_HZ = 1;

/** Power response of an 8th-order Butterworth low-pass and 4th-order high-pass in series. */
function power(f: number, c: FilterCorners): number {
  let p = 1;
  if (c.lowpass8 !== null) p *= 1 / (1 + Math.pow(f / c.lowpass8, 16));
  if (c.highpass4 !== null) p *= 1 / (1 + Math.pow(c.highpass4 / f, 8));
  return p;
}

/** Share of white-noise output power above the ceiling (midpoint rule, 1 Hz steps). */
function shareAboveCeiling(c: FilterCorners): number {
  let total = 0;
  let above = 0;
  for (let f = STEP_HZ / 2; f < INTEGRATION_MAX_HZ; f += STEP_HZ) {
    const p = power(f, c);
    total += p;
    if (f > HAUNT_CEILING_HZ) above += p;
  }
  return total === 0 ? 0 : above / total;
}

const noisy = SOUND_NAMES.flatMap((name) =>
  FILTER_CORNERS[name].map((corners, index) => ({ name, index, corners })),
);

const entryArb = fc.constantFrom(...noisy);
const soundArb = fc.constantFrom<SoundName>(...SOUND_NAMES);

describe('Property 26: filter corners keep noise in the Phone_Band and under the ceiling', () => {
  it('has at least one noise component to check', () => {
    expect(noisy.length).toBeGreaterThan(0);
  });

  it('every corner of every sound is inside the Phone_Band limits', () => {
    fc.assert(
      fc.property(soundArb, (name) => {
        for (const c of FILTER_CORNERS[name]) {
          if (c.lowpass8 === null) return false;
          if (c.lowpass8 > SYNTH_CORNER_MAX_HZ) return false;
          if (c.highpass4 !== null) {
            if (c.highpass4 < PHONE_BAND_LOW_HZ) return false;
            if (c.highpass4 >= c.lowpass8) return false;
          }
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });

  it('the analytic power response puts at most OUT_OF_BAND_LIMIT above the ceiling', () => {
    fc.assert(
      fc.property(entryArb, ({ corners }) => {
        expect(shareAboveCeiling(corners)).toBeLessThanOrEqual(OUT_OF_BAND_LIMIT);
      }),
      { numRuns: 100 },
    );
  });
});
