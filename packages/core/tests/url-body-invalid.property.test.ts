import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decodeUrlBody, encodeUrlBody } from '../src/url-body.js';
import { NUM_RUNS } from './helpers.js';

// Feature: screech-protocol, Property 6: Invalid URL payloads and bodies are rejected
// **Validates: Requirements 5.5, 5.6, 5.7**

const SCHEME = /^https?:\/\//i;

/** Random-case variant of a lowercase word. */
function caseVariant(word: string): fc.Arbitrary<string> {
  return fc
    .array(fc.boolean(), { minLength: word.length, maxLength: word.length })
    .map((flags) => [...word].map((c, i) => (flags[i] ? c.toUpperCase() : c)).join(''));
}

/** Strings that do not start with http:// or https:// in any letter case. */
const noSchemeArb: fc.Arbitrary<string> = fc.oneof(
  fc.string({ maxLength: 60 }),
  fc.string({ unit: 'binary', maxLength: 60 }),
  // Near misses: scheme-like starts that are still invalid.
  fc.tuple(fc.constantFrom('http', 'https', 'ftp', 'ws', 'file'), fc.string({ maxLength: 30 })).map(
    ([s, rest]) => `${s}:/${rest}`,
  ),
  fc.tuple(fc.string({ minLength: 1, maxLength: 5 }), fc.constantFrom('http://', 'https://'), fc.string({ maxLength: 20 })).map(
    ([lead, s, rest]) => `${lead}${s}${rest}`,
  ),
).filter((s) => !SCHEME.test(s));

/** A scheme in random case with nothing after it. */
const schemeOnlyArb: fc.Arbitrary<string> = fc
  .constantFrom('http', 'https')
  .chain((w) => caseVariant(w))
  .map((w) => `${w}://`);

/** Codes 0x11..0x7F combined with either scheme bit. */
const undefinedCodeByteArb: fc.Arbitrary<number> = fc
  .tuple(fc.integer({ min: 0x11, max: 0x7f }), fc.boolean())
  .map(([code, https]) => (https ? 0x80 : 0) | code);

describe('Property 6: Invalid URL payloads and bodies are rejected', () => {
  it('encodeUrlBody rejects strings without an http(s) scheme', () => {
    fc.assert(
      fc.property(noSchemeArb, (url) => {
        const result = encodeUrlBody(url);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe('invalid-payload');
          if (result.error.code === 'invalid-payload') expect(result.error.field).toBe('url');
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('encodeUrlBody rejects a scheme with nothing after it', () => {
    fc.assert(
      fc.property(schemeOnlyArb, (url) => {
        const result = encodeUrlBody(url);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe('invalid-payload');
          if (result.error.code === 'invalid-payload') expect(result.error.field).toBe('url');
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('decodeUrlBody rejects an empty compressed body', () => {
    const result = decodeUrlBody(true, new Uint8Array(0));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid-body');
  });

  it('decodeUrlBody rejects a compressed body whose code is not in the table', () => {
    fc.assert(
      fc.property(
        undefinedCodeByteArb,
        fc.uint8Array({ minLength: 0, maxLength: 60 }),
        (first, tail) => {
          const body = new Uint8Array(1 + tail.length);
          body[0] = first;
          body.set(tail, 1);
          const result = decodeUrlBody(true, body);
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.error.code).toBe('invalid-body');
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
