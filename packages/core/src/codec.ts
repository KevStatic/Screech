import { decodeBody, encodeBody } from './body.js';
import { SIZE_CAP, UNSEALED_OVERHEAD } from './constants.js';
import { buildFrame, parseFrame } from './frame.js';
import { isUint8Array } from './guards.js';
import { err, ok } from './result.js';
import type { Result } from './result.js';
import type { DecodedPacket, Payload } from './types.js';

/**
 * Encodes a payload into an unsealed, single-part Packet_V1 of at most 140 bytes.
 * Never sets the sealed or multipart flag. Never throws.
 */
export function encode(payload: Payload): Result<Uint8Array> {
  try {
    const encoded = encodeBody(payload);
    if (!encoded.ok) return encoded;
    const { type, compressed, body } = encoded.value;
    const length = UNSEALED_OVERHEAD + body.length;
    if (length > SIZE_CAP) {
      return err({
        code: 'too-large',
        length,
        message: `packet would be ${length} bytes, the cap is ${SIZE_CAP}`,
      });
    }
    return ok(buildFrame(type, { sealed: false, compressed, multipart: false }, body));
  } catch {
    return err({
      code: 'invalid-payload',
      field: 'payload',
      message: 'payload could not be encoded',
    });
  }
}

/**
 * Decodes an unsealed Packet_V1. A sealed packet gives `key-required`. A multipart
 * packet returns its raw body without interpretation. Never throws.
 */
export function decode(packet: Uint8Array): Result<DecodedPacket> {
  try {
    if (!isUint8Array(packet)) {
      return err({
        code: 'invalid-payload',
        field: 'packet',
        message: 'packet must be a Uint8Array',
      });
    }
    const frame = parseFrame(packet);
    if (!frame.ok) return frame;
    const { type, flags, body } = frame.value;
    if (flags.sealed) {
      return err({ code: 'key-required', message: 'packet is sealed and needs a room key' });
    }
    if (flags.multipart) {
      return ok({ multipart: true, type, flags, body: body.slice() });
    }
    const payload = decodeBody(type, flags.compressed, body);
    if (!payload.ok) return payload;
    return ok({ multipart: false, type, flags, payload: payload.value });
  } catch {
    return err({ code: 'invalid-body', message: 'packet could not be decoded' });
  }
}
