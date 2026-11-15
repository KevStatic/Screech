import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { WifiSecurity } from '@screech/core';
import { buildWifiQrString, escapeWifiField } from '../../src/logic/wifi-qr';
import { wifiFields } from './arbitraries';

const TOKEN: Record<WifiSecurity, string> = { wpa: 'WPA', wep: 'WEP', open: 'nopass' };
const SPECIALS = new Set(['\\', ';', ',', ':', '"']);

interface ParsedQr {
  readonly type: string;
  readonly ssid: string;
  readonly password: string;
}

/** Test-side reference parser: splits on unescaped `;` and unescapes each field. */
function parseQr(qr: string): ParsedQr {
  expect(qr.startsWith('WIFI:')).toBe(true);
  const fields: string[] = [];
  let cur = '';
  const body = qr.slice('WIFI:'.length);
  for (let i = 0; i < body.length; i++) {
    const ch = body[i] as string;
    if (ch === '\\') {
      cur += body[i + 1] ?? '';
      i++;
    } else if (ch === ';') {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  const get = (key: string): string => {
    const f = fields.find((x) => x.startsWith(`${key}:`));
    return f === undefined ? '' : f.slice(key.length + 1);
  };
  return { type: get('T'), ssid: get('S'), password: get('P') };
}

describe('wifi-qr properties', () => {
  // Feature: spirit-box-app, Property 1: Wi-Fi QR string round trip
  // **Validates: Requirements 14.7**
  it('Property 1: Wi-Fi QR string round trip', () => {
    fc.assert(
      fc.property(wifiFields, (w) => {
        const parsed = parseQr(buildWifiQrString(w));
        expect(parsed.ssid).toBe(w.ssid);
        expect(parsed.password).toBe(w.security === 'open' ? '' : w.password);
        expect(parsed.type).toBe(TOKEN[w.security]);
      }),
      { numRuns: 200 },
    );
  });

  // Feature: spirit-box-app, Property 2: Wi-Fi QR escaping and shape
  // **Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.8, 14.9**
  it('Property 2: Wi-Fi QR escaping and shape', () => {
    fc.assert(
      fc.property(wifiFields, (w) => {
        const qr = buildWifiQrString(w);
        const pwd = w.security === 'open' ? '' : w.password;
        const expected = `WIFI:T:${TOKEN[w.security]};S:${escapeWifiField(w.ssid)};P:${escapeWifiField(pwd)};;`;
        expect(qr).toBe(expected);
        expect(qr.endsWith(';;')).toBe(true);

        // Escaping adds exactly one backslash before each special and changes nothing else.
        for (const value of [w.ssid, w.password]) {
          const escaped = escapeWifiField(value);
          let rebuilt = '';
          for (const ch of value) rebuilt += SPECIALS.has(ch) ? `\\${ch}` : ch;
          expect(escaped).toBe(rebuilt);
        }

        // Exactly three unescaped `;` terminators before the final `;`.
        let unescaped = 0;
        const body = qr.slice('WIFI:'.length);
        for (let i = 0; i < body.length; i++) {
          if (body[i] === '\\') i++;
          else if (body[i] === ';') unescaped++;
        }
        expect(unescaped).toBe(4);

        if (w.security === 'open') expect(qr.endsWith(';P:;;')).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});
