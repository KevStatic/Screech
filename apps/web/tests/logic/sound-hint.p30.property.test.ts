// Feature: haunting-sounds, Property 30: iOS detection
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { isIosDevice } from '../../src/logic/sound-hint';

const IOS_TOKENS = ['iPhone', 'iPad', 'iPod'] as const;

const plainUa = fc
  .string({ maxLength: 60 })
  .filter((s: string) => !/iPhone|iPad|iPod/.test(s));

const iosUa = fc
  .tuple(plainUa, fc.constantFrom(...IOS_TOKENS), plainUa)
  .map(([a, t, b]: [string, string, string]) => `${a}${t}${b}`);

const anyUa = fc.oneof(plainUa, iosUa);

const platform = fc.oneof(
  fc.constant('MacIntel'),
  fc.constantFrom('iPhone', 'Win32', 'Linux armv8l', ''),
  fc.string({ maxLength: 12 }),
);

const touch = fc.oneof(
  fc.integer({ min: -3, max: 12 }),
  fc.constantFrom(NaN, Infinity, -Infinity),
  fc.double({ noNaN: true, min: -100, max: 100 }),
);

function expected(ua: string, plat: string, pts: number): boolean {
  if (IOS_TOKENS.some((t) => ua.includes(t))) return true;
  const n = Number.isFinite(pts) ? pts : 0;
  return plat === 'MacIntel' && n > 1;
}

describe('Property 30: iOS detection', () => {
  /** **Validates: Requirements 12.7, 12.11, 12.13** */
  it('matches the spec rule for any UA, platform and touch points', () => {
    fc.assert(
      fc.property(anyUa, platform, touch, (ua: string, plat: string, pts: number) => {
        expect(isIosDevice(ua, plat, pts)).toBe(expected(ua, plat, pts));
      }),
      { numRuns: 200 },
    );
  });

  it('is true whenever the UA names an iPhone, iPad or iPod', () => {
    fc.assert(
      fc.property(iosUa, platform, touch, (ua: string, plat: string, pts: number) => {
        expect(isIosDevice(ua, plat, pts)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('treats non-finite touch points as 0 on MacIntel', () => {
    fc.assert(
      fc.property(
        plainUa,
        fc.constantFrom(NaN, Infinity, -Infinity),
        (ua: string, pts: number) => {
          expect(isIosDevice(ua, 'MacIntel', pts)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('is false for MacIntel with 0 or 1 touch points and a Mac UA', () => {
    fc.assert(
      fc.property(plainUa, fc.constantFrom(0, 1), (ua: string, pts: number) => {
        const macUa = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ${ua}`;
        expect(isIosDevice(macUa, 'MacIntel', pts)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('is true for MacIntel with more than one touch point', () => {
    fc.assert(
      fc.property(plainUa, fc.integer({ min: 2, max: 20 }), (ua: string, pts: number) => {
        expect(isIosDevice(ua, 'MacIntel', pts)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
