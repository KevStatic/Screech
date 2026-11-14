import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { encode } from '../src/codec.js';
import type { Payload } from '../src/types.js';
import { payloadArb } from './arbitraries.js';
import { NUM_RUNS, referenceCompressUrl, referenceWifiBody } from './helpers.js';

/** Body length computed independently of `src/`. */
function referenceBodyLength(payload: Payload): number {
  switch (payload.type) {
    case 'url': {
      const ref = referenceCompressUrl(payload.url);
      if (ref === null) throw new Error('generator produced an invalid URL');
      return ref.body.length;
    }
    case 'wifi':
      return referenceWifiBody(payload.security, payload.ssid, payload.password).length;
    default:
      return new TextEncoder().encode(payload.text).length;
  }
}

describe('codec size cap and determinism (property)', () => {
  // Feature: screech-protocol, Property 11: Size cap is never exceeded
  // **Validates: Requirements 3.1, 3.2, 3.4, 4.5, 10.3, 11.3, 12.3**
  it('encode gives a Uint8Array of at most 140 bytes or an error, with exact lengths', () => {
    let fitted = 0;
    let tooLarge = 0;
    fc.assert(
      fc.property(payloadArb, (payload) => {
        const expectedLength = 3 + referenceBodyLength(payload);
        const result = encode(payload);

        if (result.ok) {
          fitted++;
          expect(result.value).toBeInstanceOf(Uint8Array);
          expect(result.value.length).toBeLessThanOrEqual(140);
          expect(result.value.length).toBe(expectedLength);
        } else {
          expect(result.error.code).toBe('too-large');
          if (result.error.code !== 'too-large') return;
          tooLarge++;
          expect(result.error.length).toBe(expectedLength);
          expect(result.error.length).toBeGreaterThan(140);
        }
        // A valid payload fits exactly when its computed length is at most 140.
        expect(result.ok).toBe(expectedLength <= 140);
      }),
      { numRuns: NUM_RUNS },
    );
    expect(fitted).toBeGreaterThan(0);
    expect(tooLarge).toBeGreaterThan(0);
  });

  // Feature: screech-protocol, Property 14: Determinism
  // **Validates: Requirements 10.3, 11.3**
  it('encode called twice gives identical results', () => {
    fc.assert(
      fc.property(payloadArb, (payload) => {
        const first = encode(payload);
        const second = encode(payload);
        expect(second.ok).toBe(first.ok);
        if (first.ok && second.ok) {
          expect(second.value).toEqual(first.value);
          expect(second.value).not.toBe(first.value);
        } else if (!first.ok && !second.ok) {
          expect(second.error).toEqual(first.error);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
