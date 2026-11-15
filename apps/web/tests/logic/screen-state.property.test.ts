import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { screenState } from '../../src/logic/screen-state';
import { decodedResult } from './arbitraries';

const KINDS = ['ignore', 'reveal', 'garbled', 'pact-required'];

// Feature: spirit-box-app, Property 19: Screen state mapping
// **Validates: Requirements 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.9, 12.10**
describe('Property 19: Screen state mapping', () => {
  it('maps every decode result to exactly one screen kind per the rules', () => {
    fc.assert(
      fc.property(decodedResult, (result) => {
        const state = screenState(result);
        expect(KINDS).toContain(state.kind);
        expect(screenState(result)).toEqual(state);

        if (result.ok) {
          if (result.value.multipart) {
            expect(state).toEqual({ kind: 'ignore' });
          } else {
            expect(state.kind).toBe('reveal');
            if (state.kind === 'reveal') expect(state.packet).toBe(result.value);
          }
        } else if (result.error.code === 'invalid-body') {
          expect(state).toEqual({ kind: 'garbled' });
        } else if (result.error.code === 'key-required') {
          expect(state).toEqual({ kind: 'pact-required' });
        } else {
          expect(state).toEqual({ kind: 'ignore' });
        }
      }),
      { numRuns: 200 },
    );
  });

  it('ignores the five room-noise error codes', () => {
    const noise = ['bad-magic', 'unsupported-version', 'truncated', 'unknown-type', 'reserved-flags'] as const;
    for (const code of noise) {
      expect(screenState({ ok: false, error: { code, message: 'x' } })).toEqual({ kind: 'ignore' });
    }
  });
});
