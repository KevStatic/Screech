import { SECURITY_VALUE } from './constants.js';
import { err, ok } from './result.js';
import type { Result } from './result.js';
import type { WifiSecurity } from './types.js';
import { decodeUtf8Strict, encodeUtf8Strict } from './utf8.js';

export interface EncodedWifiBody {
  /** Always true: the Wi-Fi body layout sets the compressed flag. */
  readonly compressed: true;
  readonly body: Uint8Array;
}

export interface WifiFields {
  readonly ssid: string;
  readonly password: string;
  readonly security: WifiSecurity;
}

const MAX_SSID_BYTES = 32;
const MAX_PASSWORD_BYTES = 63;

function invalidPayload(field: string, message: string): Result<never> {
  return err({ code: 'invalid-payload', field, message });
}

function invalidBody(message: string): Result<never> {
  return err({ code: 'invalid-body', message });
}

function isSecurity(value: unknown): value is WifiSecurity {
  return value === 'open' || value === 'wpa' || value === 'wep';
}

/**
 * Encodes a Wi-Fi payload as
 * `security(1) | ssid_len(1) | ssid | password_len(1) | password`.
 * Open networks write password_len 0 and no password bytes.
 */
export function encodeWifiBody(
  ssid: string,
  password: string,
  security: WifiSecurity,
): Result<EncodedWifiBody> {
  if (typeof ssid !== 'string') return invalidPayload('ssid', 'ssid must be a string');
  if (typeof password !== 'string') return invalidPayload('password', 'password must be a string');
  const ssidBytes = encodeUtf8Strict(ssid);
  if (ssidBytes === null) return invalidPayload('ssid', 'ssid contains a lone surrogate');
  const passwordBytes = encodeUtf8Strict(password);
  if (passwordBytes === null) {
    return invalidPayload('password', 'password contains a lone surrogate');
  }

  if (!isSecurity(security)) return invalidPayload('security', 'unknown security value');

  if (ssidBytes.length < 1 || ssidBytes.length > MAX_SSID_BYTES) {
    return invalidPayload('ssid', 'ssid must be 1 to 32 UTF-8 bytes');
  }
  if (security === 'open' && passwordBytes.length > 0) {
    return err({ code: 'invalid-wifi', message: 'open network must not have a password' });
  }
  if (passwordBytes.length > MAX_PASSWORD_BYTES) {
    return invalidPayload('password', 'password must be at most 63 UTF-8 bytes');
  }
  if (security !== 'open' && passwordBytes.length === 0) {
    return invalidPayload('password', 'password is required for wpa and wep');
  }

  const body = new Uint8Array(3 + ssidBytes.length + passwordBytes.length);
  let i = 0;
  body[i++] = SECURITY_VALUE[security];
  body[i++] = ssidBytes.length;
  body.set(ssidBytes, i);
  i += ssidBytes.length;
  body[i++] = passwordBytes.length;
  body.set(passwordBytes, i);
  return ok({ compressed: true, body });
}

/** Decodes a Wi-Fi body. Every violation yields `invalid-body`. */
export function decodeWifiBody(compressed: boolean, body: Uint8Array): Result<WifiFields> {
  if (!compressed) return invalidBody('wifi packet must have the compressed flag');
  if (body.length < 2) return invalidBody('wifi body is too short');

  const securityByte = body[0] as number;
  let security: WifiSecurity;
  if (securityByte === SECURITY_VALUE.open) security = 'open';
  else if (securityByte === SECURITY_VALUE.wpa) security = 'wpa';
  else if (securityByte === SECURITY_VALUE.wep) security = 'wep';
  else return invalidBody('undefined security value');

  const ssidLen = body[1] as number;
  let i = 2;
  if (i + ssidLen + 1 > body.length) return invalidBody('ssid length runs past the body');
  const ssidBytes = body.subarray(i, i + ssidLen);
  i += ssidLen;
  const passwordLen = body[i++] as number;
  if (i + passwordLen > body.length) return invalidBody('password length runs past the body');
  const passwordBytes = body.subarray(i, i + passwordLen);
  i += passwordLen;
  if (i !== body.length) return invalidBody('unexpected bytes after the password');

  if (ssidLen < 1 || ssidLen > MAX_SSID_BYTES) return invalidBody('ssid must be 1 to 32 bytes');
  if (passwordLen > MAX_PASSWORD_BYTES) return invalidBody('password must be at most 63 bytes');
  if (security === 'open' && passwordLen > 0) {
    return invalidBody('open network must not have a password');
  }
  if (security !== 'open' && passwordLen === 0) {
    return invalidBody('password is required for wpa and wep');
  }

  const ssid = decodeUtf8Strict(ssidBytes);
  if (ssid === null) return invalidBody('ssid is not valid UTF-8');
  const password = decodeUtf8Strict(passwordBytes);
  if (password === null) return invalidBody('password is not valid UTF-8');
  return ok({ ssid, password, security });
}
