import { afterEach, describe, expect, it, vi } from 'vitest';
import { seal } from '../src/seal.js';
import type { Payload } from '../src/types.js';
import { referenceSealedPacket, referenceSubtleDecrypt } from './helpers.js';

const KEY = Uint8Array.from({ length: 16 }, (_, i) => i + 1);
const SENDER_ID = Uint8Array.from([0xde, 0xad, 0xbe, 0xef]);
const COUNTER = 0x0102;

const text = (n: number): Payload => ({ type: 'text', text: 'a'.repeat(n) });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('seal known answer', () => {
  it('matches the node:crypto reference packet and decrypts via SubtleCrypto', async () => {
    const message = 'Hello, Screech!';
    const body = new TextEncoder().encode(message);
    const expected = referenceSealedPacket({
      key: KEY,
      senderId: SENDER_ID,
      counter: COUNTER,
      type: 0,
      flags: 0,
      body,
    });

    const result = await seal({ type: 'text', text: message }, KEY, SENDER_ID, COUNTER);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Array.from(result.value)).toEqual(Array.from(expected));
    expect(result.value.length).toBe(17 + body.length);

    const plain = await referenceSubtleDecrypt(result.value, KEY);
    expect(Array.from(plain)).toEqual(Array.from(body));
  });
});

describe('seal size boundary', () => {
  it('gives a 140-byte packet for a 123-byte body', async () => {
    const result = await seal(text(123), KEY, SENDER_ID, COUNTER);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.length).toBe(140);
  });

  it('gives too-large with length 141 for a 124-byte body', async () => {
    const result = await seal(text(124), KEY, SENDER_ID, COUNTER);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('too-large');
      expect(result.error).toMatchObject({ length: 141 });
    }
  });
});

describe('seal without SubtleCrypto', () => {
  it('resolves to crypto-unavailable when crypto.subtle is undefined', async () => {
    vi.stubGlobal('crypto', { subtle: undefined });
    const result = await seal(text(5), KEY, SENDER_ID, COUNTER);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('crypto-unavailable');
  });

  it('returns a thenable', async () => {
    const pending = seal(text(5), KEY, SENDER_ID, COUNTER);
    expect(typeof (pending as { then?: unknown }).then).toBe('function');
    await pending;
  });
});
