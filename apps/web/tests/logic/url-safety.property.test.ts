import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { isSafeToOpen } from '../../src/logic/url-safety';

/** Randomly upper/lowercases each letter of a base string. */
const caseVariant = (base: string) =>
  fc
    .array(fc.boolean(), { minLength: base.length, maxLength: base.length })
    .map((flags) =>
      [...base].map((c, i) => (flags[i] ? c.toUpperCase() : c.toLowerCase())).join(''),
    );

const safePrefixArb = fc.oneof(caseVariant('http://'), caseVariant('https://'));
const unsafeSchemeArb = fc.constantFrom(
  'javascript:',
  'data:',
  'file:',
  'ftp:',
  'vbscript:',
);
const whitespaceArb = fc.constantFrom(' ', '\t', '\n', '\r', '\u00a0', '\u2003');

describe('url-safety properties', () => {
  /**
   * Feature: spirit-box-app, Property 23: Only http and https links are openable
   * **Validates: Requirements 13.10**
   */
  it('Feature: spirit-box-app, Property 23: Only http and https links are openable', () => {
    // Arbitrary strings: result matches the raw-string regex exactly.
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.fullUnicodeString()), (s) => {
        expect(isSafeToOpen(s)).toBe(/^https?:\/\//i.test(s));
      }),
      { numRuns: 200 },
    );

    // Any http(s):// prefix in any case plus any suffix is safe.
    fc.assert(
      fc.property(safePrefixArb, fc.string(), (prefix, suffix) => {
        expect(isSafeToOpen(prefix + suffix)).toBe(true);
      }),
      { numRuns: 200 },
    );

    // Other schemes are unsafe.
    fc.assert(
      fc.property(unsafeSchemeArb, fc.string(), (scheme, suffix) => {
        expect(isSafeToOpen(scheme + suffix)).toBe(false);
      }),
      { numRuns: 200 },
    );

    // Leading whitespace makes even an http(s) link unsafe (no trimming).
    fc.assert(
      fc.property(
        fc.array(whitespaceArb, { minLength: 1, maxLength: 5 }).map((a) => a.join('')),
        safePrefixArb,
        fc.string(),
        (ws, prefix, suffix) => {
          expect(isSafeToOpen(ws + prefix + suffix)).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });
});
