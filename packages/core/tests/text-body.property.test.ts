import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decodeTextBody, encodeTextBody } from '../src/text-body.js';
import { NUM_RUNS } from './helpers.js';

// Feature: screech-protocol, Property 10: Text-like bodies must be valid UTF-8
// **Validates: Requirements 4.3, 7.3**

const strictDecoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

function isValidUtf8(bytes: Uint8Array): boolean {
  try {
    strictDecoder.decode(bytes);
    return true;
  } catch {
    return false;
  }
}

function hasLoneSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) i++;
      else return true;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return true;
    }
  }
  return false;
}

/** Byte arrays that are definitely not valid UTF-8. */
const invalidUtf8Arb: fc.Arbitrary<Uint8Array> = fc.oneof(
  // Arbitrary bytes, keeping only the invalid ones.
  fc.uint8Array({ minLength: 1, maxLength: 60 }).filter((b) => !isValidUtf8(b)),
  // Valid text with a byte that never appears in UTF-8 spliced in.
  fc
    .tuple(
      fc.uint8Array({ maxLength: 30 }),
      fc.constantFrom(0xc0, 0xc1, 0xf5, 0xff),
      fc.uint8Array({ maxLength: 30 }),
    )
    .map(([a, bad, b]) => Uint8Array.from([...a, bad, ...b])),
  // Stray continuation byte at the start.
  fc
    .tuple(fc.integer({ min: 0x80, max: 0xbf }), fc.uint8Array({ maxLength: 30 }))
    .map(([c, rest]) => Uint8Array.from([c, ...rest])),
  // Truncated multi-byte sequence at the end.
  fc.constantFrom(0xc2, 0xe2, 0xf0).map((lead) => Uint8Array.from([0x61, lead])),
).filter((b) => !isValidUtf8(b));

const validTextArb: fc.Arbitrary<string> = fc
  .oneof(fc.string({ minLength: 1, maxLength: 40 }), fc.string({ unit: 'grapheme', minLength: 1, maxLength: 20 }))
  .filter((s) => s.length > 0 && !hasLoneSurrogate(s));

describe('Property 10: Text-like bodies must be valid UTF-8', () => {
  it('decodeTextBody rejects any body that is not valid UTF-8', () => {
    fc.assert(
      fc.property(invalidUtf8Arb, (body) => {
        const result = decodeTextBody(false, body);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe('invalid-body');
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('decodeTextBody rejects any body when the compressed flag is set', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 60 }), (body) => {
        const result = decodeTextBody(true, body);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe('invalid-body');
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('rejects compressed=true even for a valid UTF-8 body', () => {
    fc.assert(
      fc.property(validTextArb, (text) => {
        const result = decodeTextBody(true, new TextEncoder().encode(text));
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe('invalid-body');
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('round-trips valid non-empty strings through encodeTextBody and decodeTextBody', () => {
    fc.assert(
      fc.property(validTextArb, (text) => {
        const encoded = encodeTextBody(text);
        expect(encoded.ok).toBe(true);
        if (!encoded.ok) return;
        expect(encoded.value.compressed).toBe(false);
        expect(Array.from(encoded.value.body)).toEqual(Array.from(new TextEncoder().encode(text)));
        const decoded = decodeTextBody(encoded.value.compressed, encoded.value.body);
        expect(decoded.ok).toBe(true);
        if (decoded.ok) expect(decoded.value).toBe(text);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
