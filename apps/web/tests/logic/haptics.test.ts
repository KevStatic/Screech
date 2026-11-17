import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { hapticPattern, HAPTIC_PATTERNS, type HapticScreen } from '../../src/logic/haptics';

const screens: readonly HapticScreen[] = ['reveal', 'garbled', 'sealed'];

describe('hapticPattern', () => {
  it('returns the specified pattern per screen', () => {
    const ctx = { supported: true, reducedMotion: false };
    expect(hapticPattern('reveal', ctx)).toEqual([60, 40, 120]);
    expect(hapticPattern('garbled', ctx)).toEqual([40, 30, 40]);
    expect(hapticPattern('sealed', ctx)).toEqual([200]);
  });
  it('is silent when vibration is unsupported', () => {
    for (const s of screens) {
      expect(hapticPattern(s, { supported: false, reducedMotion: false })).toBeNull();
    }
  });
  it('is silent under reduced motion or Exorcise', () => {
    for (const s of screens) {
      expect(hapticPattern(s, { supported: true, reducedMotion: true })).toBeNull();
    }
  });
  it('property: pattern only when supported and not reduced', () => {
    fc.assert(
      fc.property(fc.constantFrom(...screens), fc.boolean(), fc.boolean(), (s, supported, reducedMotion) => {
        const out = hapticPattern(s, { supported, reducedMotion });
        expect(out).toEqual(supported && !reducedMotion ? HAPTIC_PATTERNS[s] : null);
      }),
    );
  });
});
