import { afterEach, describe, expect, it, vi } from 'vitest';
import { encode } from '../src/codec.js';
import { FLAG_SEALED, HEADER_BYTE } from '../src/constants.js';
import { open, seal } from '../src/seal.js';
import type { Payload } from '../src/types.js';

const KEY = Uint8Array.from({ length: 16 }, (_, i) => i + 1);
const OTHER_KEY = Uint8Array.from({ length: 16 }, (_, i) => 0xf0 - i);
const SENDER_ID = Uint8Array.from([0xde, 0xad, 0xbe, 0xef]);
const COUNTER = 0x0102;

const text = (n: number): Payload => ({ type: 'text', text: 'a'.repeat(n) });

const sealedHeaderPacket = (length: number): Uint8Array => {
  const packet = new Uint8Array(length);
  packet[0] = HEADER_BYTE;
  packet[1] = 0;
  packet[2] = FLAG_SEALED;
  return packet;
};

const sealOk = async (payload: Payload): Promise<Uint8Array> => {
  const result = await seal(payload, KEY, SENDER_ID, COUNTER);
  if (!result.ok) throw new Error(`seal failed: ${result.error.code}`);
  return result.value;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('open truncation boundary', () => {
  it('gives truncated for a 16-byte sealed-flag packet', async () => {
    const result = await open(sealedHeaderPacket(16), KEY);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('truncated');
  });

  it('does not give truncated for a 17-byte sealed-flag packet', async () => {
    const result = await open(sealedHeaderPacket(17), KEY);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).not.toBe('truncated');
  });
});

describe('open size boundary', () => {
  it('opens a 140-byte sealed packet with a 123-byte body', async () => {
    const packet = await sealOk(text(123));
    expect(packet.length).toBe(140);
    const result = await open(packet, KEY);
    expect(result.ok).toBe(true);
    if (result.ok && !result.value.multipart) {
      expect(result.value.payload).toEqual(text(123));
      expect(result.value.flags.sealed).toBe(true);
    }
  });

  it('rejects a 141-byte sealed packet in seal with too-large', async () => {
    const result = await seal(text(124), KEY, SENDER_ID, COUNTER);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('too-large');
      expect(result.error).toMatchObject({ length: 141 });
    }
  });
});

describe('open errors', () => {
  it('gives auth-failed for a wrong key', async () => {
    const result = await open(await sealOk(text(10)), OTHER_KEY);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('auth-failed');
  });

  it('gives key-required for a missing key', async () => {
    const result = await open(await sealOk(text(10)), undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('key-required');
  });

  it('gives invalid-key for a 15-byte key', async () => {
    const result = await open(await sealOk(text(10)), KEY.slice(0, 15));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid-key');
  });

  it('gives not-sealed for an unsealed packet', async () => {
    const encoded = encode(text(10));
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    const result = await open(encoded.value, KEY);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('not-sealed');
  });
});

describe('open without SubtleCrypto', () => {
  it('resolves to crypto-unavailable when crypto.subtle is undefined', async () => {
    const packet = await sealOk(text(5));
    vi.stubGlobal('crypto', { subtle: undefined });
    const result = await open(packet, KEY);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('crypto-unavailable');
  });

  it('returns a thenable', async () => {
    const pending = open(await sealOk(text(5)), KEY);
    expect(typeof (pending as { then?: unknown }).then).toBe('function');
    await pending;
  });
});
