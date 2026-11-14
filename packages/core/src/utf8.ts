// Strict UTF-8 helpers. Callers map a null result to their own error code
// (invalid-payload for encoding, invalid-body for decoding).

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/** True if the string contains an unpaired UTF-16 surrogate code unit. */
export function hasLoneSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        i++;
      } else {
        return true;
      }
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return true;
    }
  }
  return false;
}

/** Encodes to UTF-8. Returns null if the string has a lone surrogate. Never throws. */
export function encodeUtf8Strict(s: string): Uint8Array | null {
  if (hasLoneSurrogate(s)) return null;
  return encoder.encode(s);
}

/**
 * Decodes UTF-8 and returns null on invalid input. Never throws.
 * A leading U+FEFF is kept (ignoreBOM: true).
 */
export function decodeUtf8Strict(bytes: Uint8Array): string | null {
  try {
    return decoder.decode(bytes);
  } catch {
    return null;
  }
}
