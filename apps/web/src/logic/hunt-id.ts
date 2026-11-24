import { HUNT_ALPHABET } from '@screech/core';

export type HuntIdResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly reason: 'not-enough-bytes' };

/** Largest multiple of 31 below 256 is 217. Bytes of 217 or more are skipped (no modulo bias). */
export const HUNT_ID_REJECT_FROM = 217;

const ID_LENGTH = 6;

/**
 * Builds a Hunt_ID from caller-supplied random bytes. Pure: no clock, no random source.
 * Never throws; non-integer or out-of-range entries are skipped like rejected bytes.
 */
export function huntIdFromBytes(bytes: ArrayLike<number>): HuntIdResult {
  let id = '';
  try {
    const length = bytes.length;
    for (let i = 0; i < length && id.length < ID_LENGTH; i++) {
      const b = bytes[i];
      if (typeof b !== 'number' || !Number.isInteger(b) || b < 0 || b >= HUNT_ID_REJECT_FROM) continue;
      id += HUNT_ALPHABET[b % HUNT_ALPHABET.length];
    }
  } catch {
    return { ok: false, reason: 'not-enough-bytes' };
  }
  return id.length === ID_LENGTH ? { ok: true, id } : { ok: false, reason: 'not-enough-bytes' };
}
