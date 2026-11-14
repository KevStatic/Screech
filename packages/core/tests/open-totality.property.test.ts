import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { open } from '../src/seal.js';
import { anyBytesArb, anythingArb, keyArb } from './arbitraries.js';
import { NUM_RUNS, classifyHeader } from './helpers.js';
import type { HeaderErrorCode } from './helpers.js';

const HEADER_ERRORS: ReadonlySet<string> = new Set<HeaderErrorCode>([
  'truncated',
  'bad-magic',
  'unsupported-version',
  'unknown-type',
  'reserved-flags',
]);

/** Calls `open` with values the type system would reject. */
function openUnchecked(packet: unknown, key: unknown) {
  return open(packet as Uint8Array, key as Uint8Array | undefined);
}

/** A packet of at least 17 bytes with a valid sealed header (0xC1, type 0..5, sealed bit set). */
const sealedPacketArb: fc.Arbitrary<Uint8Array> = fc
  .tuple(
    fc.integer({ min: 0, max: 5 }),
    fc.integer({ min: 0, max: 7 }),
    fc.uint8Array({ minLength: 14, maxLength: 60 }),
  )
  .map(([type, flags, rest]) => {
    const out = new Uint8Array(3 + rest.length);
    out[0] = 0xc1;
    out[1] = type;
    out[2] = flags | 0x01;
    out.set(rest, 3);
    return out;
  });

/** Room keys that are not a 16-byte Uint8Array. `null` and `undefined` mean "no key" and are excluded. */
const badKeyArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.uint8Array({ minLength: 0, maxLength: 40 }).filter((k) => k.length !== 16),
  anythingArb.filter(
    (v) => v !== null && v !== undefined && !(v instanceof Uint8Array && v.length === 16),
  ),
);

describe('open totality and validation properties', () => {
  // Feature: screech-protocol, Property 2: Header validation matches the reference model
  // **Validates: Requirements 1.2, 1.3, 1.4, 2.2, 2.4**
  it('Property 2: open header errors match the reference classifier and never auth-failed', async () => {
    await fc.assert(
      fc.asyncProperty(anyBytesArb, fc.option(keyArb, { nil: undefined }), async (bytes, key) => {
        const expected = classifyHeader(bytes);
        const result = await open(bytes, key);
        if (expected !== null) {
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.error.code).toBe(expected);
            expect(result.error.code).not.toBe('auth-failed');
          }
        } else if (!result.ok) {
          // A valid header can still give `truncated` for a sealed packet under 17 bytes.
          if (result.error.code !== 'truncated') {
            expect(HEADER_ERRORS.has(result.error.code)).toBe(false);
          }
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: screech-protocol, Property 18: Sealer and Opener argument validation
  // **Validates: Requirements 8.9**
  it('Property 18: open resolves to invalid-key for a key that is not a 16-byte Uint8Array', async () => {
    await fc.assert(
      fc.asyncProperty(sealedPacketArb, badKeyArb, async (packet, key) => {
        const result = await openUnchecked(packet, key);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe('invalid-key');
        expect('value' in result).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: screech-protocol, Property 20: Totality
  // **Validates: Requirements 10.8, 10.11, 12.5**
  it('Property 20: open resolves for 0 to 300 byte arrays', async () => {
    await fc.assert(
      fc.asyncProperty(anyBytesArb, fc.option(keyArb, { nil: undefined }), async (bytes, key) => {
        const result = await open(bytes, key);
        expect(typeof result.ok).toBe('boolean');
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: screech-protocol, Property 20: Totality
  // **Validates: Requirements 10.8, 10.11, 12.5**
  it('Property 20: open resolves for arbitrary values as either argument', async () => {
    await fc.assert(
      fc.asyncProperty(anythingArb, anythingArb, async (packet, key) => {
        const result = await openUnchecked(packet, key);
        expect(typeof result.ok).toBe('boolean');
        if (!(packet instanceof Uint8Array)) {
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.error.code).toBe('invalid-payload');
            if (result.error.code === 'invalid-payload') expect(result.error.field).toBe('packet');
          }
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
