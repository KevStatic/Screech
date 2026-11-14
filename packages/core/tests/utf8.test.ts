import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decodeUtf8Strict, encodeUtf8Strict, hasLoneSurrogate } from '../src/utf8.js';
import { stringWithLoneSurrogateArb } from './arbitraries.js';
import { NUM_RUNS } from './helpers.js';

describe('hasLoneSurrogate', () => {
  it('detects lone high and low surrogates', () => {
    expect(hasLoneSurrogate('\ud800')).toBe(true);
    expect(hasLoneSurrogate('\udc00')).toBe(true);
    expect(hasLoneSurrogate('a\ud83d')).toBe(true);
    expect(hasLoneSurrogate('\udc00\ud800')).toBe(true);
  });

  it('accepts valid pairs and plain strings', () => {
    expect(hasLoneSurrogate('')).toBe(false);
    expect(hasLoneSurrogate('abc')).toBe(false);
    expect(hasLoneSurrogate('\ud83d\ude00')).toBe(false);
  });
});

describe('encodeUtf8Strict', () => {
  it('keeps U+FEFF', () => {
    expect(Array.from(encodeUtf8Strict('\ufeffa') as Uint8Array)).toEqual([0xef, 0xbb, 0xbf, 0x61]);
  });

  it('keeps U+0000', () => {
    expect(Array.from(encodeUtf8Strict('a\u0000b') as Uint8Array)).toEqual([0x61, 0x00, 0x62]);
  });

  it('rejects a lone surrogate', () => {
    expect(encodeUtf8Strict('\ud800')).toBeNull();
    expect(encodeUtf8Strict('ok\udfff')).toBeNull();
  });

  it('rejects any string from stringWithLoneSurrogateArb', () => {
    fc.assert(
      fc.property(stringWithLoneSurrogateArb, (s) => encodeUtf8Strict(s) === null),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('decodeUtf8Strict', () => {
  it('keeps a leading U+FEFF', () => {
    expect(decodeUtf8Strict(new Uint8Array([0xef, 0xbb, 0xbf, 0x61]))).toBe('\ufeffa');
  });

  it('keeps U+0000', () => {
    expect(decodeUtf8Strict(new Uint8Array([0x61, 0x00, 0x62]))).toBe('a\u0000b');
  });

  it('decodes empty input to the empty string', () => {
    expect(decodeUtf8Strict(new Uint8Array(0))).toBe('');
  });

  it('rejects invalid byte sequences', () => {
    const invalid: number[][] = [
      [0xff],
      [0xc0, 0x80], // overlong NUL
      [0xc3], // truncated 2-byte sequence
      [0x80], // lone continuation byte
      [0xed, 0xa0, 0x80], // encoded surrogate U+D800
      [0xf4, 0x90, 0x80, 0x80], // above U+10FFFF
    ];
    for (const bytes of invalid) {
      expect(decodeUtf8Strict(new Uint8Array(bytes))).toBeNull();
    }
  });
});

describe('UTF-8 round trip', () => {
  // Feature: screech-protocol, Property 3: Unsealed round trip
  // Feature: screech-protocol, Property 10: Text-like bodies must be valid UTF-8
  // **Validates: Requirements 4.2, 4.3, 7.3, 7.5**
  it('strict encode then strict decode returns the original string', () => {
    fc.assert(
      fc.property(fc.fullUnicodeString({ maxLength: 200 }), (s) => {
        expect(hasLoneSurrogate(s)).toBe(false);
        const bytes = encodeUtf8Strict(s);
        expect(bytes).not.toBeNull();
        expect(decodeUtf8Strict(bytes as Uint8Array)).toBe(s);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('round-trips strings that start with U+FEFF or contain U+0000', () => {
    fc.assert(
      fc.property(fc.fullUnicodeString({ maxLength: 50 }), (s) => {
        const t = '\ufeff' + s + '\u0000';
        const bytes = encodeUtf8Strict(t);
        expect(decodeUtf8Strict(bytes as Uint8Array)).toBe(t);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
