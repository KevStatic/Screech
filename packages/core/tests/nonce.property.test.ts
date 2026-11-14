import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { deriveNonce } from '../src/seal.js';
import { counterArb, senderIdArb } from './arbitraries.js';
import { NUM_RUNS } from './helpers.js';

function nonceOf(senderId: Uint8Array, counter: number): Uint8Array {
  const result = deriveNonce(senderId, counter);
  if (!result.ok) throw new Error(`deriveNonce failed: ${result.error.code}`);
  return result.value;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

describe('nonce derivation', () => {
  // Feature: screech-protocol, Property 13: Nonce derivation
  // **Validates: Requirements 8.3, 12.6**
  it('returns senderId || counter (big-endian) || six zero bytes', () => {
    fc.assert(
      fc.property(senderIdArb, counterArb, (senderId, counter) => {
        const nonce = nonceOf(senderId, counter);
        const expected = new Uint8Array(12);
        expected.set(senderId, 0);
        expected[4] = Math.floor(counter / 256);
        expected[5] = counter % 256;
        expect(nonce.length).toBe(12);
        expect(toHex(nonce)).toBe(toHex(expected));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: screech-protocol, Property 13: Nonce derivation
  // **Validates: Requirements 8.3, 12.6**
  it('gives different nonces for different pairs and equal nonces for the same pair', () => {
    fc.assert(
      fc.property(
        senderIdArb,
        counterArb,
        senderIdArb,
        counterArb,
        (idA, counterA, idB, counterB) => {
          const a = toHex(nonceOf(idA, counterA));
          const b = toHex(nonceOf(idB, counterB));
          const samePair = toHex(idA) === toHex(idB) && counterA === counterB;
          expect(a === b).toBe(samePair);
          expect(toHex(nonceOf(idA, counterA))).toBe(a);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
