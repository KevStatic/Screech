import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { SIZE_CAP } from '@screech/core';
import type { CodecError, CodecErrorCode, Result } from '@screech/core';
import { budget } from '../../src/logic/byte-budget';

type OtherCode = Exclude<CodecErrorCode, 'too-large' | 'invalid-payload'>;

const otherCodes: readonly OtherCode[] = [
  'bad-magic',
  'unsupported-version',
  'truncated',
  'unknown-type',
  'reserved-flags',
  'invalid-wifi',
  'invalid-body',
  'auth-failed',
  'key-required',
  'invalid-key',
  'invalid-counter',
  'invalid-sender-id',
  'not-sealed',
  'crypto-unavailable',
];

const allCodes: readonly CodecErrorCode[] = [...otherCodes, 'too-large', 'invalid-payload'];

// Core messages are drawn from a realistic, non-trivial set so the "does not contain" check is meaningful
// (a random 1-char string could legitimately appear inside the fixed copy).
const messageArb = fc.stringMatching(/^[A-Z][a-z]{5,20}( [a-z]{5,12}){1,3}\d{2}$/);
const fieldArb = fc.stringMatching(/^[a-z][a-zA-Z]{0,15}$/);

const tooLargeError: fc.Arbitrary<CodecError> = fc
  .tuple(fc.integer({ min: SIZE_CAP + 1, max: 100_000 }), messageArb)
  .map(([length, message]) => ({ code: 'too-large', length, message }));

const invalidPayloadError: fc.Arbitrary<CodecError> = fc
  .tuple(fieldArb, messageArb)
  .map(([field, message]) => ({ code: 'invalid-payload', field, message }));

const otherError: fc.Arbitrary<CodecError> = fc
  .tuple(fc.constantFrom(...otherCodes), messageArb)
  .map(([code, message]) => ({ code, message }));

const err = (error: CodecError): Result<Uint8Array> => ({ ok: false, error });

describe('byte-budget error mapping properties', () => {
  /**
   * Property 8: Byte budget error mapping
   * **Validates: Requirements 2.9, 7.4, 7.5, 7.6, 7.7**
   */
  it('Property 8: Byte budget error mapping', () => {
    fc.assert(
      fc.property(fc.oneof(tooLargeError, invalidPayloadError, otherError), (error) => {
        const b = budget(err(error));

        if (error.code === 'too-large') {
          expect(b.status).toBe('too-large');
          expect(b.fill).toBe(1);
          expect(b.size).toBe(error.length);
          expect(b.message).toBe(`Too heavy to cross over (${error.length}/${SIZE_CAP} bytes)`);
        } else {
          expect(b.status).toBe('invalid');
          expect(b.fill).toBe(0);
          expect(b.size).toBeNull();
          expect(typeof b.message).toBe('string');
          expect((b.message ?? '').trim().length).toBeGreaterThan(0);
          const message = b.message ?? '';
          // too-large is excluded: only its own result may differ, and it is handled above.
          for (const code of allCodes) {
            if (code === 'too-large') continue;
            expect(message).not.toContain(code);
          }
          expect(message).not.toContain(error.code);
          expect(message).not.toContain(error.message);
        }
      }),
      { numRuns: 200 },
    );
  });
});
