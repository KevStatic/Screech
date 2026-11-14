import { err, ok } from './result.js';
import type { Result } from './result.js';
import { decodeUtf8Strict, encodeUtf8Strict } from './utf8.js';

export interface EncodedTextBody {
  /** Always false: text-like bodies are never compressed. */
  readonly compressed: false;
  readonly body: Uint8Array;
}

function invalidText(message: string): Result<never> {
  return err({ code: 'invalid-payload', field: 'text', message });
}

function invalidBody(message: string): Result<never> {
  return err({ code: 'invalid-body', message });
}

/**
 * Encodes the text of a text, contact, checkin or hunt-clue payload as strict
 * UTF-8. Rejects empty text and lone surrogates with `invalid-payload`.
 */
export function encodeTextBody(text: string): Result<EncodedTextBody> {
  if (typeof text !== 'string') return invalidText('text must be a string');
  if (text.length === 0) return invalidText('text must not be empty');
  const body = encodeUtf8Strict(text);
  if (body === null) return invalidText('text contains a lone surrogate');
  return ok({ compressed: false, body });
}

/**
 * Decodes a text-like body. The compressed flag must be clear, the body must be
 * non-empty and valid UTF-8; otherwise the result is `invalid-body`.
 */
export function decodeTextBody(compressed: boolean, body: Uint8Array): Result<string> {
  if (compressed) return invalidBody('text-like packet must not have the compressed flag');
  if (body.length === 0) return invalidBody('text body is empty');
  const text = decodeUtf8Strict(body);
  if (text === null) return invalidBody('text body is not valid UTF-8');
  return ok(text);
}
