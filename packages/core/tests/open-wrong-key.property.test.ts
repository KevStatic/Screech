import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { open, seal } from '../src/seal.js';
import { counterArb, keyArb, payloadArb, senderIdArb } from './arbitraries.js';
import { NUM_RUNS } from './helpers.js';

describe('open with a wrong key (property)', () => {
  // Feature: screech-protocol, Property 16: Wrong key fails authentication
  // **Validates: Requirements 8.6, 11.4**
  it('open resolves to auth-failed with no Payload for any different 16-byte key', async () => {
    let checked = 0;
    await fc.assert(
      fc.asyncProperty(
        payloadArb,
        keyArb,
        keyArb,
        senderIdArb,
        counterArb,
        async (payload, key, otherKey, id, counter) => {
          fc.pre(!key.every((b, i) => b === otherKey[i]));
          const sealed = await seal(payload, key, id, counter);
          fc.pre(sealed.ok);
          if (!sealed.ok) return;

          const result = await open(sealed.value, otherKey);
          checked++;
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.error.code).toBe('auth-failed');
          }
          expect('value' in result).toBe(false);
        },
      ),
      { numRuns: NUM_RUNS },
    );
    expect(checked).toBeGreaterThan(0);
  });
});
