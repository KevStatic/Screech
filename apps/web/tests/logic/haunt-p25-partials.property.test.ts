// Feature: haunting-sounds, Property 25: No sine partial above the Partial_Limit
// **Validates: Requirements 2.12, 2.13**
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DRONE_PARTIAL_MAX_HZ,
  HARMONIC_MAX_HZ,
  LOOP_BASE_HZ,
  PARTIAL_LIMIT_HZ,
  SOUND_NAMES,
  partialsOf,
} from '../../src/logic/haunt-synth';

const soundName = fc.constantFrom(...SOUND_NAMES);

describe('Property 25: No sine partial above the Partial_Limit', () => {
  it('PARTIAL_LIMIT_HZ is 1400', () => {
    expect(PARTIAL_LIMIT_HZ).toBe(1400);
  });

  it('every partial of every sound is finite, positive and at most PARTIAL_LIMIT_HZ', () => {
    fc.assert(
      fc.property(soundName, (name) => {
        for (const f of partialsOf(name)) {
          expect(Number.isFinite(f)).toBe(true);
          expect(f).toBeGreaterThan(0);
          expect(f).toBeLessThanOrEqual(PARTIAL_LIMIT_HZ);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('drone partials are at most DRONE_PARTIAL_MAX_HZ and multiples of LOOP_BASE_HZ', () => {
    fc.assert(
      fc.property(fc.constant('drone' as const), (name) => {
        const partials = partialsOf(name);
        expect(partials.length).toBeGreaterThan(0);
        for (const f of partials) {
          expect(f).toBeLessThanOrEqual(DRONE_PARTIAL_MAX_HZ);
          const ratio = f / LOOP_BASE_HZ;
          expect(Math.abs(ratio - Math.round(ratio))).toBeLessThan(1e-9);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('awaken and sealed-thud partials are at most HARMONIC_MAX_HZ', () => {
    fc.assert(
      fc.property(fc.constantFrom('awaken' as const, 'sealed-thud' as const), (name) => {
        const partials = partialsOf(name);
        expect(partials.length).toBeGreaterThan(0);
        for (const f of partials) expect(f).toBeLessThanOrEqual(HARMONIC_MAX_HZ);
      }),
      { numRuns: 100 },
    );
  });
});
