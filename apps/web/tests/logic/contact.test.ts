import { describe, it, expect } from 'vitest';
import {
  FIELD_SEPARATOR as S,
  buildContactText,
  parseContactText,
  sanitizeField,
} from '../../src/logic/contact';
import { buildVCard, escapeVCardText } from '../../src/logic/vcard';

describe('contact text', () => {
  it('name only: no separators', () => {
    const t = buildContactText({ name: 'Ada', phone: '', email: '' });
    expect(t).toBe('Ada');
    expect(parseContactText(t)).toEqual({ ok: true, fields: { name: 'Ada', phone: '', email: '' } });
  });

  it('name and phone only', () => {
    const t = buildContactText({ name: 'Ada', phone: '555', email: '' });
    expect(t).toBe(`Ada${S}555`);
  });

  it('name and email only keeps the empty phone slot', () => {
    const t = buildContactText({ name: 'Ada', phone: '', email: 'a@b.c' });
    expect(t).toBe(`Ada${S}${S}a@b.c`);
    expect(parseContactText(t)).toEqual({
      ok: true,
      fields: { name: 'Ada', phone: '', email: 'a@b.c' },
    });
  });

  it('all three fields', () => {
    const f = { name: 'Ada', phone: '555', email: 'a@b.c' };
    expect(parseContactText(buildContactText(f))).toEqual({ ok: true, fields: f });
  });

  it('empty name builds text that parses as unreadable', () => {
    expect(parseContactText(buildContactText({ name: '', phone: '1', email: '' }))).toEqual({ ok: false });
  });

  it('maximum-length field survives the round trip', () => {
    const name = 'n'.repeat(140);
    expect(parseContactText(buildContactText({ name, phone: '', email: '' }))).toEqual({
      ok: true,
      fields: { name, phone: '', email: '' },
    });
  });

  it('sanitises separator and newlines to single spaces', () => {
    expect(sanitizeField(`a${S}b\nc\rd\r\ne`)).toBe('a b c d  e');
    const t = buildContactText({ name: `A${S}B`, phone: '1\n2', email: 'x\ry' });
    expect(t).toBe(`A B${S}1 2${S}x y`);
  });

  it('unparseable text', () => {
    expect(parseContactText('')).toEqual({ ok: false });
    expect(parseContactText('   ')).toEqual({ ok: false });
    expect(parseContactText(`${S}555`)).toEqual({ ok: false });
    expect(parseContactText(`a${S}b${S}c${S}d`)).toEqual({ ok: false });
  });
});

describe('vCard', () => {
  it('name only omits TEL and EMAIL', () => {
    expect(buildVCard({ name: 'Ada', phone: '', email: '' })).toBe(
      'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Ada\r\nEND:VCARD\r\n',
    );
  });

  it('includes TEL and EMAIL when present', () => {
    expect(buildVCard({ name: 'Ada', phone: '555', email: 'a@b.c' })).toBe(
      'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Ada\r\nTEL:555\r\nEMAIL:a@b.c\r\nEND:VCARD\r\n',
    );
  });

  it('each optional field alone', () => {
    expect(buildVCard({ name: 'A', phone: '1', email: '' })).not.toContain('EMAIL');
    expect(buildVCard({ name: 'A', phone: '', email: 'e' })).not.toContain('TEL');
  });

  it('escapes special characters and newlines', () => {
    expect(escapeVCardText('a\\b,c;d\r\ne\rf\ng')).toBe('a\\\\b\\,c\\;d\\ne\\nf\\ng');
    expect(buildVCard({ name: 'Lee, Ann;', phone: '', email: '' })).toContain('FN:Lee\\, Ann\\;\r\n');
  });
});
