import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decode } from '../src/codec.js';
import { open } from '../src/seal.js';
import { NUM_RUNS } from './helpers.js';

const FLAG_SEALED = 0x01;

/** Flags byte with only defined bits (compressed, multipart) plus the given sealed bit. */
function flagsArb(sealed: boolean): fc.Arbitrary<number> {
  return fc.integer({ min: 0, max: 3 }).map((bits) => (bits << 1) | (sealed ? FLAG_SEALED : 0));
}

/** Bytes that pass the header checks: magic/version 0xC1, known type, no reserved flags. */
function headerValidArb(sealed: boolean, minLength: number, maxLength: number): fc.Arbitrary<Uint8Array> {
  return fc
    .tuple(
      fc.integer({ min: 0, max: 5 }),
      flagsArb(sealed),
      fc.uint8Array({ minLength: Math.max(0, minLength - 3), maxLength: maxLength - 3 }),
    )
    .map(([type, flags, tail]) => {
      const out = new Uint8Array(3 + tail.length);
      out[0] = 0xc1;
      out[1] = type;
      out[2] = flags;
      out.set(tail, 3);
      return out;
    });
}

const subtleMethods = ['importKey', 'encrypt', 'decrypt', 'digest', 'deriveKey', 'deriveBits'] as const;

afterEach(() => {
  vi.restoreAllMocks();
});

// Feature: screech-protocol, Property 17: Sealed-flag routing
// **Validates: Requirements 8.8, 8.10, 8.16, 8.17**
describe('Property 17: Sealed-flag routing', () => {
  it('open resolves to not-sealed when the sealed flag is clear', async () => {
    await fc.assert(
      fc.asyncProperty(
        headerValidArb(false, 3, 140),
        fc.option(fc.uint8Array({ minLength: 16, maxLength: 16 }), { nil: undefined }),
        async (bytes, key) => {
          const result = await open(bytes, key);
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.error.code).toBe('not-sealed');
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('open resolves to truncated for sealed packets under 17 bytes, without calling Web Crypto', async () => {
    const spies = subtleMethods.map((name) => vi.spyOn(crypto.subtle, name));
    try {
      await fc.assert(
        fc.asyncProperty(
          headerValidArb(true, 3, 16),
          fc.option(fc.uint8Array({ minLength: 16, maxLength: 16 }), { nil: undefined }),
          async (bytes, key) => {
            const result = await open(bytes, key);
            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.error.code).toBe('truncated');
          },
        ),
        { numRuns: NUM_RUNS },
      );
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });

  it('decode returns key-required for any sealed packet', () => {
    fc.assert(
      fc.property(headerValidArb(true, 3, 140), (bytes) => {
        const result = decode(bytes);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe('key-required');
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('open resolves to key-required for sealed packets of 17+ bytes with an undefined or null key', async () => {
    await fc.assert(
      fc.asyncProperty(
        headerValidArb(true, 17, 140),
        fc.constantFrom<undefined | null>(undefined, null),
        async (bytes, key) => {
          const result = await open(bytes, key as undefined);
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.error.code).toBe('key-required');
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
