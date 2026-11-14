import { describe, expect, it } from 'vitest';
import { decode, encode } from '../src/codec.js';
import type { Payload } from '../src/types.js';

const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values);
const ascii = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0));

function expectEncoded(payload: Payload, expected: Uint8Array): void {
  const result = encode(payload);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(Array.from(result.value)).toEqual(Array.from(expected));
}

function expectDecoded(packet: Uint8Array, payload: Payload, compressed: boolean): void {
  const result = decode(packet);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.value.multipart).toBe(false);
  if (result.value.multipart) return;
  expect(result.value.type).toBe(payload.type);
  expect(result.value.flags).toEqual({ sealed: false, compressed, multipart: false });
  expect(result.value.payload).toEqual(payload);
}

describe('codec fixed examples (hand-written bytes)', () => {
  const cases: readonly {
    name: string;
    payload: Payload;
    packet: Uint8Array;
    compressed: boolean;
  }[] = [
    {
      name: 'text',
      payload: { type: 'text', text: 'hi' },
      packet: bytes(0xc1, 0x00, 0x00, 0x68, 0x69),
      compressed: false,
    },
    {
      name: 'url with prefix code 0x02 (github.com/)',
      payload: { type: 'url', url: 'https://github.com/a' },
      packet: bytes(0xc1, 0x01, 0x02, 0x82, 0x61),
      compressed: true,
    },
    {
      name: 'url without a prefix (http, code 0x00)',
      payload: { type: 'url', url: 'http://x.org' },
      packet: bytes(0xc1, 0x01, 0x02, 0x00, ...ascii('x.org')),
      compressed: true,
    },
    {
      name: 'wifi open',
      payload: { type: 'wifi', ssid: 'ab', password: '', security: 'open' },
      packet: bytes(0xc1, 0x02, 0x02, 0x00, 0x02, 0x61, 0x62, 0x00),
      compressed: true,
    },
    {
      name: 'wifi wpa',
      payload: { type: 'wifi', ssid: 'ab', password: 'xyz', security: 'wpa' },
      packet: bytes(0xc1, 0x02, 0x02, 0x01, 0x02, 0x61, 0x62, 0x03, 0x78, 0x79, 0x7a),
      compressed: true,
    },
    {
      name: 'wifi wep',
      payload: { type: 'wifi', ssid: 'ab', password: 'k', security: 'wep' },
      packet: bytes(0xc1, 0x02, 0x02, 0x02, 0x02, 0x61, 0x62, 0x01, 0x6b),
      compressed: true,
    },
    {
      name: 'contact',
      payload: { type: 'contact', text: 'A' },
      packet: bytes(0xc1, 0x03, 0x00, 0x41),
      compressed: false,
    },
    {
      name: 'checkin',
      payload: { type: 'checkin', text: 'ok' },
      packet: bytes(0xc1, 0x04, 0x00, 0x6f, 0x6b),
      compressed: false,
    },
    {
      name: 'hunt-clue',
      payload: { type: 'hunt-clue', text: 'go' },
      packet: bytes(0xc1, 0x05, 0x00, 0x67, 0x6f),
      compressed: false,
    },
  ];

  for (const c of cases) {
    it(`encodes ${c.name}`, () => {
      expectEncoded(c.payload, c.packet);
    });
    it(`decodes ${c.name}`, () => {
      expectDecoded(c.packet, c.payload, c.compressed);
    });
  }
});

describe('codec size boundaries', () => {
  it('encodes and decodes an unsealed packet of exactly 140 bytes', () => {
    const text = 'a'.repeat(137);
    const result = encode({ type: 'text', text });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeInstanceOf(Uint8Array);
    expect(result.value.length).toBe(140);
    expect(Array.from(result.value.subarray(0, 3))).toEqual([0xc1, 0x00, 0x00]);
    expectDecoded(result.value, { type: 'text', text }, false);
  });

  it('returns too-large with length 141 for a 138-byte body', () => {
    const result = encode({ type: 'text', text: 'a'.repeat(138) });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('too-large');
    if (result.error.code !== 'too-large') return;
    expect(result.error.length).toBe(141);
  });
});

describe('codec decode edge cases', () => {
  it('returns key-required for a packet with the sealed flag', () => {
    const packet = new Uint8Array(20);
    packet.set([0xc1, 0x00, 0x01]);
    const result = decode(packet);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('key-required');
  });

  it('returns invalid-payload with field packet for null', () => {
    const result = decode(null as unknown as Uint8Array);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('invalid-payload');
    if (result.error.code !== 'invalid-payload') return;
    expect(result.error.field).toBe('packet');
  });

  it('returns plain, non-thenable results', () => {
    const encoded = encode({ type: 'text', text: 'hi' });
    const decoded = decode(bytes(0xc1, 0x00, 0x00, 0x68, 0x69));
    const failed = decode(null as unknown as Uint8Array);
    for (const r of [encoded, decoded, failed]) {
      expect(r).not.toBeInstanceOf(Promise);
      expect(typeof (r as unknown as { then?: unknown }).then).toBe('undefined');
    }
  });
});
