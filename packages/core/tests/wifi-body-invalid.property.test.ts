import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { wifiArb } from './arbitraries.js';
import { NUM_RUNS } from './helpers.js';
import { decodeWifiBody, encodeWifiBody } from '../src/wifi-body.js';

// Feature: screech-protocol, Property 8: Malformed Wi-Fi bodies are rejected
// **Validates: Requirements 6.5**

/** Layout: security(1) | ssid_len(1) | ssid | password_len(1) | password. */
const validBodyArb: fc.Arbitrary<Uint8Array> = wifiArb.map((p) => {
  const encoded = encodeWifiBody(p.ssid, p.password, p.security);
  if (!encoded.ok) throw new Error('generator produced an unencodable Wi-Fi payload');
  return encoded.value.body;
});

function expectInvalidBody(body: Uint8Array): void {
  const result = decodeWifiBody(true, body);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe('invalid-body');
}

describe('Property 8: Malformed Wi-Fi bodies are rejected', () => {
  it('the generated bodies are valid before mutation', () => {
    fc.assert(
      fc.property(validBodyArb, (body) => {
        expect(decodeWifiBody(true, body).ok).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('rejects a body with trailing bytes removed', () => {
    fc.assert(
      fc.property(validBodyArb, fc.nat(), (body, n) => {
        const removed = 1 + (n % body.length);
        expectInvalidBody(body.subarray(0, body.length - removed));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('rejects a body with bytes appended', () => {
    fc.assert(
      fc.property(
        validBodyArb,
        fc.uint8Array({ minLength: 1, maxLength: 20 }),
        (body, extra) => {
          const mutated = new Uint8Array(body.length + extra.length);
          mutated.set(body, 0);
          mutated.set(extra, body.length);
          expectInvalidBody(mutated);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('rejects an undefined security byte', () => {
    fc.assert(
      fc.property(validBodyArb, fc.integer({ min: 3, max: 255 }), (body, security) => {
        const mutated = Uint8Array.from(body);
        mutated[0] = security;
        expectInvalidBody(mutated);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('rejects an ssid length that runs past the remaining bytes', () => {
    fc.assert(
      fc.property(validBodyArb, fc.nat(), (body, n) => {
        // The ssid length is valid only while 2 + len + 1 <= body.length.
        const minBad = body.length - 2;
        const mutated = Uint8Array.from(body);
        mutated[1] = minBad + (n % (256 - minBad));
        expectInvalidBody(mutated);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('rejects a password length that runs past the remaining bytes', () => {
    fc.assert(
      fc.property(validBodyArb, fc.nat(), (body, n) => {
        const passwordLenIndex = 2 + (body[1] as number);
        const remaining = body.length - passwordLenIndex - 1;
        const mutated = Uint8Array.from(body);
        mutated[passwordLenIndex] = remaining + 1 + (n % (255 - remaining));
        expectInvalidBody(mutated);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
