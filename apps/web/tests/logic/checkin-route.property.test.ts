import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { HUNT_ALPHABET, buildCheckinText, parseCheckinText } from '@screech/core';
import type { CheckinFields, DecodedPacket, Result } from '@screech/core';
import { checkinRoute } from '../../src/logic/checkin-route';
import { decodedResult } from './arbitraries';

const fieldsArb: fc.Arbitrary<CheckinFields> = fc.record({
  sessionId: fc
    .array(fc.constantFrom(...HUNT_ALPHABET.split('')), { minLength: 8, maxLength: 8 })
    .map((c) => c.join('')),
  code: fc
    .array(fc.constantFrom(...'0123456789'.split('')), { minLength: 6, maxLength: 6 })
    .map((c) => c.join('')),
});

const flags = { sealed: false, compressed: false, multipart: false };

function packet(type: string, text: unknown, multipart = false): Result<DecodedPacket> {
  if (multipart) {
    return {
      ok: true,
      value: { multipart: true, type, flags: { ...flags, multipart: true }, body: new Uint8Array(3) },
    } as unknown as Result<DecodedPacket>;
  }
  return {
    ok: true,
    value: { multipart: false, type, flags, payload: { type, text } },
  } as unknown as Result<DecodedPacket>;
}

const garbledText = fc.oneof(
  fc.string({ maxLength: 30 }),
  fieldsArb.map((f) => buildCheckinText(f).slice(0, -1)),
  fieldsArb.map((f) => `${buildCheckinText(f)}0`),
  fieldsArb.map((f) => buildCheckinText(f).toLowerCase()),
);

const routeInput: fc.Arbitrary<Result<DecodedPacket>> = fc.oneof(
  decodedResult,
  fieldsArb.map((f) => packet('checkin', buildCheckinText(f))),
  garbledText.map((t) => packet('checkin', t)),
  fieldsArb.map((f) => packet('text', buildCheckinText(f))),
  fieldsArb.map((f) => packet('hunt-clue', buildCheckinText(f))),
  fieldsArb.map((f) => packet('checkin', buildCheckinText(f), true)),
  fc.constantFrom<unknown>(
    null,
    undefined,
    3,
    'x',
    {},
    { ok: true },
    { ok: true, value: null },
    { ok: true, value: { multipart: false, type: 'checkin' } },
    { ok: true, value: { multipart: false, type: 'checkin', payload: null } },
    { ok: false, error: { code: 'invalid-body', message: 'x' } },
    [],
  ).map((v) => v as Result<DecodedPacket>),
);

describe('checkin-route properties', () => {
  // Feature: seance, Property 15: checkinRoute total classification
  // **Validates: Requirements 13.1**
  it('Property 15: checkinRoute total classification', () => {
    fc.assert(
      fc.property(routeInput, (input) => {
        const route = checkinRoute(input);
        const r = input as {
          ok?: boolean;
          value?: { multipart?: boolean; type?: string; payload?: { text?: unknown } | null };
        } | null;
        const isCheckin =
          typeof r === 'object' &&
          r !== null &&
          r.ok === true &&
          r.value?.multipart === false &&
          r.value.type === 'checkin';
        if (!isCheckin) {
          expect(route).toEqual({ kind: 'none' });
          return;
        }
        const parsed = parseCheckinText(r.value?.payload?.text);
        if (parsed.ok) expect(route).toEqual({ kind: 'checkin', fields: parsed.value });
        else expect(route).toEqual({ kind: 'none' });
      }),
      { numRuns: 300 },
    );
  });

  // Feature: seance, Property 15: checkinRoute total classification
  // **Validates: Requirements 13.1**
  it('Property 15: a well-formed non-multipart check-in routes with the same fields', () => {
    fc.assert(
      fc.property(fieldsArb, (f) => {
        expect(checkinRoute(packet('checkin', buildCheckinText(f)))).toEqual({ kind: 'checkin', fields: f });
      }),
      { numRuns: 200 },
    );
  });
});
