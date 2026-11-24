import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  layoutQr,
  QR_MIN_CSS_PX_PER_MODULE,
  QR_MIN_CSS_SIZE,
  QR_QUIET_MODULES,
} from '../../src/logic/qr-layout';

describe('qr-layout', () => {
  // Feature: ghost-hunt, Property 12: QR layout is crisp, large enough and fits
  it('Property 12: QR layout is crisp, large enough and fits', () => {
    // **Validates: Requirements 6.4, 6.6, 15.2**
    fc.assert(
      fc.property(
        fc.integer({ min: 21, max: 177 }),
        fc.double({ min: QR_MIN_CSS_SIZE, max: 1000, noNaN: true }),
        fc.double({ min: 1, max: 4, noNaN: true }),
        (n, available, dpr) => {
          const r = layoutQr(n, available, dpr);
          expect(Number.isInteger(r.modulePx)).toBe(true);
          expect(r.sizePx).toBe((n + 2 * QR_QUIET_MODULES) * r.modulePx);
          expect(r.cssSize).toBeLessThanOrEqual(available + 1e-9);
          const expectFit =
            r.modulePx / dpr >= QR_MIN_CSS_PX_PER_MODULE && r.cssSize >= QR_MIN_CSS_SIZE;
          expect(r.fits).toBe(expectFit);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('81 modules at 340 CSS px fits at device pixel ratios 1, 2 and 3', () => {
    for (const dpr of [1, 2, 3]) {
      const r = layoutQr(81, 340, dpr);
      expect(r.fits).toBe(true);
      expect(Number.isInteger(r.modulePx)).toBe(true);
    }
  });

  it('bad input does not fit', () => {
    expect(layoutQr(0, 340, 1).fits).toBe(false);
    expect(layoutQr(81, Number.NaN, 1).fits).toBe(false);
  });
});
