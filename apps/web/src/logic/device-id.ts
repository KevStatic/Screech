/** A Device_ID is 16 random bytes written as 32 lowercase hex characters. */

export const DEVICE_ID_BYTES = 16;
export const DEVICE_ID_LENGTH = DEVICE_ID_BYTES * 2;

const DEVICE_ID_PATTERN = /^[0-9a-f]{32}$/;

export function isDeviceId(value: unknown): value is string {
  return typeof value === 'string' && DEVICE_ID_PATTERN.test(value);
}

/** `randomBytes` is injected (crypto.getRandomValues in the app, a seeded fake in tests). */
export function randomDeviceId(randomBytes: (n: number) => Uint8Array): string {
  const bytes = randomBytes(DEVICE_ID_BYTES);
  let out = '';
  for (let i = 0; i < DEVICE_ID_BYTES; i += 1) {
    out += (bytes[i] ?? 0).toString(16).padStart(2, '0');
  }
  return out;
}
