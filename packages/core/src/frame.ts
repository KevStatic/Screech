import {
  FLAG_COMPRESSED,
  FLAG_MULTIPART,
  FLAG_RESERVED_MASK,
  FLAG_SEALED,
  HEADER_BYTE,
  MAGIC_NIBBLE,
  TYPE_VALUE,
  UNSEALED_OVERHEAD,
  VERSION,
} from './constants.js';
import { isUint8Array } from './guards.js';
import { err, ok } from './result.js';
import type { Result } from './result.js';
import type { PacketFlags, PacketType } from './types.js';

export interface ParsedFrame {
  readonly type: PacketType;
  readonly flags: PacketFlags;
  readonly body: Uint8Array;
}

const TYPE_BY_VALUE: readonly PacketType[] = [
  'text',
  'url',
  'wifi',
  'contact',
  'checkin',
  'hunt-clue',
];

/**
 * Builds `0xC1 || type || flags || body`. Does no size checking; `encode` and
 * `seal` check the size cap. The body is copied.
 */
export function buildFrame(type: PacketType, flags: PacketFlags, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(UNSEALED_OVERHEAD + body.length);
  out[0] = HEADER_BYTE;
  out[1] = TYPE_VALUE[type];
  out[2] =
    (flags.sealed ? FLAG_SEALED : 0) |
    (flags.compressed ? FLAG_COMPRESSED : 0) |
    (flags.multipart ? FLAG_MULTIPART : 0);
  out.set(body, UNSEALED_OVERHEAD);
  return out;
}

/**
 * Validates the three header bytes in the order: input type, truncated, magic,
 * version, type, reserved flags. Returns a copy of the bytes after index 2.
 * Never throws.
 */
export function parseFrame(bytes: Uint8Array): Result<ParsedFrame> {
  try {
    if (!isUint8Array(bytes)) {
      return err({
        code: 'invalid-payload',
        field: 'packet',
        message: 'packet must be a Uint8Array',
      });
    }
    if (bytes.length < UNSEALED_OVERHEAD) {
      return err({ code: 'truncated', message: 'packet is shorter than the 3-byte header' });
    }
    const first = bytes[0] as number;
    if (first >>> 4 !== MAGIC_NIBBLE) {
      return err({ code: 'bad-magic', message: 'magic nibble does not match' });
    }
    if ((first & 0x0f) !== VERSION) {
      return err({ code: 'unsupported-version', message: 'unsupported packet version' });
    }
    const typeValue = bytes[1] as number;
    const type = TYPE_BY_VALUE[typeValue];
    if (type === undefined) {
      return err({ code: 'unknown-type', message: 'unknown packet type' });
    }
    const flagByte = bytes[2] as number;
    if ((flagByte & FLAG_RESERVED_MASK) !== 0) {
      return err({ code: 'reserved-flags', message: 'reserved flag bits are set' });
    }
    return ok({
      type,
      flags: {
        sealed: (flagByte & FLAG_SEALED) !== 0,
        compressed: (flagByte & FLAG_COMPRESSED) !== 0,
        multipart: (flagByte & FLAG_MULTIPART) !== 0,
      },
      body: bytes.slice(UNSEALED_OVERHEAD),
    });
  } catch {
    return err({
      code: 'invalid-payload',
      field: 'packet',
      message: 'packet could not be read',
    });
  }
}
