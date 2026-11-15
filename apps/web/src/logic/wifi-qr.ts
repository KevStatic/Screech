import type { WifiSecurity } from '@screech/core';

export interface WifiQrInput {
  readonly ssid: string;
  readonly password: string;
  readonly security: WifiSecurity;
}

const SECURITY_TOKEN: Readonly<Record<WifiSecurity, string>> = {
  wpa: 'WPA',
  wep: 'WEP',
  open: 'nopass',
};

/** Prefix each of `\ ; , : "` with one backslash. All other characters are unchanged. */
export function escapeWifiField(value: string): string {
  return value.replace(/[\\;,:"]/g, '\\$&');
}

/** Build the `WIFI:T:<t>;S:<s>;P:<p>;;` string. Open networks always get an empty password. */
export function buildWifiQrString(w: WifiQrInput): string {
  const password = w.security === 'open' ? '' : w.password;
  return `WIFI:T:${SECURITY_TOKEN[w.security]};S:${escapeWifiField(w.ssid)};P:${escapeWifiField(password)};;`;
}
