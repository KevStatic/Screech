import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { encodeUrlBody } from '../src/url-body.js';
import { urlArb } from './arbitraries.js';
import { NUM_RUNS, referenceCompressUrl } from './helpers.js';

describe('url-body properties', () => {
  // Feature: screech-protocol, Property 4: URL compression canonical form
  // **Validates: Requirements 5.1, 5.2, 5.3**
  it('encodeUrlBody matches the reference compressor and sets the compressed flag', () => {
    fc.assert(
      fc.property(urlArb, (url) => {
        const reference = referenceCompressUrl(url);
        expect(reference).not.toBeNull();
        if (reference === null) return;

        const result = encodeUrlBody(url);
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        expect(result.value.compressed).toBe(true);
        expect(Array.from(result.value.body)).toEqual(Array.from(reference.body));
        // Body = [schemeByte] || utf8(remainder)
        expect(result.value.body[0]).toBe(reference.schemeByte);
        expect(Array.from(result.value.body.subarray(1))).toEqual(
          Array.from(new TextEncoder().encode(reference.remainder)),
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
