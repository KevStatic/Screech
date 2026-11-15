import { describe, it, expect } from 'vitest';
import { buildWifiQrString, escapeWifiField } from '../../src/logic/wifi-qr';

describe('buildWifiQrString', () => {
  it('builds a WPA network', () => {
    expect(buildWifiQrString({ ssid: 'Home', password: 'secret', security: 'wpa' })).toBe(
      'WIFI:T:WPA;S:Home;P:secret;;',
    );
  });

  it('builds a WEP network', () => {
    expect(buildWifiQrString({ ssid: 'Old', password: 'abcde', security: 'wep' })).toBe(
      'WIFI:T:WEP;S:Old;P:abcde;;',
    );
  });

  it('builds an open network with an empty password', () => {
    expect(buildWifiQrString({ ssid: 'Cafe', password: '', security: 'open' })).toBe(
      'WIFI:T:nopass;S:Cafe;P:;;',
    );
  });

  it('drops a supplied password for an open network', () => {
    expect(buildWifiQrString({ ssid: 'Cafe', password: 'ignored', security: 'open' })).toBe(
      'WIFI:T:nopass;S:Cafe;P:;;',
    );
  });

  it('handles empty SSID and password', () => {
    expect(buildWifiQrString({ ssid: '', password: '', security: 'wpa' })).toBe('WIFI:T:WPA;S:;P:;;');
  });

  it.each([
    ['\\', '\\\\'],
    [';', '\\;'],
    [',', '\\,'],
    [':', '\\:'],
    ['"', '\\"'],
  ])('escapes %s in SSID and password', (ch, esc) => {
    expect(buildWifiQrString({ ssid: `a${ch}b`, password: `c${ch}d`, security: 'wpa' })).toBe(
      `WIFI:T:WPA;S:a${esc}b;P:c${esc}d;;`,
    );
  });
});

describe('escapeWifiField', () => {
  it('leaves ordinary and Unicode text unchanged', () => {
    expect(escapeWifiField('Plain 123 é👻')).toBe('Plain 123 é👻');
  });

  it('returns an empty string for an empty string', () => {
    expect(escapeWifiField('')).toBe('');
  });
});
