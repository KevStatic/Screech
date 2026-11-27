/** Time-based Rolling_Code: HMAC-SHA-256 over the decimal Window_Number, RFC 4226 dynamic truncation. */

export const WINDOW_SECONDS = 30;

const CODE_DIGITS = 6;
const CODE_MODULUS = 1_000_000;
const CODE_PATTERN = /^[0-9]{6}$/;

/** The 30-second Window that contains the given Unix time in seconds. */
export function windowNumber(unixSeconds: number): number {
  return Math.floor(unixSeconds / WINDOW_SECONDS);
}

/** 6-digit zero-padded code for one Window. Rejects if Web Crypto is unavailable or fails. */
export async function rollingCode(secret: Uint8Array, windowNumber: number): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined || subtle === null) {
    throw new Error('Web Crypto (crypto.subtle) is not available');
  }
  const key = await subtle.importKey(
    'raw',
    secret,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const message = new TextEncoder().encode(String(windowNumber));
  const digest = new Uint8Array(await subtle.sign('HMAC', key, message));
  const offset = (digest[digest.length - 1] as number) & 0x0f;
  const value =
    ((((digest[offset] as number) & 0x7f) << 24) |
      ((digest[offset + 1] as number) << 16) |
      ((digest[offset + 2] as number) << 8) |
      (digest[offset + 3] as number)) >>>
    0;
  return String(value % CODE_MODULUS).padStart(CODE_DIGITS, '0');
}

/** True when `code` matches the current or the previous Window. Never throws. */
export async function verifyCode(
  secret: Uint8Array,
  code: string,
  nowSeconds: number,
): Promise<boolean> {
  try {
    if (typeof code !== 'string' || !CODE_PATTERN.test(code)) return false;
    if (typeof nowSeconds !== 'number' || !Number.isFinite(nowSeconds) || nowSeconds < 0) {
      return false;
    }
    if (globalThis.crypto?.subtle === undefined || globalThis.crypto?.subtle === null) return false;
    const current = windowNumber(nowSeconds);
    if ((await rollingCode(secret, current)) === code) return true;
    if (current === 0) return false;
    return (await rollingCode(secret, current - 1)) === code;
  } catch {
    return false;
  }
}
