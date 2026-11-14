import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { encodeWifiBody } from '../src/wifi-body.js';
import {
  wifiArb,
  wifiEmptySsidArb,
  wifiOpenWithPasswordArb,
  wifiOversizedPasswordArb,
  wifiOversizedSsidArb,
  wifiSecuredEmptyPasswordArb,
} from './arbitraries.js';
import { NUM_RUNS, referenceWifiBody } from './helpers.js';

describe('wifi-body properties', () => {
  // Feature: screech-protocol, Property 7: Wi-Fi encoding rules
  // **Validates: Requirements 6.1, 6.2, 6.3, 6.6, 6.7, 6.8**
  it('accepted payloads encode as security||len||ssid||len||password with compressed true', () => {
    fc.assert(
      fc.property(wifiArb, (p) => {
        const result = encodeWifiBody(p.ssid, p.password, p.security);
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        expect(result.value.compressed).toBe(true);
        const reference = referenceWifiBody(p.security, p.ssid, p.password);
        expect(Array.from(result.value.body)).toEqual(Array.from(reference));
        if (p.security === 'open') {
          // password length byte is 0 and no password bytes follow
          const ssidLen = result.value.body[1] as number;
          expect(result.value.body[2 + ssidLen]).toBe(0);
          expect(result.value.body.length).toBe(3 + ssidLen);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: screech-protocol, Property 7: Wi-Fi encoding rules
  // **Validates: Requirements 6.1, 6.2, 6.3, 6.6, 6.7, 6.8**
  it('open network with a non-empty password is invalid-wifi', () => {
    fc.assert(
      fc.property(wifiOpenWithPasswordArb, (p) => {
        const result = encodeWifiBody(p.ssid, p.password, p.security);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error.code).toBe('invalid-wifi');
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: screech-protocol, Property 7: Wi-Fi encoding rules
  // **Validates: Requirements 6.1, 6.2, 6.3, 6.6, 6.7, 6.8**
  it('empty or oversized SSID, oversized password, and secured empty password are invalid-payload', () => {
    const invalidArb = fc.oneof(
      wifiEmptySsidArb,
      wifiOversizedSsidArb,
      wifiOversizedPasswordArb,
      wifiSecuredEmptyPasswordArb,
    );
    fc.assert(
      fc.property(invalidArb, (p) => {
        const result = encodeWifiBody(p.ssid, p.password, p.security);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error.code).toBe('invalid-payload');
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
