import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildVCard, escapeVCardText } from '../../src/logic/vcard';
import { contactFields, fieldString } from './arbitraries';

const RUNS = { numRuns: 200 };

/** Test-side RFC 6350 unescape for `\\`, `\,`, `\;` and `\n`. */
function unescapeVCardText(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i++) {
    const ch = value[i] as string;
    if (ch === '\\' && i + 1 < value.length) {
      const next = value[i + 1] as string;
      out += next === 'n' || next === 'N' ? '\n' : next;
      i++;
    } else {
      out += ch;
    }
  }
  return out;
}

describe('vCard properties', () => {
  it('Feature: spirit-box-app, Property 5: vCard structure', () => {
    // **Validates: Requirements 6.5, 6.7**
    fc.assert(
      fc.property(contactFields, (f) => {
        const v = buildVCard(f);
        expect(v.endsWith('\r\n')).toBe(true);
        const lines = v.slice(0, -2).split('\r\n');
        expect(v.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);

        const expected = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${escapeVCardText(f.name)}`];
        if (f.phone !== '') expected.push(`TEL:${escapeVCardText(f.phone)}`);
        if (f.email !== '') expected.push(`EMAIL:${escapeVCardText(f.email)}`);
        expected.push('END:VCARD');
        expect(lines).toEqual(expected);
      }),
      RUNS,
    );
  });

  it('Feature: spirit-box-app, Property 6: vCard text escaping round trip', () => {
    // **Validates: Requirements 6.6**
    fc.assert(
      fc.property(fieldString, (value) => {
        const escaped = escapeVCardText(value);
        expect(escaped).not.toMatch(/[\r\n]/);
        expect(unescapeVCardText(escaped)).toBe(value.replace(/\r\n|\r|\n/g, '\n'));
      }),
      RUNS,
    );
  });
});
