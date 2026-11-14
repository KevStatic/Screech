import type { PacketType, WifiSecurity } from './types.js';

/** High nibble of byte 0. Neither all-zero nor all-one. */
export const MAGIC_NIBBLE = 0xc;
/** Low nibble of byte 0. */
export const VERSION = 1;
/** First byte of every Packet_V1: `(MAGIC_NIBBLE << 4) | VERSION`. */
export const HEADER_BYTE = 0xc1;

export const TYPE_VALUE: Readonly<Record<PacketType, number>> = {
  text: 0,
  url: 1,
  wifi: 2,
  contact: 3,
  checkin: 4,
  'hunt-clue': 5,
};

export const FLAG_SEALED = 0x01;
export const FLAG_COMPRESSED = 0x02;
export const FLAG_MULTIPART = 0x04;
export const FLAG_RESERVED_MASK = 0xf8;

export const SECURITY_VALUE: Readonly<Record<WifiSecurity, number>> = {
  open: 0,
  wpa: 1,
  wep: 2,
};

/** Maximum total packet length in bytes. */
export const SIZE_CAP = 140;
/** Header (1) + type (1) + flags (1). */
export const UNSEALED_OVERHEAD = 3;
/** Header 3 + Sender_ID 4 + Counter 2 + tag 8. */
export const SEALED_OVERHEAD = 17;
export const MAX_UNSEALED_BODY = SIZE_CAP - UNSEALED_OVERHEAD; // 137
export const MAX_SEALED_BODY = SIZE_CAP - SEALED_OVERHEAD; // 123

export const ROOM_KEY_LENGTH = 16;
export const SENDER_ID_LENGTH = 4;
export const COUNTER_LENGTH = 2;
export const COUNTER_MAX = 65535;
export const TAG_LENGTH_BITS = 64;
export const TAG_LENGTH_BYTES = 8;
export const NONCE_LENGTH = 12;
