// Feature: haunting-sounds, Property 28: Buffer cache keys are unique per sound, rate and seed
// **Validates: Requirements 6.6, 8.5**
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { bufferKey } from '../../src/logic/haunt-rules';
import { SOUND_NAMES } from '../../src/logic/haunt-synth';

const triple = fc.record({
  name: fc.constantFrom(...SOUND_NAMES),
  rate: fc.integer({ min: 22050, max: 96000 }),
  seed: fc.integer({ min: 0, max: 4294967295 }),
});

const NUM_RUNS = 200;

describe('Property 28: bufferKey', () => {
  it('is deterministic', () => {
    fc.assert(
      fc.property(triple, (t) => {
        expect(bufferKey(t.name, t.rate, t.seed)).toBe(bufferKey(t.name, t.rate, t.seed));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('keys are equal iff name, rate and seed are all equal', () => {
    fc.assert(
      fc.property(triple, triple, (a, b) => {
        const same = a.name === b.name && a.rate === b.rate && a.seed === b.seed;
        expect(bufferKey(a.name, a.rate, a.seed) === bufferKey(b.name, b.rate, b.seed)).toBe(same);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('varying a single component changes the key', () => {
    fc.assert(
      fc.property(triple, triple, (a, b) => {
        const base = bufferKey(a.name, a.rate, a.seed);
        if (a.name !== b.name) expect(bufferKey(b.name, a.rate, a.seed)).not.toBe(base);
        if (a.rate !== b.rate) expect(bufferKey(a.name, b.rate, a.seed)).not.toBe(base);
        if (a.seed !== b.seed) expect(bufferKey(a.name, a.rate, b.seed)).not.toBe(base);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('contains the name, rate and seed', () => {
    fc.assert(
      fc.property(triple, (t) => {
        const key = bufferKey(t.name, t.rate, t.seed);
        expect(key).toContain(t.name);
        expect(key).toContain(String(t.rate));
        expect(key).toContain(String(t.seed));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('has no collisions across a generated set of distinct triples', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(triple, {
          minLength: 1,
          maxLength: 60,
          selector: (t) => `${t.name}|${t.rate}|${t.seed}`,
        }),
        (triples) => {
          const keys = new Set(triples.map((t) => bufferKey(t.name, t.rate, t.seed)));
          expect(keys.size).toBe(triples.length);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
