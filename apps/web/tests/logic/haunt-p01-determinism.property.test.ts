// Feature: haunting-sounds, Property 1: Determinism
// **Validates: Requirements 1.4**

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  MAX_SAMPLE_RATE,
  MIN_SAMPLE_RATE,
  SOUND_NAMES,
  generateSound,
} from '../../src/logic/haunt-synth';

const NUM_RUNS = 100;

const soundArb = fc.constantFrom(...SOUND_NAMES);
const sampleRateArb = fc.integer({ min: MIN_SAMPLE_RATE, max: MAX_SAMPLE_RATE });
// Any integer seed: negative, int32 and uint32 values.
const seedArb = fc.integer({ min: -(2 ** 31), max: 2 ** 32 - 1 });

function bits(a: Float32Array): Uint32Array {
  return new Uint32Array(a.buffer, a.byteOffset, a.length);
}

describe('Property 1: Determinism', () => {
  it('same name, rate and seed give identical length and bit-identical samples', () => {
    fc.assert(
      fc.property(soundArb, sampleRateArb, seedArb, (name, rate, seed) => {
        const a = generateSound(name, rate, seed);
        const b = generateSound(name, rate, seed);
        expect(b.length).toBe(a.length);
        const ba = bits(a);
        const bb = bits(b);
        for (let i = 0; i < ba.length; i++) {
          if (ba[i] !== bb[i]) {
            throw new Error(`${name} @ ${rate} Hz, seed ${seed}: sample ${i} differs`);
          }
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
