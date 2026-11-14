import { describe, expect, it } from 'vitest';
import { decodeBody, encodeBody } from '../src/body.js';
import type { PacketType, Payload } from '../src/types.js';

/** Builds a payload the type system would reject, to test runtime validation. */
function bad(value: unknown): Payload {
  return value as Payload;
}

function expectInvalidPayload(payload: unknown, field: string): void {
  const r = encodeBody(bad(payload));
  expect(r.ok).toBe(false);
  if (!r.ok) {
    expect(r.error.code).toBe('invalid-payload');
    if (r.error.code === 'invalid-payload') expect(r.error.field).toBe(field);
  }
}

function encodeOk(payload: Payload): { type: PacketType; compressed: boolean; body: Uint8Array } {
  const r = encodeBody(payload);
  if (!r.ok) throw new Error(`expected ok, got ${r.error.code}`);
  return r.value;
}

describe('encodeBody / decodeBody dispatch', () => {
  const textLike = ['text', 'contact', 'checkin', 'hunt-clue'] as const;

  for (const type of textLike) {
    it(`${type}: encodes uncompressed and decodes back`, () => {
      const payload: Payload = { type, text: 'héllo' };
      const enc = encodeOk(payload);
      expect(enc.type).toBe(type);
      expect(enc.compressed).toBe(false);
      expect(Array.from(enc.body)).toEqual(Array.from(new TextEncoder().encode('héllo')));
      expect(decodeBody(enc.type, enc.compressed, enc.body)).toEqual({ ok: true, value: payload });
    });
  }

  it('url: encodes compressed and decodes back', () => {
    const payload: Payload = { type: 'url', url: 'https://github.com/ItzKev/Screech' };
    const enc = encodeOk(payload);
    expect(enc.type).toBe('url');
    expect(enc.compressed).toBe(true);
    expect(enc.body[0]).toBe(0x82);
    expect(decodeBody(enc.type, enc.compressed, enc.body)).toEqual({ ok: true, value: payload });
  });

  it('wifi: encodes compressed and decodes back', () => {
    const payload: Payload = { type: 'wifi', ssid: 'Cafe', password: 'secret12', security: 'wpa' };
    const enc = encodeOk(payload);
    expect(enc.type).toBe('wifi');
    expect(enc.compressed).toBe(true);
    expect(decodeBody(enc.type, enc.compressed, enc.body)).toEqual({ ok: true, value: payload });
  });

  it('decodeBody rejects the compressed flag on a text-like type', () => {
    const r = decodeBody('text', true, new Uint8Array([0x61]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid-body');
  });

  it('decodeBody names the type field for an unknown packet type', () => {
    const r = decodeBody('bogus' as PacketType, false, new Uint8Array([0x61]));
    expect(r.ok).toBe(false);
    if (!r.ok && r.error.code === 'invalid-payload') expect(r.error.field).toBe('type');
    else throw new Error('expected invalid-payload');
  });
});

describe('encodeBody invalid-payload', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['number', 42],
    ['string', 'text'],
  ])('rejects a %s payload naming "payload"', (_label, value) => {
    expectInvalidPayload(value, 'payload');
  });

  it('rejects an unknown type value naming "type"', () => {
    expectInvalidPayload({ type: 'file', text: 'x' }, 'type');
    expectInvalidPayload({}, 'type');
  });

  it.each(['text', 'contact', 'checkin', 'hunt-clue'])('rejects non-string text for %s', (type) => {
    expectInvalidPayload({ type, text: 5 }, 'text');
    expectInvalidPayload({ type }, 'text');
  });

  it('rejects a non-string url', () => {
    expectInvalidPayload({ type: 'url', url: 123 }, 'url');
  });

  it('rejects non-string wifi fields naming each field', () => {
    const ok = { type: 'wifi', ssid: 'Cafe', password: 'secret12', security: 'wpa' };
    expectInvalidPayload({ ...ok, ssid: 1 }, 'ssid');
    expectInvalidPayload({ ...ok, password: null }, 'password');
    expectInvalidPayload({ ...ok, security: 2 }, 'security');
  });

  it('does not throw on a payload whose getter throws', () => {
    const hostile = {
      get type(): string {
        throw new Error('boom');
      },
    };
    expectInvalidPayload(hostile, 'payload');
  });
});
