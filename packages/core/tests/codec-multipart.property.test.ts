import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decode } from '../src/codec.js';
import { buildFrame } from '../src/frame.js';
import type { PacketType } from '../src/types.js';
import { NUM_RUNS } from './helpers.js';

const TYPES: readonly PacketType[] = ['text', 'url', 'wifi', 'contact', 'checkin', 'hunt-clue'];

// Any bytes, including ones that are invalid for the type (bad UTF-8, undefined URL
// prefix code, malformed Wi-Fi layout, empty), up to the 137-byte unsealed body limit.
const bodyArb: fc.Arbitrary<Uint8Array> = fc.oneof(
  { weight: 3, arbitrary: fc.uint8Array({ minLength: 0, maxLength: 137 }) },
  { weight: 1, arbitrary: fc.uint8Array({ minLength: 137, maxLength: 137 }) },
  { weight: 1, arbitrary: fc.constant(new Uint8Array(0)) },
  { weight: 1, arbitrary: fc.uint8Array({ minLength: 1, maxLength: 20 }).map((b) => b.map((x) => 0x80 | x)) },
);

describe('codec multipart passthrough properties', () => {
  // Feature: screech-protocol, Property 22: Multipart passthrough
  // **Validates: Requirements 2.5**
  it('Property 22: decode returns the raw body of an unsealed multipart frame uninterpreted', () => {
    fc.assert(
      fc.property(fc.constantFrom(...TYPES), fc.boolean(), bodyArb, (type, compressed, body) => {
        const input = Uint8Array.from(body);
        const packet = buildFrame(type, { sealed: false, compressed, multipart: true }, input);
        const result = decode(packet);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const decoded = result.value;
        expect(decoded.multipart).toBe(true);
        if (!decoded.multipart) return;

        expect(decoded.type).toBe(type);
        expect(decoded.flags).toEqual({ sealed: false, compressed, multipart: true });
        expect(Array.from(decoded.body)).toEqual(Array.from(input));

        // The returned body is a copy: it does not share memory with the input body or the packet.
        expect(decoded.body).not.toBe(input);
        expect(decoded.body.buffer).not.toBe(packet.buffer);
        expect(decoded.body.buffer).not.toBe(input.buffer);

        // Mutating the packet afterwards does not change the returned body.
        packet.fill(0xff);
        expect(Array.from(decoded.body)).toEqual(Array.from(input));
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
