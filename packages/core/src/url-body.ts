import { compressUrl, expandUrl } from './prefix-table.js';
import { err, ok } from './result.js';
import type { Result } from './result.js';
import { decodeUtf8Strict, encodeUtf8Strict } from './utf8.js';

const SCHEME_PATTERN = /^(https?):\/\//i;
const HTTPS_BIT = 0x80;
const CODE_MASK = 0x7f;

export interface EncodedUrlBody {
  /** Always true: the scheme is always removed. */
  readonly compressed: true;
  readonly body: Uint8Array;
}

function invalidUrl(message: string): Result<never> {
  return err({ code: 'invalid-payload', field: 'url', message });
}

function invalidBody(message: string): Result<never> {
  return err({ code: 'invalid-body', message });
}

/**
 * Encodes a URL as `[schemeByte] || utf8(remainder)`. Bit 7 of the scheme byte is
 * 1 for https; bits 6..0 are the prefix code (0 for none).
 */
export function encodeUrlBody(url: string): Result<EncodedUrlBody> {
  if (typeof url !== 'string') return invalidUrl('url must be a string');
  const match = SCHEME_PATTERN.exec(url);
  if (match === null) return invalidUrl('url must start with http:// or https://');
  const https = (match[1] as string).toLowerCase() === 'https';
  const rest = url.slice(match[0].length);
  if (rest.length === 0) return invalidUrl('url has nothing after the scheme');
  const { code, remainder } = compressUrl(rest);
  const tail = encodeUtf8Strict(remainder);
  if (tail === null) return invalidUrl('url contains a lone surrogate');
  const body = new Uint8Array(1 + tail.length);
  body[0] = (https ? HTTPS_BIT : 0) | code;
  body.set(tail, 1);
  return ok({ compressed: true, body });
}

/**
 * Decodes a URL body. With `compressed` set the body is the scheme-byte form.
 * With it clear the body is the literal UTF-8 URL, which must start with
 * http:// or https:// (case-insensitive) and have text after it.
 */
export function decodeUrlBody(compressed: boolean, body: Uint8Array): Result<string> {
  if (!compressed) {
    const text = decodeUtf8Strict(body);
    if (text === null) return invalidBody('url body is not valid UTF-8');
    const match = SCHEME_PATTERN.exec(text);
    if (match === null) return invalidBody('literal url must start with http:// or https://');
    if (text.length === match[0].length) return invalidBody('url has nothing after the scheme');
    return ok(text);
  }
  if (body.length === 0) return invalidBody('url body is empty');
  const schemeByte = body[0] as number;
  const prefix = expandUrl(schemeByte & CODE_MASK);
  if (prefix === undefined) return invalidBody('url prefix code is not defined');
  const rest = decodeUtf8Strict(body.subarray(1));
  if (rest === null) return invalidBody('url body is not valid UTF-8');
  if (prefix.length === 0 && rest.length === 0) return invalidBody('url has nothing after the scheme');
  const scheme = (schemeByte & HTTPS_BIT) !== 0 ? 'https' : 'http';
  return ok(`${scheme}://${prefix}${rest}`);
}
