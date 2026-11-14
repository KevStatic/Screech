import { describe, expect, it } from 'vitest';
import { decodeWifiBody, encodeWifiBody } from '../src/wifi-body.js';
import type { WifiSecurity } from '../src/types.js';

function encoded(ssid: string, password: string, security: WifiSecurity): number[] {
  const r = encodeWifiBody(ssid, password, security);
  if (!r.ok) throw new Error(`expected ok, got ${r.error.code}`);
  expect(r.value.compressed).toBe(true);
  return Array.from(r.value.body);
}

function expectInvalidPayload(
  ssid: string,
  password: string,
  security: WifiSecurity,
  field: string,
): void {
  const r = encodeWifiBody(ssid, password, security);
  expect(r.ok).toBe(false);
  if (!r.ok) {
    expect(r.error.code).toBe('invalid-payload');
    if (r.error.code === 'invalid-payload') expect(r.error.field).toBe(field);
  }
}

function expectInvalidBody(compressed: boolean, bytes: number[]): void {
  const r = decodeWifiBody(compressed, Uint8Array.from(bytes));
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.code).toBe('invalid-body');
}

describe('encodeWifiBody', () => {
  it('encodes fixed bytes for open, WPA and WEP', () => {
    expect(encoded('Cafe', '', 'open')).toEqual([0x00, 4, 0x43, 0x61, 0x66, 0x65, 0]);
    expect(encoded('Cafe', 'pass', 'wpa')).toEqual([
      0x01, 4, 0x43, 0x61, 0x66, 0x65, 4, 0x70, 0x61, 0x73, 0x73,
    ]);
    expect(encoded('Cafe', 'pass', 'wep')).toEqual([
      0x02, 4, 0x43, 0x61, 0x66, 0x65, 4, 0x70, 0x61, 0x73, 0x73,
    ]);
  });

  it('counts SSID length in UTF-8 bytes', () => {
    expect(encoded('é', '', 'open')).toEqual([0x00, 2, 0xc3, 0xa9, 0]);
  });

  it('rejects an open network with a password as invalid-wifi', () => {
    const r = encodeWifiBody('Cafe', 'pass', 'open');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid-wifi');
  });

  it('accepts SSIDs of 1 and 32 bytes and rejects 0 and 33', () => {
    expect(encoded('a', '', 'open')[1]).toBe(1);
    expect(encoded('a'.repeat(32), '', 'open')[1]).toBe(32);
    expectInvalidPayload('', '', 'open', 'ssid');
    expectInvalidPayload('a'.repeat(33), '', 'open', 'ssid');
  });

  it('accepts a 63-byte password and rejects 64', () => {
    expect(encoded('a', 'p'.repeat(63), 'wpa')).toHaveLength(3 + 1 + 63);
    expectInvalidPayload('a', 'p'.repeat(64), 'wpa', 'password');
  });

  it('rejects WPA and WEP with an empty password as invalid-payload', () => {
    expectInvalidPayload('Cafe', '', 'wpa', 'password');
    expectInvalidPayload('Cafe', '', 'wep', 'password');
  });
});

describe('decodeWifiBody', () => {
  it('decodes fixed bytes for open, WPA and WEP', () => {
    const open = decodeWifiBody(true, Uint8Array.from([0x00, 4, 0x43, 0x61, 0x66, 0x65, 0]));
    expect(open).toEqual({ ok: true, value: { ssid: 'Cafe', password: '', security: 'open' } });
    const wpa = decodeWifiBody(
      true,
      Uint8Array.from([0x01, 4, 0x43, 0x61, 0x66, 0x65, 4, 0x70, 0x61, 0x73, 0x73]),
    );
    expect(wpa).toEqual({ ok: true, value: { ssid: 'Cafe', password: 'pass', security: 'wpa' } });
    const wep = decodeWifiBody(
      true,
      Uint8Array.from([0x02, 4, 0x43, 0x61, 0x66, 0x65, 4, 0x70, 0x61, 0x73, 0x73]),
    );
    expect(wep).toEqual({ ok: true, value: { ssid: 'Cafe', password: 'pass', security: 'wep' } });
  });

  it('rejects the compressed flag clear', () => {
    expectInvalidBody(false, [0x00, 1, 0x61, 0]);
  });

  it('rejects an undefined security byte', () => {
    expectInvalidBody(true, [0x03, 1, 0x61, 0]);
    expectInvalidBody(true, [0xff, 1, 0x61, 0]);
  });

  it('rejects a length that runs past the body', () => {
    expectInvalidBody(true, [0x00, 5, 0x61, 0x62, 0]);
    expectInvalidBody(true, [0x01, 1, 0x61, 4, 0x70]);
    expectInvalidBody(true, [0x01, 1, 0x61]);
  });

  it('rejects leftover bytes after the password', () => {
    expectInvalidBody(true, [0x00, 1, 0x61, 0, 0x00]);
    expectInvalidBody(true, [0x01, 1, 0x61, 1, 0x70, 0x71]);
  });

  it('rejects invalid UTF-8 in the SSID and in the password', () => {
    expectInvalidBody(true, [0x00, 1, 0xff, 0]);
    expectInvalidBody(true, [0x01, 1, 0x61, 1, 0xff]);
  });
});
