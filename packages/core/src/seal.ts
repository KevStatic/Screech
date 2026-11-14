import { decodeBody, encodeBody } from './body.js';
import {
  COUNTER_MAX,
  FLAG_COMPRESSED,
  FLAG_SEALED,
  HEADER_BYTE,
  NONCE_LENGTH,
  SEALED_OVERHEAD,
  SIZE_CAP,
  TAG_LENGTH_BITS,
  TYPE_VALUE,
} from './constants.js';
import { parseFrame } from './frame.js';
import { isCounter, isRoomKey, isSenderId, isUint8Array } from './guards.js';
import { err, ok } from './result.js';
import type { Result } from './result.js';
import type { DecodedPacket, Payload } from './types.js';

const COUNTER_BYTES_OFFSET = 4;

/**
 * Derives the 12-byte AES-GCM nonce: Sender_ID (4) || Counter (2, big-endian) || six zero
 * bytes. Returns a new array. Never throws.
 */
export function deriveNonce(senderId: Uint8Array, counter: number): Result<Uint8Array> {
  try {
    if (!isSenderId(senderId)) {
      return err({ code: 'invalid-sender-id', message: 'Sender_ID must be a 4-byte Uint8Array' });
    }
    if (!isCounter(counter)) {
      return err({
        code: 'invalid-counter',
        message: `Counter must be an integer from 0 to ${COUNTER_MAX}`,
      });
    }
    const nonce = new Uint8Array(NONCE_LENGTH);
    nonce.set(senderId, 0);
    nonce[COUNTER_BYTES_OFFSET] = (counter >>> 8) & 0xff;
    nonce[COUNTER_BYTES_OFFSET + 1] = counter & 0xff;
    return ok(nonce);
  } catch {
    return err({ code: 'invalid-sender-id', message: 'Sender_ID could not be read' });
  }
}

function cryptoUnavailable(): Result<never> {
  return err({
    code: 'crypto-unavailable',
    message: 'Web Crypto (crypto.subtle) is not available or failed',
  });
}

/**
 * Seals a payload into a Sealed_Packet of at most 140 bytes using AES-GCM with a 64-bit tag.
 * Output: header(3) || sender_id(4) || counter(2, BE) || ciphertext || tag(8).
 * The returned Promise never rejects. Inputs are copied, never mutated or retained.
 */
export async function seal(
  payload: Payload,
  roomKey: Uint8Array,
  senderId: Uint8Array,
  counter: number,
): Promise<Result<Uint8Array>> {
  try {
    if (!isRoomKey(roomKey)) {
      return err({ code: 'invalid-key', message: 'Room_Key must be a 16-byte Uint8Array' });
    }
    if (!isSenderId(senderId)) {
      return err({ code: 'invalid-sender-id', message: 'Sender_ID must be a 4-byte Uint8Array' });
    }
    if (!isCounter(counter)) {
      return err({
        code: 'invalid-counter',
        message: `Counter must be an integer from 0 to ${COUNTER_MAX}`,
      });
    }

    const encoded = encodeBody(payload);
    if (!encoded.ok) return encoded;
    const { type, compressed, body } = encoded.value;

    const length = SEALED_OVERHEAD + body.length;
    if (length > SIZE_CAP) {
      return err({
        code: 'too-large',
        length,
        message: `packet would be ${length} bytes, the cap is ${SIZE_CAP}`,
      });
    }

    const nonceResult = deriveNonce(senderId, counter);
    if (!nonceResult.ok) return nonceResult;
    const nonce = nonceResult.value;

    const subtle = globalThis.crypto?.subtle;
    if (subtle === undefined || subtle === null) return cryptoUnavailable();

    const flags = FLAG_SEALED | (compressed ? FLAG_COMPRESSED : 0);
    const aad = new Uint8Array([HEADER_BYTE, TYPE_VALUE[type], flags]);

    const key = await subtle.importKey('raw', roomKey.slice(), { name: 'AES-GCM' }, false, [
      'encrypt',
      'decrypt',
    ]);
    const encrypted = new Uint8Array(
      await subtle.encrypt(
        { name: 'AES-GCM', iv: nonce, additionalData: aad, tagLength: TAG_LENGTH_BITS },
        key,
        body.slice(),
      ),
    );

    const out = new Uint8Array(aad.length + senderId.length + 2 + encrypted.length);
    out.set(aad, 0);
    out.set(senderId, aad.length);
    out[aad.length + senderId.length] = (counter >>> 8) & 0xff;
    out[aad.length + senderId.length + 1] = counter & 0xff;
    out.set(encrypted, aad.length + senderId.length + 2);
    return ok(out);
  } catch {
    return cryptoUnavailable();
  }
}

const SENDER_ID_OFFSET = 3;
const COUNTER_OFFSET = 7;
const CIPHERTEXT_OFFSET = 9;

/**
 * Opens a Sealed_Packet with AES-GCM. Returns the same DecodedPacket shape as `decode`
 * (flags are those of the packet, so `flags.sealed` is true). The returned Promise never
 * rejects. Inputs are copied, never mutated or retained.
 */
export async function open(
  packet: Uint8Array,
  roomKey: Uint8Array | undefined,
): Promise<Result<DecodedPacket>> {
  try {
    if (!isUint8Array(packet)) {
      return err({
        code: 'invalid-payload',
        field: 'packet',
        message: 'packet must be a Uint8Array',
      });
    }
    const bytes = packet.slice();
    const frame = parseFrame(bytes);
    if (!frame.ok) return frame;
    const { type, flags } = frame.value;
    if (!flags.sealed) {
      return err({ code: 'not-sealed', message: 'packet is not sealed' });
    }
    if (bytes.length < SEALED_OVERHEAD) {
      return err({ code: 'truncated', message: 'sealed packet is shorter than 17 bytes' });
    }
    if (roomKey === undefined || roomKey === null) {
      return err({ code: 'key-required', message: 'packet is sealed and needs a room key' });
    }
    if (!isRoomKey(roomKey)) {
      return err({ code: 'invalid-key', message: 'Room_Key must be a 16-byte Uint8Array' });
    }

    const counter = ((bytes[COUNTER_OFFSET] as number) << 8) | (bytes[COUNTER_OFFSET + 1] as number);
    const nonceResult = deriveNonce(bytes.slice(SENDER_ID_OFFSET, COUNTER_OFFSET), counter);
    if (!nonceResult.ok) return cryptoUnavailable();

    const subtle = globalThis.crypto?.subtle;
    if (subtle === undefined || subtle === null) return cryptoUnavailable();

    let plain: Uint8Array;
    try {
      const key = await subtle.importKey('raw', roomKey.slice(), { name: 'AES-GCM' }, false, [
        'decrypt',
      ]);
      plain = new Uint8Array(
        await subtle.decrypt(
          {
            name: 'AES-GCM',
            iv: nonceResult.value,
            additionalData: bytes.slice(0, 3),
            tagLength: TAG_LENGTH_BITS,
          },
          key,
          bytes.slice(CIPHERTEXT_OFFSET),
        ),
      );
    } catch (e) {
      if (e instanceof Error && e.name === 'OperationError') {
        return err({ code: 'auth-failed', message: 'authentication tag mismatch' });
      }
      return cryptoUnavailable();
    }

    if (flags.multipart) {
      return ok({ multipart: true, type, flags, body: plain });
    }
    const payload = decodeBody(type, flags.compressed, plain);
    if (!payload.ok) return payload;
    return ok({ multipart: false, type, flags, payload: payload.value });
  } catch {
    return cryptoUnavailable();
  }
}
