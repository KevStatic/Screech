import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { decode, encode } from '@screech/core';
import type { Payload } from '@screech/core';
import { screenState } from '../../src/logic/screen-state';

const NUM_RUNS = 200;
const KINDS = ['ignore', 'reveal', 'garbled', 'pact-required'];

const randomBytesArb = fc.uint8Array({ minLength: 0, maxLength: 300 });

const validPayloadArb: fc.Arbitrary<Payload> = fc.oneof(
  fc.string({ maxLength: 40 }).map((text): Payload => ({ type: 'text', text })),
  fc
    .string({ unit: 'grapheme-ascii', maxLength: 30 })
    .map((s): Payload => ({ type: 'url', url: `https://example.com/${s}` })),
  fc.record({
    type: fc.constant('wifi' as const),
    ssid: fc.string({ minLength: 1, maxLength: 16 }),
    password: fc.string({ maxLength: 16 }),
    security: fc.constantFrom('open' as const, 'wpa' as const, 'wep' as const),
  }),
  fc.string({ maxLength: 40 }).map((text): Payload => ({ type: 'contact', text })),
);

/** A valid encoded packet (or random bytes if the payload does not fit) with random mutations. */
const mutatedPacketArb = fc
  .tuple(
    validPayloadArb,
    fc.array(
      fc.oneof(
        fc.record({ kind: fc.constant('flip' as const), at: fc.nat(), bits: fc.integer({ min: 1, max: 255 }) }),
        fc.record({ kind: fc.constant('set' as const), at: fc.nat(), value: fc.integer({ min: 0, max: 255 }) }),
        fc.record({ kind: fc.constant('truncate' as const), at: fc.nat() }),
        fc.record({ kind: fc.constant('append' as const), bytes: fc.uint8Array({ maxLength: 20 }) }),
      ),
      { maxLength: 6 },
    ),
  )
  .map(([payload, edits]) => {
    const enc = encode(payload);
    let bytes: Uint8Array = enc.ok ? enc.value.slice() : new Uint8Array(0);
    for (const e of edits) {
      if (e.kind === 'append') {
        const next = new Uint8Array(bytes.length + e.bytes.length);
        next.set(bytes);
        next.set(e.bytes, bytes.length);
        bytes = next;
      } else if (e.kind === 'truncate') {
        bytes = bytes.slice(0, bytes.length === 0 ? 0 : e.at % (bytes.length + 1));
      } else if (bytes.length > 0) {
        const i = e.at % bytes.length;
        bytes = bytes.slice();
        bytes[i] = e.kind === 'flip' ? (bytes[i] ?? 0) ^ e.bits : e.value;
      }
    }
    return bytes;
  });

function checkPipeline(bytes: Uint8Array): void {
  const state = screenState(decode(bytes));
  expect(KINDS).toContain(state.kind);
  if (state.kind === 'reveal') {
    const payload = state.packet.payload;
    const re = encode(payload);
    if (re.ok) {
      const again = decode(re.value);
      expect(again.ok).toBe(true);
      if (again.ok && !again.value.multipart) {
        expect(again.value.payload).toEqual(payload);
      }
    }
  }
}

describe('Feature: spirit-box-app, Property 20: Random sound never breaks the receive pipeline', () => {
  /** **Validates: Requirements 12.1, 12.9** */
  it('random byte arrays (0 to 300 bytes) never throw and map to a valid screen state', () => {
    fc.assert(
      fc.property(randomBytesArb, (bytes) => {
        checkPipeline(bytes);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  /** **Validates: Requirements 12.1, 12.9** */
  it('mutated valid packets never throw and map to a valid screen state', () => {
    fc.assert(
      fc.property(mutatedPacketArb, (bytes) => {
        checkPipeline(bytes);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('empty input is ignored', () => {
    expect(KINDS).toContain(screenState(decode(new Uint8Array(0))).kind);
  });
});
