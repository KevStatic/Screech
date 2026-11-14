import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { open, seal } from '../src/seal.js';
import { counterArb, keyArb, payloadArb, senderIdArb } from './arbitraries.js';
import { NUM_RUNS, referenceSealedPacket } from './helpers.js';

const bytes = (a: Uint8Array): number[] => Array.from(a);

// Type values 0..5 and the compressed bit, hardcoded on purpose (independent of src/).
const typeArb = fc.integer({ min: 0, max: 5 });
// Sealed body limit is 123 bytes (140 - 17).
const multipartBodyArb = fc.oneof(
  { weight: 3, arbitrary: fc.uint8Array({ minLength: 0, maxLength: 123 }) },
  { weight: 1, arbitrary: fc.uint8Array({ minLength: 123, maxLength: 123 }) },
  { weight: 1, arbitrary: fc.constant(new Uint8Array(0)) },
);

describe('seal and open input safety (property)', () => {
  // Feature: screech-protocol, Property 21: Inputs are not modified or retained
  // **Validates: Requirements 10.5**
  it('Property 21: seal does not modify or retain the Room_Key and Sender_ID', async () => {
    await fc.assert(
      fc.asyncProperty(payloadArb, keyArb, senderIdArb, counterArb, async (payload, key, id, counter) => {
        const keyBefore = bytes(key);
        const idBefore = bytes(id);
        const keyCopy = Uint8Array.from(key);
        const idCopy = Uint8Array.from(id);

        const sealed = await seal(payload, key, id, counter);

        // Not modified
        expect(bytes(key)).toEqual(keyBefore);
        expect(bytes(id)).toEqual(idBefore);

        fc.pre(sealed.ok);
        if (!sealed.ok) return;
        const packet = sealed.value;
        const packetBefore = bytes(packet);

        // Not retained: the result shares no memory with the inputs, and mutating the
        // inputs afterwards neither changes the result nor changes what a second call returns.
        expect(packet.buffer).not.toBe(key.buffer);
        expect(packet.buffer).not.toBe(id.buffer);
        key.fill(0xaa);
        id.fill(0x55);
        expect(bytes(packet)).toEqual(packetBefore);

        const again = await seal(payload, keyCopy, idCopy, counter);
        expect(again.ok).toBe(true);
        if (!again.ok) return;
        expect(bytes(again.value)).toEqual(packetBefore);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: screech-protocol, Property 21: Inputs are not modified or retained
  // **Validates: Requirements 10.5**
  it('Property 21: open does not modify or retain the packet and Room_Key', async () => {
    await fc.assert(
      fc.asyncProperty(payloadArb, keyArb, senderIdArb, counterArb, async (payload, key, id, counter) => {
        const sealed = await seal(payload, key, id, counter);
        fc.pre(sealed.ok);
        if (!sealed.ok) return;
        const packet = sealed.value;
        const packetBefore = bytes(packet);
        const keyBefore = bytes(key);

        const first = await open(packet, key);
        expect(first.ok).toBe(true);
        if (!first.ok) return;

        // Not modified
        expect(bytes(packet)).toEqual(packetBefore);
        expect(bytes(key)).toEqual(keyBefore);

        // Not retained: mutating the inputs afterwards does not change the result.
        const snapshot = structuredClone(first.value);
        packet.fill(0xff);
        key.fill(0x00);
        expect(first.value).toEqual(snapshot);

        // A fresh call with restored inputs gives the same result.
        const restoredPacket = Uint8Array.from(packetBefore);
        const restoredKey = Uint8Array.from(keyBefore);
        const second = await open(restoredPacket, restoredKey);
        expect(second.ok).toBe(true);
        if (!second.ok) return;
        expect(second.value).toEqual(snapshot);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: screech-protocol, Property 22: Multipart passthrough
  // **Validates: Requirements 2.5**
  it('Property 22: open returns the decrypted body of a sealed multipart packet unchanged, as a copy', async () => {
    await fc.assert(
      fc.asyncProperty(
        typeArb,
        fc.boolean(),
        multipartBodyArb,
        keyArb,
        senderIdArb,
        counterArb,
        async (type, compressed, body, key, id, counter) => {
          const flags = 0x04 | (compressed ? 0x02 : 0);
          const packet = referenceSealedPacket({ key, senderId: id, counter, type, flags, body });
          const packetBefore = bytes(packet);

          const result = await open(packet, key);
          expect(result.ok).toBe(true);
          if (!result.ok) return;
          const decoded = result.value;
          expect(decoded.multipart).toBe(true);
          if (!decoded.multipart) return;

          expect(decoded.flags).toEqual({ sealed: true, compressed, multipart: true });
          expect(bytes(decoded.body)).toEqual(bytes(body));

          // Copy: shares no memory with the packet or the input body.
          expect(decoded.body.buffer).not.toBe(packet.buffer);
          expect(decoded.body.buffer).not.toBe(body.buffer);

          // Mutating the packet afterwards does not change the returned body.
          packet.fill(0xff);
          expect(bytes(decoded.body)).toEqual(bytes(body));
          expect(packetBefore.length).toBe(17 + body.length);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
