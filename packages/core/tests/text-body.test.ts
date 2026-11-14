import { describe, expect, it } from 'vitest';
import { decodeTextBody, encodeTextBody } from '../src/text-body.js';

function encoded(text: string): number[] {
  const r = encodeTextBody(text);
  if (!r.ok) throw new Error(`expected ok, got ${r.error.code}`);
  expect(r.value.compressed).toBe(false);
  return Array.from(r.value.body);
}

function decoded(bytes: number[]): string {
  const r = decodeTextBody(false, Uint8Array.from(bytes));
  if (!r.ok) throw new Error(`expected ok, got ${r.error.code}`);
  return r.value;
}

describe('encodeTextBody', () => {
  it('encodes representative text, contact, checkin and hunt-clue strings as UTF-8', () => {
    expect(encoded('Hello')).toEqual([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
    expect(encoded('BEGIN:VCARD')).toEqual(Array.from(new TextEncoder().encode('BEGIN:VCARD')));
    expect(encoded('ROOM-42')).toEqual([0x52, 0x4f, 0x4f, 0x4d, 0x2d, 0x34, 0x32]);
    expect(encoded('Find the clock')).toEqual(Array.from(new TextEncoder().encode('Find the clock')));
  });

  it('encodes multi-byte characters', () => {
    expect(encoded('é')).toEqual([0xc3, 0xa9]);
    expect(encoded('€')).toEqual([0xe2, 0x82, 0xac]);
    expect(encoded('👻')).toEqual([0xf0, 0x9f, 0x91, 0xbb]);
  });

  it('preserves U+0000 and U+FEFF', () => {
    expect(encoded('a\u0000b')).toEqual([0x61, 0x00, 0x62]);
    expect(encoded('\uFEFFa')).toEqual([0xef, 0xbb, 0xbf, 0x61]);
  });

  it('rejects empty text with invalid-payload on field text', () => {
    const r = encodeTextBody('');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('invalid-payload');
      if (r.error.code === 'invalid-payload') expect(r.error.field).toBe('text');
    }
  });

  it('rejects a lone surrogate with invalid-payload on field text', () => {
    for (const s of ['\uD800', 'a\uDC00b', 'x\uD83D']) {
      const r = encodeTextBody(s);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error.code).toBe('invalid-payload');
        if (r.error.code === 'invalid-payload') expect(r.error.field).toBe('text');
      }
    }
  });
});

describe('decodeTextBody', () => {
  it('decodes ASCII and multi-byte text', () => {
    expect(decoded([0x48, 0x69])).toBe('Hi');
    expect(decoded([0xc3, 0xa9])).toBe('é');
    expect(decoded([0xf0, 0x9f, 0x91, 0xbb])).toBe('👻');
  });

  it('preserves U+0000 and U+FEFF', () => {
    expect(decoded([0x61, 0x00, 0x62])).toBe('a\u0000b');
    expect(decoded([0xef, 0xbb, 0xbf, 0x61])).toBe('\uFEFFa');
  });

  it('rejects the compressed flag with invalid-body', () => {
    const r = decodeTextBody(true, Uint8Array.from([0x61]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid-body');
  });

  it('rejects an empty body with invalid-body', () => {
    const r = decodeTextBody(false, new Uint8Array(0));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid-body');
  });

  it('rejects invalid UTF-8 with invalid-body', () => {
    const cases = [[0xff], [0xc3], [0xc0, 0x80], [0xed, 0xa0, 0x80], [0xf0, 0x9f, 0x91]];
    for (const bytes of cases) {
      const r = decodeTextBody(false, Uint8Array.from(bytes));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe('invalid-body');
    }
  });

  it('round-trips encoded text', () => {
    const text = 'Wi-Fi 👻 é\u0000\uFEFF';
    expect(decoded(encoded(text))).toBe(text);
  });
});
