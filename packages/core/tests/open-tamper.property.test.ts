import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { open, seal } from '../src/seal.js';
import { counterArb, keyArb, payloadArb, senderIdArb } from './arbitraries.js';
import { NUM_RUNS } from './helpers.js';

describe('open tamper detection (property)', () => {
  // Feature: screech-protocol, Property 15: Tampering is detected
  // **Validates: Requirements 8.6, 12.2**
  it('flipping any single bit of a sealed packet makes open resolve to an error', async () => {
    let tested = 0;
    await fc.assert(
      fc.asyncProperty(
        payloadArb,
        keyArb,
        senderIdArb,
        counterArb,
        fc.nat(),
        async (payload, key, id, counter, bitSeed) => {
          const sealed = await seal(payload, key, id, counter);
          fc.pre(sealed.ok);
          if (!sealed.ok) return;
          const packet = sealed.value;

          // Sanity check: the untampered packet opens.
          const intact = await open(packet, key);
          expect(intact.ok).toBe(true);

          const bit = bitSeed % (packet.length * 8);
          const tampered = packet.slice();
          const index = bit >> 3;
          tampered[index] = (tampered[index] ?? 0) ^ (1 << (bit & 7));

          const result = await open(tampered, key);
          tested++;
          expect(result.ok).toBe(false);
        },
      ),
      { numRuns: NUM_RUNS },
    );
    expect(tested).toBeGreaterThan(0);
  });
});
