// @screech/core public API
export { encode, decode } from './codec.js';
export { seal, open, deriveNonce } from './seal.js';
export { nextSenderState } from './sender-state.js';
export type { RandomFill } from './sender-state.js';
export { buildFrame, parseFrame } from './frame.js';
export { PREFIX_TABLE } from './prefix-table.js';
export {
  VERSION,
  SIZE_CAP,
  UNSEALED_OVERHEAD,
  SEALED_OVERHEAD,
  MAX_UNSEALED_BODY,
  MAX_SEALED_BODY,
  ROOM_KEY_LENGTH,
  SENDER_ID_LENGTH,
  COUNTER_MAX,
} from './constants.js';
export type {
  PacketType,
  WifiSecurity,
  Payload,
  PacketFlags,
  DecodedPacket,
  SenderState,
} from './types.js';
export type { Result, Ok, Err, CodecError, CodecErrorCode } from './result.js';
