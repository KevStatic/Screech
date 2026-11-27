/** Shared response helpers for the Checkin_API handlers. No node: imports. */

export const CACHE_CONTROL_NO_STORE = 'no-store';
export const MAX_BODY_BYTES = 2048;

export const SEANCE_NOT_FOUND_MESSAGE = 'This séance was not found. It may be over.';
export const SERVER_ERROR_MESSAGE = 'The spirits stumbled. Try again.';

/** JSON response. Always `application/json` + `no-store`; never sets a cookie. */
export function json(status: number, body: unknown, extraHeaders?: Readonly<Record<string, string>>): Response {
  const headers = new Headers(extraHeaders);
  headers.delete('Set-Cookie');
  headers.set('Content-Type', 'application/json');
  headers.set('Cache-Control', CACHE_CONTROL_NO_STORE);
  return new Response(JSON.stringify(body), { status, headers });
}

/** Plain-words error response: `{ error: message }`. */
export function error(status: number, message: string): Response {
  return json(status, { error: message });
}

/** The one 404 used for malformed, unknown, expired and wrong-secret cases, so they cannot differ. */
export function seanceNotFound(): Response {
  return error(404, SEANCE_NOT_FOUND_MESSAGE);
}

/** Generic 500: fixed message, no stack trace, no stored value. */
export function serverError(): Response {
  return error(500, SERVER_ERROR_MESSAGE);
}

/** Returns a 405 with `Allow` when `method` is not allowed, otherwise `null`. */
export function methodGuard(allowed: readonly string[], method: string): Response | null {
  const upper = method.toUpperCase();
  if (allowed.some((m) => m.toUpperCase() === upper)) return null;
  return json(405, { error: `Method not allowed. Use ${allowed.join(', ')}.` }, { Allow: allowed.join(', ') });
}

export type JsonBodyResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly response: Response };

function tooLarge(maxBytes: number): JsonBodyResult {
  return { ok: false, response: error(413, `Too heavy to cross over (limit ${maxBytes} bytes).`) };
}

/**
 * Reads and parses a JSON body. 413 when it exceeds `maxBytes` (checked via
 * Content-Length first, then while streaming, always before parsing); 400 on invalid JSON.
 */
export async function readJsonBody(req: Request, maxBytes: number = MAX_BODY_BYTES): Promise<JsonBodyResult> {
  const declared = req.headers.get('content-length');
  if (declared !== null) {
    const n = Number(declared);
    if (Number.isFinite(n) && n > maxBytes) return tooLarge(maxBytes);
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  if (req.body) {
    const reader = req.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return tooLarge(maxBytes);
      }
      chunks.push(value);
    }
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }

  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, response: error(400, 'The request was not understood.') };
  }
}

/**
 * Constant-time string comparison. Always iterates over the longer length, so
 * time depends on length only, never on where the first mismatch is.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  const len = Math.max(x.length, y.length);
  let diff = x.length ^ y.length;
  for (let i = 0; i < len; i++) {
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  }
  return diff === 0;
}
