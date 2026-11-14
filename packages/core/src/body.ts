import { err, ok } from './result.js';
import type { Result } from './result.js';
import { decodeTextBody, encodeTextBody } from './text-body.js';
import type { PacketType, Payload } from './types.js';
import { decodeUrlBody, encodeUrlBody } from './url-body.js';
import { decodeWifiBody, encodeWifiBody } from './wifi-body.js';

export interface EncodedBody {
  readonly type: PacketType;
  readonly compressed: boolean;
  readonly body: Uint8Array;
}

function invalidPayload(field: string, message: string): Result<never> {
  return err({ code: 'invalid-payload', field, message });
}

function isTextLike(type: unknown): type is 'text' | 'contact' | 'checkin' | 'hunt-clue' {
  return type === 'text' || type === 'contact' || type === 'checkin' || type === 'hunt-clue';
}

/**
 * Encodes a payload into its packet type, compressed flag and body bytes.
 * Unknown shapes return `invalid-payload` naming the offending field. Never throws.
 */
export function encodeBody(payload: Payload): Result<EncodedBody> {
  try {
    const value: unknown = payload;
    if (typeof value !== 'object' || value === null) {
      return invalidPayload('payload', 'payload must be an object');
    }
    const record = value as Readonly<Record<string, unknown>>;
    const type = record['type'];

    if (isTextLike(type)) {
      const text = record['text'];
      if (typeof text !== 'string') return invalidPayload('text', 'text must be a string');
      const encoded = encodeTextBody(text);
      if (!encoded.ok) return encoded;
      return ok({ type, compressed: encoded.value.compressed, body: encoded.value.body });
    }
    if (type === 'url') {
      const url = record['url'];
      if (typeof url !== 'string') return invalidPayload('url', 'url must be a string');
      const encoded = encodeUrlBody(url);
      if (!encoded.ok) return encoded;
      return ok({ type, compressed: encoded.value.compressed, body: encoded.value.body });
    }
    if (type === 'wifi') {
      const { ssid, password, security } = record;
      if (typeof ssid !== 'string') return invalidPayload('ssid', 'ssid must be a string');
      if (typeof password !== 'string') return invalidPayload('password', 'password must be a string');
      if (typeof security !== 'string') return invalidPayload('security', 'security must be a string');
      const encoded = encodeWifiBody(ssid, password, security as 'open' | 'wpa' | 'wep');
      if (!encoded.ok) return encoded;
      return ok({ type, compressed: encoded.value.compressed, body: encoded.value.body });
    }
    return invalidPayload('type', 'unknown payload type');
  } catch {
    return invalidPayload('payload', 'payload could not be read');
  }
}

/**
 * Decodes a body of the given type into a payload. Strict: accepts only what
 * `encodeBody` produces. Never throws.
 */
export function decodeBody(
  type: PacketType,
  compressed: boolean,
  body: Uint8Array,
): Result<Payload> {
  try {
    if (isTextLike(type)) {
      const decoded = decodeTextBody(compressed, body);
      if (!decoded.ok) return decoded;
      return ok({ type, text: decoded.value });
    }
    if (type === 'url') {
      const decoded = decodeUrlBody(compressed, body);
      if (!decoded.ok) return decoded;
      return ok({ type, url: decoded.value });
    }
    if (type === 'wifi') {
      const decoded = decodeWifiBody(compressed, body);
      if (!decoded.ok) return decoded;
      return ok({ type, ...decoded.value });
    }
    return invalidPayload('type', 'unknown packet type');
  } catch {
    return err({ code: 'invalid-body', message: 'body could not be decoded' });
  }
}
