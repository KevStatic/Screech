import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { encodeBody } from '../src/body.js';
import { seal } from '../src/seal.js';
import { anythingArb, counterArb, keyArb, payloadArb, senderIdArb } from './arbitraries.js';
import { NUM_RUNS } from './helpers.js';

/** Anything that is not a 16-byte Uint8Array (includes undefined, null and wrong-length arrays). */
const badKeyArb: fc.Arbitrary<unknown> = fc.oneof(
  anythingArb,
  fc.constantFrom(undefined, null),
  fc.uint8Array({ minLength: 0, maxLength: 40 }),
).filter((v) => !(v instanceof Uint8Array && v.length === 16));

/** Anything that is not a 4-byte Uint8Array. */
const badSenderIdArb: fc.Arbitrary<unknown> = fc.oneof(
  anythingArb,
  fc.constantFrom(undefined, null),
  fc.uint8Array({ minLength: 0, maxLength: 12 }),
).filter((v) => !(v instanceof Uint8Array && v.length === 4));

/** Anything that is not an integer from 0 to 65535. */
const badCounterArb: fc.Arbitrary<unknown> = fc.oneof(
  anythingArb,
  fc.double({ noNaN: false }),
  fc.constantFrom(NaN, Infinity, -Infinity, 0.5, -1, 65536, '1', null, undefined),
  fc.integer({ min: -100000, max: -1 }),
  fc.integer({ min: 65536, max: 200000 }),
).filter(
  (v) => !(typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 65535),
);

describe('seal size cap, determinism and validation (property)', () => {
  // Feature: screech-protocol, Property 11: Size cap is never exceeded
  // **Validates: Requirements 8.14, 8.15, 10.3, 11.3, 12.3**
  it('seal resolves to at most 140 bytes or an error, with exact lengths', async () => {
    let fitted = 0;
    let tooLarge = 0;
    await fc.assert(
      fc.asyncProperty(payloadArb, keyArb, senderIdArb, counterArb, async (payload, key, id, counter) => {
        const encoded = encodeBody(payload);
        expect(encoded.ok).toBe(true);
        if (!encoded.ok) return;
        const expectedLength = 17 + encoded.value.body.length;

        const result = await seal(payload, key, id, counter);
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
        expect(result.ok).toBe(expectedLength <= 140);
      }),
      { numRuns: NUM_RUNS },
    );
    expect(fitted).toBeGreaterThan(0);
    expect(tooLarge).toBeGreaterThan(0);
  });

  // Feature: screech-protocol, Property 14: Determinism
  // **Validates: Requirements 10.3, 11.3**
  it('seal called twice with the same inputs gives identical bytes', async () => {
    await fc.assert(
      fc.asyncProperty(payloadArb, keyArb, senderIdArb, counterArb, async (payload, key, id, counter) => {
        const first = await seal(payload, key, id, counter);
        const second = await seal(payload, key, id, counter);
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

  // Feature: screech-protocol, Property 18: Sealer and Opener argument validation
  // **Validates: Requirements 8.9, 8.12, 8.13, 12.3**
  it('seal rejects a bad Room_Key with invalid-key, before any other argument', async () => {
    await fc.assert(
      fc.asyncProperty(
        badKeyArb,
        fc.oneof(senderIdArb, badSenderIdArb),
        fc.oneof(counterArb, badCounterArb),
        payloadArb,
        async (key, id, counter, payload) => {
          const result = await seal(payload, key as Uint8Array, id as Uint8Array, counter as number);
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.error.code).toBe('invalid-key');
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: screech-protocol, Property 18: Sealer and Opener argument validation
  // **Validates: Requirements 8.12, 8.13**
  it('seal rejects a bad Sender_ID with invalid-sender-id, before the Counter', async () => {
    await fc.assert(
      fc.asyncProperty(
        keyArb,
        badSenderIdArb,
        fc.oneof(counterArb, badCounterArb),
        payloadArb,
        async (key, id, counter, payload) => {
          const result = await seal(payload, key, id as Uint8Array, counter as number);
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.error.code).toBe('invalid-sender-id');
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: screech-protocol, Property 18: Sealer and Opener argument validation
  // **Validates: Requirements 8.13, 8.14**
  it('seal rejects a bad Counter with invalid-counter', async () => {
    await fc.assert(
      fc.asyncProperty(keyArb, senderIdArb, badCounterArb, payloadArb, async (key, id, counter, payload) => {
        const result = await seal(payload, key, id, counter as number);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe('invalid-counter');
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
