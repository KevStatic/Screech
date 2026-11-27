import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildCheckin, buildCheckinText } from '../src/checkin-body.js';
import { decode } from '../src/codec.js';
import { SIZE_CAP } from '../src/constants.js';
import { HUNT_ALPHABET } from '../src/hunt-clue.js';
import { NUM_RUNS } from './helpers.js';

// Feature: seance, Property 1: Checkin_Builder produces a fixed, size-capped layout
// **Validates: Requirements 1.1, 1.2**
describe('Property 1: Checkin_Builder produces a fixed, size-capped layout', () => {
  const sessionIdArb = fc
    .array(fc.constantFrom(...HUNT_ALPHABET.split('')), { minLength: 8, maxLength: 8 })
    .map((chars) => chars.join(''));
  const codeArb = fc
    .array(fc.constantFrom(...'0123456789'.split('')), { minLength: 6, maxLength: 6 })
    .map((chars) => chars.join(''));

  it('buildCheckinText returns S1:<id>:<code>', () => {
    fc.assert(
      fc.property(sessionIdArb, codeArb, (sessionId, code) => {
        expect(buildCheckinText({ sessionId, code })).toBe(`S1:${sessionId}:${code}`);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('buildCheckin returns a checkin packet of at most SIZE_CAP bytes', () => {
    fc.assert(
      fc.property(sessionIdArb, codeArb, (sessionId, code) => {
        const built = buildCheckin({ sessionId, code });
        expect(built.ok).toBe(true);
        if (!built.ok) return;
        expect(built.value.length).toBeLessThanOrEqual(SIZE_CAP);
        const decoded = decode(built.value);
        expect(decoded.ok).toBe(true);
        if (!decoded.ok || decoded.value.multipart) {
          expect(decoded.ok && decoded.value.multipart).toBe(false);
          return;
        }
        expect(decoded.value.type).toBe('checkin');
        expect(decoded.value.payload).toEqual({
          type: 'checkin',
          text: `S1:${sessionId}:${code}`,
        });
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
