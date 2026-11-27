import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decode } from '../src/codec.js';
import { buildCheckin, parseCheckinText } from '../src/checkin-body.js';
import type { CheckinFields } from '../src/checkin-body.js';
import { HUNT_ALPHABET } from '../src/hunt-clue.js';
import { NUM_RUNS } from './helpers.js';

const sessionIdArb = fc
  .array(fc.constantFrom(...HUNT_ALPHABET.split('')), { minLength: 8, maxLength: 8 })
  .map((a) => a.join(''));

const codeArb = fc
  .array(fc.constantFrom(...'0123456789'.split('')), { minLength: 6, maxLength: 6 })
  .map((a) => a.join(''));

const fieldsArb: fc.Arbitrary<CheckinFields> = fc.record({
  sessionId: sessionIdArb,
  code: codeArb,
});

describe('checkin body round trip', () => {
  // Feature: seance, Property 2: Build/encode/decode/parse round trip
  it('buildCheckin, decode and parseCheckinText return the original fields', () => {
    fc.assert(
      fc.property(fieldsArb, (fields) => {
        const built = buildCheckin(fields);
        expect(built.ok).toBe(true);
        if (!built.ok) return;

        const decoded = decode(built.value);
        expect(decoded.ok).toBe(true);
        if (!decoded.ok) return;
        expect(decoded.value.multipart).toBe(false);
        if (decoded.value.multipart) return;
        expect(decoded.value.type).toBe('checkin');
        expect(decoded.value.payload.type).toBe('checkin');
        if (decoded.value.payload.type !== 'checkin') return;

        const parsed = parseCheckinText(decoded.value.payload.text);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.value).toEqual(fields);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('keeps leading zeros in the code', () => {
    const built = buildCheckin({ sessionId: HUNT_ALPHABET.slice(0, 8), code: '000042' });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const decoded = decode(built.value);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok || decoded.value.multipart || decoded.value.payload.type !== 'checkin') return;
    const parsed = parseCheckinText(decoded.value.payload.text);
    expect(parsed.ok && parsed.value.code).toBe('000042');
  });
});
