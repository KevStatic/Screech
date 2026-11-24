import { describe, expect, it } from 'vitest';
import { decode } from '../src/codec.js';
import {
  CLUE_SEPARATOR,
  buildClue,
  buildClueText,
  parseClueText,
  sanitizeClueText,
  validateClueFields,
} from '../src/hunt-clue.js';
import type { ClueFieldsInput } from '../src/hunt-clue.js';

const good = { huntId: 'ABC234', index: 2, total: 5, name: 'Ada', clue: 'Look under the clock' };

function failField(input: ClueFieldsInput): string {
  const r = validateClueFields(input);
  if (r.ok) throw new Error('expected failure');
  if (r.error.code !== 'invalid-payload') throw new Error(`unexpected code ${r.error.code}`);
  return r.error.field;
}

describe('validateClueFields: one error per field', () => {
  it('accepts good fields', () => {
    expect(validateClueFields(good)).toEqual({ ok: true, value: good });
  });

  it('rejects a bad huntId', () => {
    expect(failField({ ...good, huntId: 'ABC23' })).toBe('huntId');
    expect(failField({ ...good, huntId: 'ABC230' })).toBe('huntId'); // 0 not in alphabet
    expect(failField({ ...good, huntId: 42 })).toBe('huntId');
  });

  it('rejects a bad total', () => {
    expect(failField({ ...good, total: 2 })).toBe('total');
    expect(failField({ ...good, total: 8 })).toBe('total');
    expect(failField({ ...good, total: 4.5 })).toBe('total');
  });

  it('rejects a bad index', () => {
    expect(failField({ ...good, index: 0 })).toBe('index');
    expect(failField({ ...good, index: 6 })).toBe('index');
    expect(failField({ ...good, index: '2' })).toBe('index');
  });

  it('rejects a bad name', () => {
    expect(failField({ ...good, name: '   ' })).toBe('name');
    expect(failField({ ...good, name: 7 })).toBe('name');
    expect(failField({ ...good, name: '\ud800' })).toBe('name');
  });

  it('rejects a bad clue', () => {
    expect(failField({ ...good, clue: '' })).toBe('clue');
    expect(failField({ ...good, clue: null })).toBe('clue');
    expect(failField({ ...good, clue: 'x\ud800' })).toBe('clue');
  });
});

describe('name byte limit', () => {
  it('accepts 24 bytes and rejects 25', () => {
    expect(validateClueFields({ ...good, name: 'a'.repeat(24) }).ok).toBe(true);
    const r = validateClueFields({ ...good, name: 'a'.repeat(25) });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('invalid-payload');
      expect(r.error.message).toContain('25/24');
    }
  });

  it('counts bytes, not characters', () => {
    // 12 x 2-byte chars = 24 bytes; 13 = 26 bytes
    expect(validateClueFields({ ...good, name: 'é'.repeat(12) }).ok).toBe(true);
    expect(failField({ ...good, name: 'é'.repeat(13) })).toBe('name');
  });
});

describe('packet size boundary', () => {
  // Packet = 3 + 6 (id) + 2 (digits) + name + 1 (separator) + clue
  const base = { ...good, name: 'AB' };

  it('builds a 140-byte packet', () => {
    const r = buildClue({ ...base, clue: 'x'.repeat(126) });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.length).toBe(140);
  });

  it('refuses a 141-byte packet with too-large', () => {
    const r = buildClue({ ...base, clue: 'x'.repeat(127) });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('too-large');
      if (r.error.code === 'too-large') expect(r.error.length).toBe(141);
    }
  });

  it('counts multi-byte clue characters as bytes', () => {
    // 63 x 2 bytes = 126 bytes fits; 64 x 2 = 128 does not
    expect(buildClue({ ...base, clue: 'é'.repeat(63) }).ok).toBe(true);
    const r = buildClue({ ...base, clue: 'é'.repeat(64) });
    expect(!r.ok && r.error.code).toBe('too-large');
  });
});

describe('sanitising', () => {
  it('replaces each control character with one space, then trims', () => {
    expect(sanitizeClueText('a\tb')).toBe('a b');
    expect(sanitizeClueText('a\r\nb')).toBe('a  b');
    expect(sanitizeClueText('a\u007fb')).toBe('a b');
    expect(sanitizeClueText('\nabc\t')).toBe('abc');
  });

  it('strips the separator from fields so the layout stays parseable', () => {
    const r = validateClueFields({ ...good, clue: `one${CLUE_SEPARATOR}two` });
    expect(r.ok && r.value.clue).toBe('one two');
  });

  it('returns an empty string for non-strings', () => {
    expect(sanitizeClueText(5 as unknown as string)).toBe('');
  });
});

describe('build and parse', () => {
  it('lays out text as id, index, total, name, separator, clue', () => {
    expect(buildClueText(good)).toBe('ABC23425Ada\u001fLook under the clock');
  });

  it('round-trips through encode, decode and parse, including multi-byte text', () => {
    const fields = { ...good, name: 'Zoë 👻', clue: 'Cherchez près de la fenêtre 窓' };
    const packet = buildClue(fields);
    expect(packet.ok).toBe(true);
    if (!packet.ok) return;
    const decoded = decode(packet.value);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.multipart).toBe(false);
    if (decoded.value.multipart) return;
    expect(decoded.value.payload).toEqual({ type: 'hunt-clue', text: buildClueText(fields) });
    expect(parseClueText(buildClueText(fields))).toEqual({ ok: true, value: fields });
  });
});

describe('parseClueText rejects malformed text with invalid-body', () => {
  const cases: Array<[string, unknown]> = [
    ['non-string', 5],
    ['empty', ''],
    ['header only', 'ABC23425'],
    ['non-digit index', 'ABC234xxAda\u001fhi'],
    ['no separator', 'ABC23425Ada hi'],
    ['two separators', 'ABC23425Ada\u001fhi\u001fthere'],
    ['bad hunt id', 'ABC03425Ada\u001fhi'],
    ['total out of range', 'ABC23412Ada\u001fhi'],
    ['empty name', 'ABC23425\u001fhi'],
    ['empty clue', 'ABC23425Ada\u001f'],
    ['untrimmed clue', 'ABC23425Ada\u001f hi'],
    ['control char in clue', 'ABC23425Ada\u001fh\ti'],
  ];
  for (const [label, text] of cases) {
    it(label, () => {
      const r = parseClueText(text);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe('invalid-body');
    });
  }
});
