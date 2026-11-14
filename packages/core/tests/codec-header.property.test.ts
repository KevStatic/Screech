import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decode } from '../src/codec.js';
import { anyBytesArb } from './arbitraries.js';
import { NUM_RUNS, classifyHeader } from './helpers.js';
import type { HeaderErrorCode } from './helpers.js';

const HEADER_ERRORS: ReadonlySet<string> = new Set<HeaderErrorCode>([
  'truncated',
  'bad-magic',
  'unsupported-version',
  'unknown-type',
  'reserved-flags',
]);

describe('codec header properties', () => {
  // Feature: screech-protocol, Property 2: Header validation matches the reference model
  // **Validates: Requirements 1.2, 1.3, 1.4, 2.2, 2.4**
  it('Property 2: decode header validation matches the reference classifier', () => {
    fc.assert(
      fc.property(anyBytesArb, (bytes) => {
        const expected = classifyHeader(bytes);
        const result = decode(bytes);
        if (expected !== null) {
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.error.code).toBe(expected);
        } else if (!result.ok) {
          expect(HEADER_ERRORS.has(result.error.code)).toBe(false);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
