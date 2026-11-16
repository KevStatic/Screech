// Feature: haunting-sounds, Property 20: Scrape seed depends only on the letter index
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { scrapeSeed, generatePlanchetteScrape } from '../../src/logic/haunt-synth';

const RATES = [44100, 48000] as const;

function sameSamples(a: Float32Array, b: Float32Array): boolean {
  if (a.length !== b.length) return false;
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return false;
  return true;
}

describe('Property 20: scrape seed depends only on the letter index', () => {
  /** **Validates: Requirements 8.5** */
  it('is deterministic and an unsigned 32-bit integer', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1000 }), (i) => {
        const s = scrapeSeed(i);
        expect(scrapeSeed(i)).toBe(s);
        expect(Number.isInteger(s)).toBe(true);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(0xffffffff);
      }),
      { numRuns: 200 },
    );
  });

  it('differs for distinct indexes', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 0, max: 1000 }),
        (i, j) => {
          fc.pre(i !== j);
          expect(scrapeSeed(i)).not.toBe(scrapeSeed(j));
        },
      ),
      { numRuns: 200 },
    );
  });

  it('is unique across indexes 0..99', () => {
    const seeds = new Set<number>();
    for (let i = 0; i < 100; i++) seeds.add(scrapeSeed(i));
    expect(seeds.size).toBe(100);
  });

  it('gives bit-identical scrape audio for the same index and rate', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 29 }),
        fc.constantFrom(...RATES),
        (i, rate) => {
          const a = generatePlanchetteScrape(rate, scrapeSeed(i));
          const b = generatePlanchetteScrape(rate, scrapeSeed(i));
          expect(sameSamples(a, b)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('gives different scrape audio for different indexes at the same rate', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 29 }),
        fc.integer({ min: 0, max: 29 }),
        fc.constantFrom(...RATES),
        (i, j, rate) => {
          fc.pre(i !== j);
          const a = generatePlanchetteScrape(rate, scrapeSeed(i));
          const b = generatePlanchetteScrape(rate, scrapeSeed(j));
          expect(sameSamples(a, b)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
