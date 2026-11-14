import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { nextSenderState } from '../src/sender-state.js';
import type { SenderState } from '../src/types.js';
import { counterArb, senderIdArb } from './arbitraries.js';
import { NUM_RUNS } from './helpers.js';

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/** Sender_ID values that are not a 4-byte Uint8Array. */
const badSenderIdArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.uint8Array({ maxLength: 3 }),
  fc.uint8Array({ minLength: 5, maxLength: 12 }),
  fc.array(fc.integer({ min: 0, max: 255 }), { minLength: 4, maxLength: 4 }),
  fc.constantFrom(undefined, null, 0, 'abcd', {}),
);

/** Counter values that are not an integer in 0..65535. */
const badCounterArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.integer({ min: -100000, max: -1 }),
  fc.integer({ min: 65536, max: 10_000_000 }),
  fc.double({ noInteger: true, noNaN: true, noDefaultInfinity: true }).filter((n) => !Number.isInteger(n)),
  fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, undefined, null, '1', {}),
);

describe('nextSenderState rotation', () => {
  // Feature: screech-protocol, Property 19: Sender state rotation
  // **Validates: Requirements 9.1, 9.2, 9.3, 9.5, 9.6, 12.6**

  it('increments the counter and keeps the ID below 65535', () => {
    fc.assert(
      fc.property(senderIdArb, fc.integer({ min: 0, max: 65534 }), (senderId, counter) => {
        const before = new Uint8Array(senderId);
        const prev: SenderState = { senderId, counter };
        const r = nextSenderState(prev);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.counter).toBe(counter + 1);
        expect(sameBytes(r.value.senderId, before)).toBe(true);
        expect(sameBytes(senderId, before)).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('rolls over to a different ID with counter 0 at 65535, even if the random source returns the old ID', () => {
    fc.assert(
      fc.property(senderIdArb, (senderId) => {
        const old = new Uint8Array(senderId);
        const r = nextSenderState({ senderId, counter: 65535 }, (buf) => {
          buf.set(old);
          return buf;
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.counter).toBe(0);
        expect(r.value.senderId.length).toBe(4);
        expect(sameBytes(r.value.senderId, old)).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('rolls over to a different ID with the default random source', () => {
    fc.assert(
      fc.property(senderIdArb, (senderId) => {
        const old = new Uint8Array(senderId);
        const r = nextSenderState({ senderId, counter: 65535 });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.counter).toBe(0);
        expect(sameBytes(r.value.senderId, old)).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('returns a 4-byte ID and counter 0 without a previous state', () => {
    fc.assert(
      fc.property(fc.constant(undefined), () => {
        const r = nextSenderState();
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.senderId).toBeInstanceOf(Uint8Array);
        expect(r.value.senderId.length).toBe(4);
        expect(r.value.counter).toBe(0);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('rejects an invalid Sender_ID with invalid-sender-id and no state', () => {
    fc.assert(
      fc.property(badSenderIdArb, counterArb, (senderId, counter) => {
        const r = nextSenderState({ senderId, counter } as unknown as SenderState);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.error.code).toBe('invalid-sender-id');
        expect('value' in r).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('rejects an invalid counter with invalid-counter and no state', () => {
    fc.assert(
      fc.property(senderIdArb, badCounterArb, (senderId, counter) => {
        const r = nextSenderState({ senderId, counter } as unknown as SenderState);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.error.code).toBe('invalid-counter');
        expect('value' in r).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
