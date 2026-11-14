import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decode, encode } from '../src/codec.js';
import type { Payload } from '../src/types.js';
import { payloadArb } from './arbitraries.js';
import { NUM_RUNS } from './helpers.js';

/** Expected decoded value: url scheme lowercased, wifi open has an empty password. */
function expectedPayload(payload: Payload): Payload {
  if (payload.type === 'url') {
    return { type: 'url', url: payload.url.replace(/^(https?):\/\//i, (m) => m.toLowerCase()) };
  }
  if (payload.type === 'wifi' && payload.security === 'open') {
    return { ...payload, password: '' };
  }
  return payload;
}

describe('codec round trip (property)', () => {
  // Feature: screech-protocol, Property 3: Unsealed round trip
  // **Validates: Requirements 4.1, 4.2, 5.4, 6.1, 6.4, 6.9, 7.1, 7.2, 7.5, 11.1**
  it('decode(encode(payload)) equals the original for every payload that fits', () => {
    let fitted = 0;
    fc.assert(
      fc.property(payloadArb, (payload) => {
        const encoded = encode(payload);
        fc.pre(encoded.ok);
        if (!encoded.ok) return;
        fitted++;
        expect(encoded.value.length).toBeLessThanOrEqual(140);

        const decoded = decode(encoded.value);
        expect(decoded.ok).toBe(true);
        if (!decoded.ok) return;
        expect(decoded.value.multipart).toBe(false);
        if (decoded.value.multipart) return;
        expect(decoded.value.type).toBe(payload.type);
        expect(decoded.value.payload).toEqual(expectedPayload(payload));
      }),
      { numRuns: NUM_RUNS },
    );
    expect(fitted).toBeGreaterThan(0);
  });
});
