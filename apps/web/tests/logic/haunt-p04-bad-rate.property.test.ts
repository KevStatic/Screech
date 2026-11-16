// Feature: haunting-sounds, Property 4: Bad sample rates are rejected
// **Validates: Requirements 1.8, 4.3**
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  MAX_SAMPLE_RATE,
  MIN_SAMPLE_RATE,
  SOUND_NAMES,
  generateAwaken,
  generateBrokenCrackle,
  generateCandleCrackle,
  generateCardFlip,
  generateDrone,
  generatePlanchetteScrape,
  generateSealedThud,
  generateSound,
  generateWhisper,
} from '../../src/logic/haunt-synth';

const SEEDED: ReadonlyArray<(rate: number, seed: number) => Float32Array> = [
  generateAwaken,
  generateCardFlip,
  generateCandleCrackle,
  generatePlanchetteScrape,
  generateWhisper,
  generateBrokenCrackle,
  generateSealedThud,
];

const badRate: fc.Arbitrary<number> = fc.oneof(
  fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -0),
  fc.double({ noNaN: true, noDefaultInfinity: true }).filter((x) => !Number.isInteger(x)),
  fc.integer({ min: -1_000_000, max: 0 }),
  fc.integer({ min: 1, max: MIN_SAMPLE_RATE - 1 }),
  fc.integer({ min: MAX_SAMPLE_RATE + 1, max: 10_000_000 }),
  fc.double({ min: MIN_SAMPLE_RATE, max: MAX_SAMPLE_RATE, noNaN: true }).filter((x) => !Number.isInteger(x)),
);

function expectRejected(call: () => unknown, rate: number): void {
  let caught: unknown;
  try {
    call();
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(RangeError);
  const message = (caught as RangeError).message;
  expect(message).toContain(String(rate));
  expect(message).toContain(String(MIN_SAMPLE_RATE));
  expect(message).toContain(String(MAX_SAMPLE_RATE));
}

describe('Property 4: Bad sample rates are rejected', () => {
  it('every generator throws RangeError naming the value and the range', () => {
    fc.assert(
      fc.property(badRate, fc.integer({ min: 0, max: 0xffffffff }), (rate, seed) => {
        expectRejected(() => generateDrone(rate), rate);
        for (const gen of SEEDED) expectRejected(() => gen(rate, seed), rate);
        for (const name of SOUND_NAMES) expectRejected(() => generateSound(name, rate, seed), rate);
      }),
      { numRuns: 200 },
    );
  });
});
