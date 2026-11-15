import type { DecodedPacket, Result } from '@screech/core';

export type ScreenState =
  | { readonly kind: 'ignore' }
  | { readonly kind: 'reveal'; readonly packet: Extract<DecodedPacket, { multipart: false }> }
  | { readonly kind: 'garbled' }
  | { readonly kind: 'pact-required' };

const IGNORE: ScreenState = { kind: 'ignore' };
const GARBLED: ScreenState = { kind: 'garbled' };
const PACT_REQUIRED: ScreenState = { kind: 'pact-required' };

/**
 * Maps a Core decode result to the screen to show. Only a non-multipart success reveals,
 * `invalid-body` is garbled, `key-required` needs the pact, everything else (room noise,
 * multipart, unknown codes, non-Result input) is ignored. Never throws.
 */
export function screenState(result: Result<DecodedPacket>): ScreenState {
  try {
    const r: unknown = result;
    if (typeof r !== 'object' || r === null) return IGNORE;
    const candidate = r as { ok?: unknown; value?: unknown; error?: unknown };
    if (candidate.ok === true) {
      const value = candidate.value;
      if (typeof value !== 'object' || value === null) return IGNORE;
      if ((value as { multipart?: unknown }).multipart === false) {
        return { kind: 'reveal', packet: value as Extract<DecodedPacket, { multipart: false }> };
      }
      return IGNORE;
    }
    if (candidate.ok === false) {
      const error = candidate.error;
      if (typeof error !== 'object' || error === null) return IGNORE;
      const code = (error as { code?: unknown }).code;
      if (code === 'invalid-body') return GARBLED;
      if (code === 'key-required') return PACT_REQUIRED;
    }
    return IGNORE;
  } catch {
    return IGNORE;
  }
}
