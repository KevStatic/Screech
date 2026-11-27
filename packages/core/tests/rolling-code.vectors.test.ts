import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { rollingCode } from '../src/rolling-code.js';

// ---- From-scratch reference: SHA-256 (FIPS 180-4) and HMAC (RFC 2104), no imports from src/. ----

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

function sha256(data: Uint8Array): Uint8Array {
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const padded = new Uint8Array(Math.ceil((data.length + 9) / 64) * 64);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLen = data.length * 8;
  view.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(padded.length - 4, bitLen >>> 0, false);
  const w = new Uint32Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const w15 = w[i - 15] as number;
      const w2 = w[i - 2] as number;
      const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3);
      const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
      w[i] = ((w[i - 16] as number) + s0 + (w[i - 7] as number) + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = Array.from(h) as [
      number, number, number, number, number, number, number, number,
    ];
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + (K[i] as number) + (w[i] as number)) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    const sum = [a, b, c, d, e, f, g, hh];
    for (let i = 0; i < 8; i++) h[i] = ((h[i] as number) + (sum[i] as number)) >>> 0;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, h[i] as number, false);
  return out;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

function hmacSha256(key: Uint8Array, message: Uint8Array): Uint8Array {
  const block = new Uint8Array(64);
  block.set(key.length > 64 ? sha256(key) : key);
  const ipad = block.map((b) => b ^ 0x36);
  const opad = block.map((b) => b ^ 0x5c);
  return sha256(concat(opad, sha256(concat(ipad, message))));
}

function referenceCode(secret: Uint8Array, window: number): string {
  const digest = hmacSha256(secret, new TextEncoder().encode(String(window)));
  const o = (digest[31] as number) & 0x0f;
  const value =
    ((((digest[o] as number) & 0x7f) << 24) |
      ((digest[o + 1] as number) << 16) |
      ((digest[o + 2] as number) << 8) |
      (digest[o + 3] as number)) >>>
    0;
  return String(value % 1_000_000).padStart(6, '0');
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const fill = (byte: number): Uint8Array => new Uint8Array(32).fill(byte);

// ---- Tests ----

describe('reference SHA-256 / HMAC self-check (known answers)', () => {
  it('SHA-256("abc") matches FIPS 180-4', () => {
    expect(hex(sha256(new TextEncoder().encode('abc')))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('SHA-256 of the empty string matches FIPS 180-4', () => {
    expect(hex(sha256(new Uint8Array(0)))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('HMAC-SHA-256 matches RFC 4231 test case 2', () => {
    const mac = hmacSha256(
      new TextEncoder().encode('Jefe'),
      new TextEncoder().encode('what do ya want for nothing?'),
    );
    expect(hex(mac)).toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
  });
});

describe('rollingCode fixed vectors (design.md "Rolling code test vectors")', () => {
  const vectors: ReadonlyArray<readonly [string, Uint8Array, number, string]> = [
    ['all zero bytes, window 0', fill(0x00), 0, '919345'],
    ['all zero bytes, window 1', fill(0x00), 1, '259693'],
    ['all zero bytes, window 2^53-1', fill(0x00), 9007199254740991, '907326'],
    ['all 0xff bytes, window 57000000', fill(0xff), 57000000, '063422'],
    ['ASCII 1234567890... secret, window 2', new TextEncoder().encode('12345678901234567890123456789012'), 2, '648140'],
    ['all 0x08 bytes, window 0 (leading zero)', fill(0x08), 0, '084520'],
    ['all 0x3f bytes, window 0 (leading zero)', fill(0x3f), 0, '044471'],
  ];

  it.each(vectors)('%s', async (_label, secret, window, expected) => {
    expect(await rollingCode(secret, window)).toBe(expected);
  });

  it.each(vectors)('reference implementation agrees: %s', (_label, secret, window, expected) => {
    expect(referenceCode(secret, window)).toBe(expected);
  });

  it('keeps the leading zero as a 6-character string', async () => {
    const code = await rollingCode(fill(0x08), 0);
    expect(code).toHaveLength(6);
    expect(code.startsWith('0')).toBe(true);
  });
});

describe('rollingCode cross-check against the from-scratch reference', () => {
  it('matches for random secrets and windows', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 32, maxLength: 32 }),
        fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
        async (secret, window) => {
          expect(await rollingCode(secret, window)).toBe(referenceCode(secret, window));
        },
      ),
      { numRuns: 100 },
    );
  });

  it('matches for secrets of other lengths, including longer than the HMAC block', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 1, maxLength: 100 }),
        fc.integer({ min: 0, max: 100_000_000 }),
        async (secret, window) => {
          expect(await rollingCode(secret, window)).toBe(referenceCode(secret, window));
        },
      ),
      { numRuns: 50 },
    );
  });
});
