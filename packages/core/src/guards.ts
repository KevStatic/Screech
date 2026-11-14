import { COUNTER_MAX, ROOM_KEY_LENGTH, SENDER_ID_LENGTH } from './constants.js';

/**
 * True for a Uint8Array, including one created in another realm (for example an
 * iframe), where `instanceof` fails. Never throws.
 */
export function isUint8Array(value: unknown): value is Uint8Array {
  try {
    return (
      value instanceof Uint8Array ||
      Object.prototype.toString.call(value) === '[object Uint8Array]'
    );
  } catch {
    return false;
  }
}

function hasLength(value: unknown, length: number): value is Uint8Array {
  try {
    return isUint8Array(value) && value.length === length;
  } catch {
    return false;
  }
}

/** True for a Uint8Array of exactly 4 bytes. Never throws. */
export function isSenderId(value: unknown): value is Uint8Array {
  return hasLength(value, SENDER_ID_LENGTH);
}

/** True for an integer number in 0..65535. Never throws. */
export function isCounter(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= COUNTER_MAX
  );
}

/** True for a Uint8Array of exactly 16 bytes. Never throws. */
export function isRoomKey(value: unknown): value is Uint8Array {
  return hasLength(value, ROOM_KEY_LENGTH);
}
