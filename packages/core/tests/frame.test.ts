import { describe, expect, it } from 'vitest';
import { buildFrame, parseFrame } from '../src/frame.js';
import type { PacketFlags, PacketType } from '../src/types.js';

const TYPES: readonly (readonly [PacketType, number])[] = [
  ['text', 0],
  ['url', 1],
  ['wifi', 2],
  ['contact', 3],
  ['checkin', 4],
  ['hunt-clue', 5],
];

const FLAG_COMBOS: readonly (readonly [PacketFlags, number])[] = [
  [{ sealed: false, compressed: false, multipart: false }, 0x00],
  [{ sealed: true, compressed: false, multipart: false }, 0x01],
  [{ sealed: false, compressed: true, multipart: false }, 0x02],
  [{ sealed: true, compressed: true, multipart: false }, 0x03],
  [{ sealed: false, compressed: false, multipart: true }, 0x04],
  [{ sealed: true, compressed: false, multipart: true }, 0x05],
  [{ sealed: false, compressed: true, multipart: true }, 0x06],
  [{ sealed: true, compressed: true, multipart: true }, 0x07],
];

const BODY = new Uint8Array([0xaa, 0xbb]);

function errorOf(bytes: Uint8Array): { code: string; field?: string } {
  const result = parseFrame(bytes);
  if (result.ok) throw new Error('expected an error');
  return result.error as { code: string; field?: string };
}

describe('buildFrame fixed bytes', () => {
  for (const [type, typeValue] of TYPES) {
    it(`writes 0xC1, ${typeValue}, 0x00 for type ${type}`, () => {
      const out = buildFrame(type, FLAG_COMBOS[0]![0], BODY);
      expect(Array.from(out)).toEqual([0xc1, typeValue, 0x00, 0xaa, 0xbb]);
    });
  }

  for (const [flags, flagByte] of FLAG_COMBOS) {
    it(`writes flags byte 0x0${flagByte} for ${JSON.stringify(flags)}`, () => {
      const out = buildFrame('text', flags, BODY);
      expect(Array.from(out)).toEqual([0xc1, 0x00, flagByte, 0xaa, 0xbb]);
    });
  }

  it('builds a header-only frame for an empty body', () => {
    expect(Array.from(buildFrame('url', FLAG_COMBOS[2]![0], new Uint8Array(0)))).toEqual([
      0xc1, 0x01, 0x02,
    ]);
  });
});

describe('parseFrame fixed bytes', () => {
  for (const [type, typeValue] of TYPES) {
    it(`parses type value ${typeValue} as ${type}`, () => {
      const result = parseFrame(new Uint8Array([0xc1, typeValue, 0x00, 0x41]));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.type).toBe(type);
        expect(Array.from(result.value.body)).toEqual([0x41]);
      }
    });
  }

  for (const [flags, flagByte] of FLAG_COMBOS) {
    it(`parses flags byte 0x0${flagByte}`, () => {
      const result = parseFrame(new Uint8Array([0xc1, 0x00, flagByte]));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.flags).toEqual(flags);
        expect(result.value.body.length).toBe(0);
      }
    });
  }

  it('returns a copy of the body', () => {
    const input = new Uint8Array([0xc1, 0x00, 0x00, 1, 2, 3]);
    const result = parseFrame(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      input[3] = 99;
      expect(Array.from(result.value.body)).toEqual([1, 2, 3]);
    }
  });
});

describe('parseFrame header errors', () => {
  it('returns truncated for empty input', () => {
    expect(errorOf(new Uint8Array([])).code).toBe('truncated');
  });

  it('returns truncated for 1 byte, even with wrong magic', () => {
    expect(errorOf(new Uint8Array([0x00])).code).toBe('truncated');
    expect(errorOf(new Uint8Array([0xc1])).code).toBe('truncated');
  });

  it('returns truncated for 2 bytes, even with wrong magic, version, type', () => {
    expect(errorOf(new Uint8Array([0x00, 0x00])).code).toBe('truncated');
    expect(errorOf(new Uint8Array([0xd2, 0xff])).code).toBe('truncated');
    expect(errorOf(new Uint8Array([0xc1, 0x00])).code).toBe('truncated');
  });

  it('returns bad-magic when the high nibble is not 0xC', () => {
    expect(errorOf(new Uint8Array([0x00, 0x00, 0x00])).code).toBe('bad-magic');
    expect(errorOf(new Uint8Array([0xd1, 0x00, 0x00])).code).toBe('bad-magic');
    expect(errorOf(new Uint8Array([0xf1, 0x00, 0x00])).code).toBe('bad-magic');
  });

  it('checks magic before version, type and flags', () => {
    expect(errorOf(new Uint8Array([0xd2, 0xff, 0xff])).code).toBe('bad-magic');
  });

  it('returns unsupported-version when the low nibble is not 1', () => {
    expect(errorOf(new Uint8Array([0xc0, 0x00, 0x00])).code).toBe('unsupported-version');
    expect(errorOf(new Uint8Array([0xc2, 0x00, 0x00])).code).toBe('unsupported-version');
    expect(errorOf(new Uint8Array([0xcf, 0x00, 0x00])).code).toBe('unsupported-version');
  });

  it('checks version before type and flags', () => {
    expect(errorOf(new Uint8Array([0xc2, 0xff, 0xff])).code).toBe('unsupported-version');
  });

  it('returns unknown-type for type values above 5', () => {
    expect(errorOf(new Uint8Array([0xc1, 0x06, 0x00])).code).toBe('unknown-type');
    expect(errorOf(new Uint8Array([0xc1, 0xff, 0x00])).code).toBe('unknown-type');
  });

  it('checks type before flags', () => {
    expect(errorOf(new Uint8Array([0xc1, 0x06, 0xff])).code).toBe('unknown-type');
  });

  it('returns reserved-flags when any of bits 3 to 7 is set', () => {
    for (let bit = 3; bit <= 7; bit++) {
      expect(errorOf(new Uint8Array([0xc1, 0x00, 1 << bit])).code).toBe('reserved-flags');
    }
    expect(errorOf(new Uint8Array([0xc1, 0x05, 0xff])).code).toBe('reserved-flags');
  });
});

describe('parseFrame input type', () => {
  it('returns invalid-payload with field packet for non-Uint8Array values', () => {
    const bad: unknown[] = [
      null,
      undefined,
      'abc',
      42,
      {},
      [0xc1, 0, 0],
      new Uint16Array(3),
      new ArrayBuffer(3),
    ];
    for (const value of bad) {
      const error = errorOf(value as Uint8Array);
      expect(error.code).toBe('invalid-payload');
      expect(error.field).toBe('packet');
    }
  });
});
