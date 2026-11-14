import { describe, expect, it } from 'vitest';
import { decodeUrlBody, encodeUrlBody } from '../src/url-body.js';

const utf8 = (s: string): number[] => Array.from(new TextEncoder().encode(s));

function encoded(url: string): number[] {
  const r = encodeUrlBody(url);
  if (!r.ok) throw new Error(`expected ok, got ${r.error.code}`);
  expect(r.value.compressed).toBe(true);
  return Array.from(r.value.body);
}

describe('encodeUrlBody', () => {
  it('compresses https://github.com/ with code 0x02 and scheme byte 0x82', () => {
    expect(encoded('https://github.com/ItzKev/Screech')).toEqual([0x82, ...utf8('ItzKev/Screech')]);
  });

  it('uses scheme byte 0x00 for http:// with no matching prefix', () => {
    expect(encoded('http://example.com/a')).toEqual([0x00, ...utf8('example.com/a')]);
  });

  it('normalizes a mixed-case scheme to lowercase', () => {
    expect(encoded('HtTpS://github.com/x')).toEqual([0x82, ...utf8('x')]);
    expect(encoded('HTTP://example.com')).toEqual([0x00, ...utf8('example.com')]);
    expect(decodeUrlBody(true, Uint8Array.from(encoded('HtTpS://example.com')))).toEqual({
      ok: true,
      value: 'https://example.com',
    });
  });

  it('leaves an uppercase host uncompressed', () => {
    expect(encoded('http://WWW.example.com')).toEqual([0x00, ...utf8('WWW.example.com')]);
    expect(encoded('https://GitHub.com/x')).toEqual([0x80, ...utf8('GitHub.com/x')]);
  });

  it('rejects a payload with no http(s) scheme', () => {
    const r = encodeUrlBody('ftp://example.com');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid-payload');
  });
});

describe('decodeUrlBody', () => {
  it('expands the scheme byte and prefix', () => {
    expect(decodeUrlBody(true, Uint8Array.from([0x82, ...utf8('ItzKev/Screech')]))).toEqual({
      ok: true,
      value: 'https://github.com/ItzKev/Screech',
    });
    expect(decodeUrlBody(true, Uint8Array.from([0x00, ...utf8('example.com/a')]))).toEqual({
      ok: true,
      value: 'http://example.com/a',
    });
  });

  it('accepts a literal URL when the compressed flag is clear', () => {
    expect(decodeUrlBody(false, Uint8Array.from(utf8('https://example.com/x')))).toEqual({
      ok: true,
      value: 'https://example.com/x',
    });
  });

  it('rejects a literal body with no scheme as invalid-body', () => {
    const r = decodeUrlBody(false, Uint8Array.from(utf8('example.com/x')));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid-body');
  });

  it('rejects undefined prefix code 0x11 as invalid-body', () => {
    for (const byte of [0x11, 0x91]) {
      const r = decodeUrlBody(true, Uint8Array.from([byte, ...utf8('x')]));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe('invalid-body');
    }
  });

  it('rejects an empty body as invalid-body', () => {
    for (const compressed of [true, false]) {
      const r = decodeUrlBody(compressed, new Uint8Array(0));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe('invalid-body');
    }
  });
});
