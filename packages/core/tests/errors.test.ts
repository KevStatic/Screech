/**
 * One fixed-input example for each of the 16 error codes.
 * Imports only from the public API (`src/index.ts`).
 *
 * Validates: Requirements 12.7
 */
import { afterEach, describe, expect, it } from 'vitest';
import { decode, encode, nextSenderState, open, seal } from '../src/index.js';
import type { CodecErrorCode, Payload, Result } from '../src/index.js';

const KEY = new Uint8Array(16).fill(7);
const SENDER_ID = new Uint8Array([1, 2, 3, 4]);
const TEXT: Payload = { type: 'text', text: 'hello' };

function codeOf(result: Result<unknown>): CodecErrorCode {
  if (result.ok) throw new Error('expected an error result');
  return result.error.code;
}

async function sealedHello(): Promise<Uint8Array> {
  const sealed = await seal(TEXT, KEY, SENDER_ID, 5);
  if (!sealed.ok) throw new Error('seal failed');
  return sealed.value;
}

describe('error codes', () => {
  it('bad-magic', () => {
    expect(codeOf(decode(new Uint8Array([0xd1, 0x00, 0x00])))).toBe('bad-magic');
  });

  it('unsupported-version', () => {
    expect(codeOf(decode(new Uint8Array([0xc2, 0x00, 0x00])))).toBe('unsupported-version');
  });

  it('truncated', () => {
    expect(codeOf(decode(new Uint8Array([0xc1, 0x00])))).toBe('truncated');
  });

  it('unknown-type', () => {
    expect(codeOf(decode(new Uint8Array([0xc1, 0x06, 0x00])))).toBe('unknown-type');
  });

  it('reserved-flags', () => {
    expect(codeOf(decode(new Uint8Array([0xc1, 0x00, 0x08])))).toBe('reserved-flags');
  });

  it('too-large', () => {
    expect(codeOf(encode({ type: 'text', text: 'a'.repeat(200) }))).toBe('too-large');
  });

  it('invalid-payload', () => {
    expect(codeOf(encode({ type: 'url', url: 'not a url' }))).toBe('invalid-payload');
  });

  it('invalid-wifi', () => {
    expect(
      codeOf(encode({ type: 'wifi', ssid: 'Cafe', password: 'secret', security: 'open' })),
    ).toBe('invalid-wifi');
  });

  it('invalid-body', () => {
    // A text body that is not valid UTF-8.
    expect(codeOf(decode(new Uint8Array([0xc1, 0x00, 0x00, 0xff, 0xfe])))).toBe('invalid-body');
  });

  it('auth-failed', async () => {
    const packet = (await sealedHello()).slice();
    packet[packet.length - 1] = (packet[packet.length - 1] as number) ^ 0x01;
    expect(codeOf(await open(packet, KEY))).toBe('auth-failed');
  });

  it('key-required', async () => {
    expect(codeOf(await open(await sealedHello(), undefined))).toBe('key-required');
  });

  it('invalid-key', async () => {
    expect(codeOf(await open(await sealedHello(), new Uint8Array(15)))).toBe('invalid-key');
  });

  it('invalid-counter', () => {
    expect(codeOf(nextSenderState({ senderId: SENDER_ID, counter: 65536 }))).toBe(
      'invalid-counter',
    );
  });

  it('invalid-sender-id', () => {
    expect(codeOf(nextSenderState({ senderId: new Uint8Array(3), counter: 0 }))).toBe(
      'invalid-sender-id',
    );
  });

  it('not-sealed', async () => {
    const plain = encode(TEXT);
    if (!plain.ok) throw new Error('encode failed');
    expect(codeOf(await open(plain.value, KEY))).toBe('not-sealed');
  });

  describe('crypto-unavailable', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

    afterEach(() => {
      if (original !== undefined) Object.defineProperty(globalThis, 'crypto', original);
    });

    it('is returned when crypto.subtle is missing', async () => {
      Object.defineProperty(globalThis, 'crypto', {
        configurable: true,
        writable: true,
        value: { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) },
      });
      expect(codeOf(await seal(TEXT, KEY, SENDER_ID, 0))).toBe('crypto-unavailable');
    });

    it('is returned when the random source fails', () => {
      const failing = (): Uint8Array => {
        throw new Error('no entropy');
      };
      expect(codeOf(nextSenderState(undefined, failing))).toBe('crypto-unavailable');
    });
  });
});
