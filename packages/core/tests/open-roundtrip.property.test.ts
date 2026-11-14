import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { encodeBody } from '../src/body.js';
import { open, seal } from '../src/seal.js';
import type { Payload } from '../src/types.js';
import { counterArb, keyArb, payloadArb, senderIdArb } from './arbitraries.js';
import { NUM_RUNS, referenceSubtleDecrypt } from './helpers.js';

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

describe('sealed round trip and layout (property)', () => {
  // Feature: screech-protocol, Property 12: Sealed round trip and layout
  // **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 11.2**
  it('open(seal(...)) returns the payload and the packet has the sealed layout', async () => {
    let fitted = 0;
    await fc.assert(
      fc.asyncProperty(payloadArb, keyArb, senderIdArb, counterArb, async (payload, key, id, counter) => {
        const sealed = await seal(payload, key, id, counter);
        fc.pre(sealed.ok);
        if (!sealed.ok) return;
        fitted++;
        const packet = sealed.value;

        const encoded = encodeBody(payload);
        expect(encoded.ok).toBe(true);
        if (!encoded.ok) return;
        const body = encoded.value.body;

        // Layout
        expect(packet.length).toBe(17 + body.length);
        expect(packet.length).toBeLessThanOrEqual(140);
        expect(packet[0]).toBe(0xc1);
        expect((packet[2] as number) & 0x01).toBe(0x01);
        expect(Array.from(packet.slice(3, 7))).toEqual(Array.from(id));
        expect(packet[7]).toBe((counter >> 8) & 0xff);
        expect(packet[8]).toBe(counter & 0xff);

        // Independent decrypt
        const plain = await referenceSubtleDecrypt(packet, key);
        expect(Array.from(plain)).toEqual(Array.from(body));

        // Round trip
        const opened = await open(packet, key);
        expect(opened.ok).toBe(true);
        if (!opened.ok) return;
        expect(opened.value.multipart).toBe(false);
        if (opened.value.multipart) return;
        expect(opened.value.flags.sealed).toBe(true);
        expect(opened.value.type).toBe(payload.type);
        expect(opened.value.payload).toEqual(expectedPayload(payload));
      }),
      { numRuns: NUM_RUNS },
    );
    expect(fitted).toBeGreaterThan(0);
  });
});
