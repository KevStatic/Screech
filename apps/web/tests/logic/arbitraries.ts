import fc from 'fast-check';
import { encode } from '@screech/core';
import type {
  CodecError,
  CodecErrorCode,
  DecodedPacket,
  PacketFlags,
  PacketType,
  Payload,
  Result,
  WifiSecurity,
} from '@screech/core';

export type HoldEvent =
  | { readonly kind: 'press' }
  | { readonly kind: 'release' }
  | { readonly kind: 'cancel' }
  | { readonly kind: 'tick'; readonly elapsedMs: number };

export interface ContactFieldsInput {
  readonly name: string;
  readonly phone: string;
  readonly email: string;
}

export interface WifiFieldsInput {
  readonly ssid: string;
  readonly password: string;
  readonly security: WifiSecurity;
}

/** Characters that need escaping or sanitising somewhere in the app. */
export const SPECIAL_CHARS: readonly string[] = [
  '\\', ';', ',', ':', '"', '\n', '\r', '\u001f', '\t', ' ',
];

export const anyString: fc.Arbitrary<string> = fc.string({ maxLength: 64 });

export const unicodeString: fc.Arbitrary<string> = fc.string({ unit: 'binary', maxLength: 64 });

/** Strings built mostly from special characters, mixed with ordinary ones. */
export const specialCharString: fc.Arbitrary<string> = fc
  .array(
    fc.oneof(
      { arbitrary: fc.constantFrom(...SPECIAL_CHARS), weight: 3 },
      { arbitrary: fc.string({ minLength: 1, maxLength: 3 }), weight: 1 },
    ),
    { maxLength: 24 },
  )
  .map((parts) => parts.join(''));

export const fieldString: fc.Arbitrary<string> = fc.oneof(anyString, specialCharString, unicodeString);

export const contactFields: fc.Arbitrary<ContactFieldsInput> = fc.record({
  name: fieldString,
  phone: fieldString,
  email: fieldString,
});

export const wifiSecurity: fc.Arbitrary<WifiSecurity> = fc.constantFrom<WifiSecurity>(
  'open',
  'wpa',
  'wep',
);

export const wifiFields: fc.Arbitrary<WifiFieldsInput> = fc.record({
  ssid: fieldString,
  password: fieldString,
  security: wifiSecurity,
});

export const holdEvent: fc.Arbitrary<HoldEvent> = fc.oneof(
  fc.constant<HoldEvent>({ kind: 'press' }),
  fc.constant<HoldEvent>({ kind: 'release' }),
  fc.constant<HoldEvent>({ kind: 'cancel' }),
  fc
    .oneof(fc.integer({ min: -1000, max: 1000 }), fc.integer({ min: -100000, max: 100000 }))
    .map((elapsedMs): HoldEvent => ({ kind: 'tick', elapsedMs })),
);

export const holdEvents: fc.Arbitrary<HoldEvent[]> = fc.array(holdEvent, { maxLength: 60 });

/** A block of audio samples (Float32), up to 65536 samples. */
export const sampleBlock: fc.Arbitrary<Float32Array> = fc.float32Array({
  maxLength: 65536,
  noNaN: true,
  noDefaultInfinity: true,
});

export const sampleBlocks: fc.Arbitrary<Float32Array[]> = fc.array(sampleBlock, { maxLength: 6 });

export const ALL_CODEC_ERROR_CODES: readonly CodecErrorCode[] = [
  'bad-magic',
  'unsupported-version',
  'truncated',
  'unknown-type',
  'reserved-flags',
  'too-large',
  'invalid-payload',
  'invalid-wifi',
  'invalid-body',
  'auth-failed',
  'key-required',
  'invalid-key',
  'invalid-counter',
  'invalid-sender-id',
  'not-sealed',
  'crypto-unavailable',
];

export const codecError: fc.Arbitrary<CodecError> = fc
  .tuple(fc.constantFrom(...ALL_CODEC_ERROR_CODES), fc.nat({ max: 1000 }), anyString, anyString)
  .map(([code, length, field, message]): CodecError => {
    if (code === 'too-large') return { code, length, message };
    if (code === 'invalid-payload') return { code, field, message };
    return { code, message };
  });

const textPayloadType: fc.Arbitrary<'text' | 'contact' | 'checkin' | 'hunt-clue'> = fc.constantFrom(
  'text',
  'contact',
  'checkin',
  'hunt-clue',
);

export const payload: fc.Arbitrary<Payload> = fc.oneof(
  fc
    .tuple(textPayloadType, fc.string({ maxLength: 40 }))
    .map(([type, text]): Payload => ({ type, text })),
  fc
    .webUrl()
    .filter((u) => u.length <= 60)
    .map((url): Payload => ({ type: 'url', url })),
  fc
    .record({
      ssid: fc.string({ minLength: 1, maxLength: 16 }),
      password: fc.string({ maxLength: 16 }),
      security: wifiSecurity,
    })
    .map((w): Payload => ({ type: 'wifi', ...w })),
);

/** Payloads that are often well above the size cap, for byte-budget tests. */
export const heavyPayload: fc.Arbitrary<Payload> = fc.oneof(
  fc
    .tuple(textPayloadType, fc.string({ unit: 'binary', minLength: 100, maxLength: 400 }))
    .map(([type, text]): Payload => ({ type, text })),
  fc
    .string({ minLength: 100, maxLength: 400 })
    .map((tail): Payload => ({ type: 'url', url: `https://example.com/${tail}` })),
  fc
    .record({
      ssid: fc.string({ minLength: 1, maxLength: 100 }),
      password: fc.string({ maxLength: 200 }),
      security: wifiSecurity,
    })
    .map((w): Payload => ({ type: 'wifi', ...w })),
);

/** Mix of small payloads and payloads that usually exceed the cap. */
export const anySizePayload: fc.Arbitrary<Payload> = fc.oneof(payload, heavyPayload);

const noFlags: PacketFlags = { sealed: false, compressed: false, multipart: false };

/** Real decodes of generated packets: Ok with a DecodedPacket built by hand. */
const okPacket: fc.Arbitrary<Result<DecodedPacket>> = payload.map(
  (p): Result<DecodedPacket> => ({
    ok: true,
    value: { multipart: false, type: p.type as PacketType, flags: noFlags, payload: p },
  }),
);

const okMultipart: fc.Arbitrary<Result<DecodedPacket>> = fc
  .tuple(fc.constantFrom<PacketType>('text', 'url', 'wifi', 'contact', 'checkin', 'hunt-clue'), fc.uint8Array({ maxLength: 40 }), fc.boolean())
  .map(
    ([type, body, sealed]): Result<DecodedPacket> => ({
      ok: true,
      value: { multipart: true, type, flags: { sealed, compressed: false, multipart: true }, body },
    }),
  );

const errResult: fc.Arbitrary<Result<DecodedPacket>> = codecError.map(
  (error): Result<DecodedPacket> => ({ ok: false, error }),
);

/** Decodes the output of core `encode` for a payload, when it succeeds. */
export const encodedBytes: fc.Arbitrary<Uint8Array> = payload.chain((p) => {
  const r = encode(p);
  return r.ok ? fc.constant(r.value) : fc.constant(new Uint8Array(0));
});

export const decodedResult: fc.Arbitrary<Result<DecodedPacket>> = fc.oneof(
  okPacket,
  okMultipart,
  errResult,
);
