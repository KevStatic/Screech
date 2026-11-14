import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildFrame, parseFrame } from '../src/frame.js';
import type { PacketFlags, PacketType } from '../src/types.js';
import { NUM_RUNS } from './helpers.js';

/** Type values hardcoded on purpose, independent of `src/constants.ts`. */
const TYPE_VALUES: ReadonlyArray<readonly [PacketType, number]> = [
  ['text', 0],
  ['url', 1],
  ['wifi', 2],
  ['contact', 3],
  ['checkin', 4],
  ['hunt-clue', 5],
];

const typeArb: fc.Arbitrary<readonly [PacketType, number]> = fc.constantFrom(...TYPE_VALUES);

const flagsArb: fc.Arbitrary<PacketFlags> = fc.record({
  sealed: fc.boolean(),
  compressed: fc.boolean(),
  multipart: fc.boolean(),
});

const bodyArb: fc.Arbitrary<Uint8Array> = fc.uint8Array({ minLength: 0, maxLength: 200 });

describe('frame properties', () => {
  // Feature: screech-protocol, Property 1: Frame round trip
  // **Validates: Requirements 1.1, 1.5, 2.1, 2.3, 2.6**
  it('Property 1: Frame round trip', () => {
    fc.assert(
      fc.property(typeArb, flagsArb, bodyArb, ([type, typeValue], flags, body) => {
        const frame = buildFrame(type, flags, body);

        // Header bytes
        expect(frame.length).toBe(3 + body.length);
        expect(frame[0]).toBe(0xc1);
        expect(frame[1]).toBe(typeValue);
        const expectedFlags =
          (flags.sealed ? 0x01 : 0) | (flags.compressed ? 0x02 : 0) | (flags.multipart ? 0x04 : 0);
        expect(frame[2]).toBe(expectedFlags);
        expect((frame[2] as number) & 0xf8).toBe(0);

        // Round trip
        const parsed = parseFrame(frame);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.value.type).toBe(type);
        expect(parsed.value.flags).toEqual(flags);
        expect(Array.from(parsed.value.body)).toEqual(Array.from(body));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: screech-protocol, Property 1: Frame round trip (body is a copy)
  // **Validates: Requirements 1.5, 2.6**
  it('Property 1: parsed body is a copy of the input bytes', () => {
    fc.assert(
      fc.property(typeArb, flagsArb, bodyArb, ([type], flags, body) => {
        const frame = buildFrame(type, flags, body);
        const parsed = parseFrame(frame);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;

        const frameBefore = Uint8Array.from(frame);
        const returned = parsed.value.body;
        const returnedBefore = Uint8Array.from(returned);

        // Mutating the returned body must not touch the input frame.
        for (let i = 0; i < returned.length; i++) returned[i] = (returned[i] as number) ^ 0xff;
        expect(Array.from(frame)).toEqual(Array.from(frameBefore));

        // Mutating the input frame must not touch a previously returned body.
        const again = parseFrame(frame);
        if (!again.ok) throw new Error('expected ok');
        const copy = again.value.body;
        const copyBefore = Uint8Array.from(copy);
        for (let i = 3; i < frame.length; i++) frame[i] = (frame[i] as number) ^ 0xff;
        expect(Array.from(copy)).toEqual(Array.from(copyBefore));
        expect(copy.buffer).not.toBe(frame.buffer);
        expect(returnedBefore.length).toBe(body.length);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('buildFrame copies the body (mutating the source afterwards does not change the frame)', () => {
    const body = Uint8Array.from([1, 2, 3]);
    const frame = buildFrame('text', { sealed: false, compressed: false, multipart: false }, body);
    body[0] = 99;
    expect(frame[3]).toBe(1);
  });
});
