import { describe, expect, it } from 'vitest';
import { validateAttendeeName, validateTitle } from '../src/attendee-name';

const cases = [
  { label: 'validateAttendeeName', fn: validateAttendeeName, max: 32 },
  { label: 'validateTitle', fn: validateTitle, max: 60 },
] as const;

for (const { label, fn, max } of cases) {
  describe(label, () => {
    it('rejects the empty string (0)', () => {
      expect(fn('').ok).toBe(false);
    });

    it('rejects whitespace only', () => {
      expect(fn('   \t ').ok).toBe(false);
    });

    it(`accepts 1 and ${max} characters`, () => {
      expect(fn('a')).toEqual({ ok: true, value: 'a' });
      const s = 'x'.repeat(max);
      expect(fn(s)).toEqual({ ok: true, value: s });
    });

    it(`rejects ${max + 1} characters and names the field`, () => {
      const res = fn('x'.repeat(max + 1));
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.code).toBe('invalid-payload');
    });

    it('returns the trimmed value', () => {
      expect(fn('  Ada  ')).toEqual({ ok: true, value: 'Ada' });
    });

    it('counts trimmed length, not raw length', () => {
      const s = 'x'.repeat(max);
      expect(fn(`  ${s}  `)).toEqual({ ok: true, value: s });
    });

    it('counts Unicode code points, not UTF-16 units', () => {
      const ok = '\u{1F47B}'.repeat(max);
      expect(fn(ok)).toEqual({ ok: true, value: ok });
      expect(fn('\u{1F47B}'.repeat(max + 1)).ok).toBe(false);
    });

    it('rejects non-string input without throwing', () => {
      for (const v of [null, undefined, 42, {}, [], true]) {
        expect(fn(v).ok).toBe(false);
      }
    });
  });
}
