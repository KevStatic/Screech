import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parseExorcise, serializeExorcise, resolveReducedMotion } from '../../src/logic/motion';

describe('motion properties', () => {
  /**
   * Feature: spirit-box-app, Property 24: Exorcise storage parsing
   * **Validates: Requirements 3.4, 3.5**
   */
  it('Feature: spirit-box-app, Property 24: parseExorcise is true only for "1"', () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.constant(null), fc.constant(undefined), fc.constant('1')), (raw) => {
        expect(parseExorcise(raw)).toBe(raw === '1');
      }),
      { numRuns: 200 },
    );
  });

  it('Feature: spirit-box-app, Property 24: serialize then parse round-trips', () => {
    fc.assert(
      fc.property(fc.boolean(), (b) => {
        expect(parseExorcise(serializeExorcise(b))).toBe(b);
      }),
      { numRuns: 100 },
    );
  });

  it('Feature: spirit-box-app, Property 24: reduced motion is toggle OR system', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (t, s) => {
        expect(resolveReducedMotion(t, s)).toBe(t || s);
        if (s) expect(resolveReducedMotion(t, s)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
