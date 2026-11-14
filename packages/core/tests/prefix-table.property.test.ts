import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PREFIX_TABLE, compressUrl, expandUrl } from '../src/prefix-table.js';
import { NUM_RUNS } from './helpers.js';

// Feature: screech-protocol, Property 5: Prefix_Table is a bijection
// **Validates: Requirements 5.8**
describe('Property 5: Prefix_Table is a bijection', () => {
  const entryArb = fc.constantFrom(...PREFIX_TABLE);

  it('expandUrl(code) returns the entry prefix', () => {
    fc.assert(
      fc.property(entryArb, (entry) => {
        expect(expandUrl(entry.code)).toBe(entry.prefix);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('compressUrl on a string starting with a prefix selects a code whose prefix is at least as long', () => {
    fc.assert(
      fc.property(entryArb, fc.string({ maxLength: 40 }), (entry, tail) => {
        const input = entry.prefix + tail;
        const { code, remainder } = compressUrl(input);
        const chosen = expandUrl(code);
        expect(chosen).toBeDefined();
        expect((chosen as string).length).toBeGreaterThanOrEqual(entry.prefix.length);
        expect(input.startsWith(chosen as string)).toBe(true);
        expect((chosen as string) + remainder).toBe(input);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('all codes are distinct and all prefixes are distinct', () => {
    expect(new Set(PREFIX_TABLE.map((e) => e.code)).size).toBe(PREFIX_TABLE.length);
    expect(new Set(PREFIX_TABLE.map((e) => e.prefix)).size).toBe(PREFIX_TABLE.length);
  });

  it('any two distinct entries map to different prefixes and codes', () => {
    fc.assert(
      fc.property(entryArb, entryArb, (a, b) => {
        if (a.code === b.code) expect(a.prefix).toBe(b.prefix);
        if (a.prefix === b.prefix) expect(a.code).toBe(b.code);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
