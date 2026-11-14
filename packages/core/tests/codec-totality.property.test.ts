import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decode, encode } from '../src/codec.js';
import type { Payload } from '../src/types.js';
import { anyBytesArb, anythingArb } from './arbitraries.js';
import { NUM_RUNS } from './helpers.js';

/** True when `value` has the shape of a Result (ok with value, or not ok with an error code). */
function isResult(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as { ok?: unknown; value?: unknown; error?: { code?: unknown } };
  if (r.ok === true) return 'value' in r;
  if (r.ok === false) return typeof r.error?.code === 'string';
  return false;
}

/** Bytes that always pass the header checks and carry the multipart flag, sealed bit clear. */
const multipartBytesArb: fc.Arbitrary<Uint8Array> = fc
  .tuple(fc.integer({ min: 0, max: 5 }), fc.integer({ min: 0, max: 1 }), fc.uint8Array({ maxLength: 137 }))
  .map(([type, compressed, body]) => {
    const out = new Uint8Array(3 + body.length);
    out[0] = 0xc1;
    out[1] = type;
    out[2] = 0x04 | (compressed << 1);
    out.set(body, 3);
    return out;
  });

/** Bytes biased toward valid single-part packets, produced by `encode` from valid-looking text. */
const encodedPacketArb: fc.Arbitrary<Uint8Array> = fc
  .string({ minLength: 1, maxLength: 60 })
  .map((text): Payload => ({ type: 'text', text }))
  .map((payload) => encode(payload))
  .filter((r) => r.ok)
  .map((r) => (r.ok ? r.value : new Uint8Array(0)));

const inputBytesArb: fc.Arbitrary<Uint8Array> = fc.oneof(
  { weight: 3, arbitrary: anyBytesArb },
  { weight: 2, arbitrary: multipartBytesArb },
  { weight: 2, arbitrary: encodedPacketArb },
);

describe('codec totality properties', () => {
  // Feature: screech-protocol, Property 20: Totality
  // **Validates: Requirements 10.6, 10.7, 10.11, 12.4**
  it('Property 20: encode never throws and returns a Result for arbitrary values', () => {
    fc.assert(
      fc.property(anythingArb, (value) => {
        const result = encode(value as Payload);
        expect(isResult(result)).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: screech-protocol, Property 20: Totality
  // **Validates: Requirements 10.6, 10.7, 10.11, 12.4**
  it('Property 20: decode never throws and returns a Result for arbitrary values', () => {
    fc.assert(
      fc.property(anythingArb, (value) => {
        const result = decode(value as Uint8Array);
        expect(isResult(result)).toBe(true);
        if (!(value instanceof Uint8Array)) {
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.error.code).toBe('invalid-payload');
            expect(result.error).toMatchObject({ field: 'packet' });
          }
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: screech-protocol, Property 20: Totality
  // **Validates: Requirements 10.6, 10.11, 12.4**
  it('Property 20: decode never throws and returns a Result for 0 to 300 byte arrays', () => {
    fc.assert(
      fc.property(anyBytesArb, (bytes) => {
        expect(isResult(decode(bytes))).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: screech-protocol, Property 21: Inputs are not modified or retained
  // **Validates: Requirements 10.5**
  it('Property 21: decode leaves its input unchanged and returns nothing that aliases it', () => {
    fc.assert(
      fc.property(inputBytesArb, (input) => {
        const before = Uint8Array.from(input);
        const result = decode(input);

        // The input is unchanged by the call.
        expect(Array.from(input)).toEqual(Array.from(before));

        if (!result.ok) return;

        // Snapshot the result, then mutate the input and check the result did not move.
        const snapshot = result.value.multipart
          ? { body: Array.from(result.value.body) }
          : { payload: JSON.parse(JSON.stringify(result.value.payload)) as unknown };

        if (result.value.multipart) {
          expect(result.value.body.buffer).not.toBe(input.buffer);
        }
        for (let i = 0; i < input.length; i++) input[i] = ((input[i] as number) ^ 0xff) & 0xff;

        if (result.value.multipart) {
          expect(Array.from(result.value.body)).toEqual(snapshot.body);
        } else {
          expect(JSON.parse(JSON.stringify(result.value.payload)) as unknown).toEqual(
            snapshot.payload,
          );
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
