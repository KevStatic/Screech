/**
 * Shared fast-check generators for the Screech protocol tests.
 *
 * Nothing here imports from `src/` except types, so the generators stay
 * independent of the code under test.
 *
 * "Valid" payloads are well-formed (no lone surrogates, non-empty text, legal
 * Wi-Fi fields). `payloadArb` deliberately also produces payloads whose packet
 * would exceed the 140-byte cap (`too-large`), because the size boundary is
 * what the generator exists to probe. Round-trip tests should filter on a
 * successful `encode`.
 */
import fc from 'fast-check';
import type { Payload, WifiSecurity } from '../src/types.js';

type WifiPayload = Extract<Payload, { type: 'wifi' }>;
type TextLikeType = 'text' | 'contact' | 'checkin' | 'hunt-clue';

// ---------------------------------------------------------------------------
// Strings of an exact UTF-8 byte length
// ---------------------------------------------------------------------------

/** UTF-8 byte length of a single code point. */
function utf8Length(codePoint: number): number {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  if (codePoint < 0x10000) return 3;
  return 4;
}

/** A 3-byte code point that is not a surrogate. */
const threeByteArb: fc.Arbitrary<number> = fc
  .integer({ min: 0x800, max: 0xffff - 0x800 })
  .map((cp) => (cp >= 0xd800 ? cp + 0x800 : cp));

/**
 * One whole code point (never a lone surrogate). Includes U+0000, U+FEFF and
 * 2, 3 and 4 byte characters.
 */
const codePointArb: fc.Arbitrary<number> = fc.oneof(
  { weight: 6, arbitrary: fc.integer({ min: 0x20, max: 0x7e }) },
  { weight: 1, arbitrary: fc.constantFrom(0x00, 0x09, 0x0a, 0x20, 0xfeff) },
  { weight: 2, arbitrary: fc.integer({ min: 0x80, max: 0x7ff }) },
  { weight: 2, arbitrary: threeByteArb },
  { weight: 2, arbitrary: fc.integer({ min: 0x10000, max: 0x10ffff }) },
);

/**
 * A string whose UTF-8 encoding is exactly `byteLength` bytes, built from whole
 * code points, padded with ASCII where a multi-byte character would overshoot.
 */
function stringOfByteLength(byteLength: number): fc.Arbitrary<string> {
  return fc
    .array(codePointArb, { minLength: 0, maxLength: Math.max(byteLength, 1) })
    .map((points) => {
      let total = 0;
      let out = '';
      for (const cp of points) {
        const size = utf8Length(cp);
        if (total + size > byteLength) continue;
        out += String.fromCodePoint(cp);
        total += size;
      }
      return out + 'a'.repeat(byteLength - total);
    });
}

/** Byte lengths weighted around the sealed (123/124) and unsealed (137/138) body limits. */
const boundaryLengthArb: fc.Arbitrary<number> = fc.oneof(
  { weight: 6, arbitrary: fc.constantFrom(122, 123, 124, 125, 136, 137, 138, 139) },
  { weight: 2, arbitrary: fc.constantFrom(1, 2, 3) },
  { weight: 3, arbitrary: fc.integer({ min: 1, max: 160 }) },
);

/** Non-empty text of weighted byte length. */
const textArb: fc.Arbitrary<string> = boundaryLengthArb.chain(stringOfByteLength);

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

/** Upper and lower case spellings of the two accepted schemes. */
const schemeArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom('http', 'https'),
    fc.array(fc.boolean(), { minLength: 5, maxLength: 5 }),
  )
  .map(([scheme, flips]) =>
    [...scheme].map((ch, i) => (flips[i] === true ? ch.toUpperCase() : ch)).join(''),
  );

/** Host prefixes (some match the wire Prefix_Table, some are case variants that must not). */
const hostPrefixArb: fc.Arbitrary<string> = fc.constantFrom(
  '',
  'www.',
  'github.com/',
  'www.youtube.com/',
  'youtu.be/',
  'docs.google.com/',
  'zoom.us/',
  'linkedin.com/in/',
  'www.linkedin.com/in/',
  'en.wikipedia.org/wiki/',
  'WWW.',
  'GitHub.com/',
  'example.com/',
);

const urlTailCharArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 8, arbitrary: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789/._-?=&#%'.split('')) },
  { weight: 1, arbitrary: fc.integer({ min: 0x80, max: 0x7ff }).map((cp) => String.fromCodePoint(cp)) },
);

/** A valid http(s) URL: any scheme case, optional prefix, non-empty tail. */
const urlArb: fc.Arbitrary<string> = fc
  .tuple(
    schemeArb,
    hostPrefixArb,
    fc.array(urlTailCharArb, { minLength: 1, maxLength: 60 }).map((chars) => chars.join('')),
  )
  .map(([scheme, prefix, tail]) => `${scheme}://${prefix}${tail}`);

/**
 * A URL whose encoded Body is exactly `bodyLength` bytes (scheme byte plus
 * `bodyLength - 1` ASCII bytes). The tail starts with `q` so no Prefix_Table
 * prefix matches.
 */
function urlOfBodyLengthArb(bodyLength: number): fc.Arbitrary<string> {
  return fc
    .tuple(
      schemeArb,
      fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789/._-'.split('')), {
        minLength: bodyLength - 2,
        maxLength: bodyLength - 2,
      }),
    )
    .map(([scheme, chars]) => `${scheme}://q${chars.join('')}`);
}

const urlBoundaryArb: fc.Arbitrary<string> = fc
  .constantFrom(123, 124, 137, 138)
  .chain((n) => urlOfBodyLengthArb(n));

// ---------------------------------------------------------------------------
// Wi-Fi
// ---------------------------------------------------------------------------

const securedArb: fc.Arbitrary<WifiSecurity> = fc.constantFrom<WifiSecurity>('wpa', 'wep');
const anySecurityArb: fc.Arbitrary<WifiSecurity> = fc.constantFrom<WifiSecurity>('open', 'wpa', 'wep');

const validSsidArb: fc.Arbitrary<string> = fc
  .oneof(
    { weight: 3, arbitrary: fc.constantFrom(1, 31, 32) },
    { weight: 3, arbitrary: fc.integer({ min: 1, max: 32 }) },
  )
  .chain(stringOfByteLength);

const validPasswordArb: fc.Arbitrary<string> = fc
  .oneof(
    { weight: 3, arbitrary: fc.constantFrom(1, 62, 63) },
    { weight: 3, arbitrary: fc.integer({ min: 1, max: 63 }) },
  )
  .chain(stringOfByteLength);

/** A valid Wi-Fi payload. Open networks always have an empty password. */
const wifiArb: fc.Arbitrary<WifiPayload> = fc
  .tuple(validSsidArb, validPasswordArb, anySecurityArb)
  .map(([ssid, password, security]) => ({
    type: 'wifi' as const,
    ssid,
    password: security === 'open' ? '' : password,
    security,
  }));

/** Invalid: SSID is empty (0 bytes). Expected `invalid-payload`, field `ssid`. */
const wifiEmptySsidArb: fc.Arbitrary<WifiPayload> = fc
  .tuple(validPasswordArb, securedArb)
  .map(([password, security]) => ({ type: 'wifi' as const, ssid: '', password, security }));

/** Invalid: SSID over 32 UTF-8 bytes. Expected `invalid-payload`, field `ssid`. */
const wifiOversizedSsidArb: fc.Arbitrary<WifiPayload> = fc
  .tuple(
    fc.oneof(fc.constant(33), fc.integer({ min: 33, max: 80 })).chain(stringOfByteLength),
    validPasswordArb,
    securedArb,
  )
  .map(([ssid, password, security]) => ({ type: 'wifi' as const, ssid, password, security }));

/** Invalid: password over 63 UTF-8 bytes (WPA or WEP). Expected `invalid-payload`, field `password`. */
const wifiOversizedPasswordArb: fc.Arbitrary<WifiPayload> = fc
  .tuple(
    validSsidArb,
    fc.oneof(fc.constant(64), fc.integer({ min: 64, max: 120 })).chain(stringOfByteLength),
    securedArb,
  )
  .map(([ssid, password, security]) => ({ type: 'wifi' as const, ssid, password, security }));

/** Invalid: WPA or WEP with an empty password. Expected `invalid-payload`, field `password`. */
const wifiSecuredEmptyPasswordArb: fc.Arbitrary<WifiPayload> = fc
  .tuple(validSsidArb, securedArb)
  .map(([ssid, security]) => ({ type: 'wifi' as const, ssid, password: '', security }));

/** Invalid: open network with a non-empty password. Expected `invalid-wifi`. */
const wifiOpenWithPasswordArb: fc.Arbitrary<WifiPayload> = fc
  .tuple(validSsidArb, validPasswordArb)
  .map(([ssid, password]) => ({ type: 'wifi' as const, ssid, password, security: 'open' as const }));

// ---------------------------------------------------------------------------
// Payload
// ---------------------------------------------------------------------------

const textLikeTypeArb: fc.Arbitrary<TextLikeType> = fc.constantFrom<TextLikeType>(
  'text',
  'contact',
  'checkin',
  'hunt-clue',
);

const textLikePayloadArb: fc.Arbitrary<Payload> = fc
  .tuple(textLikeTypeArb, textArb)
  .map(([type, text]) => ({ type, text }));

const urlPayloadArb: fc.Arbitrary<Payload> = fc
  .oneof({ weight: 2, arbitrary: urlArb }, { weight: 1, arbitrary: urlBoundaryArb })
  .map((url) => ({ type: 'url' as const, url }));

/**
 * Any well-formed payload of the six types. Text-like and url lengths are
 * weighted around the 123/124 (sealed) and 137/138 (unsealed) body limits.
 * Some results are over the cap; `encode` and `seal` return `too-large` for those.
 */
const payloadArb: fc.Arbitrary<Payload> = fc.oneof(
  { weight: 4, arbitrary: textLikePayloadArb },
  { weight: 2, arbitrary: urlPayloadArb },
  { weight: 2, arbitrary: wifiArb },
);

// ---------------------------------------------------------------------------
// Keys, IDs, counters
// ---------------------------------------------------------------------------

/** 16-byte Room_Key. */
const keyArb: fc.Arbitrary<Uint8Array> = fc.uint8Array({ minLength: 16, maxLength: 16 });

/** 4-byte Sender_ID. */
const senderIdArb: fc.Arbitrary<Uint8Array> = fc.uint8Array({ minLength: 4, maxLength: 4 });

/** Counter 0..65535, weighted to the ends. */
const counterArb: fc.Arbitrary<number> = fc.oneof(
  { weight: 3, arbitrary: fc.constantFrom(0, 65535) },
  { weight: 1, arbitrary: fc.constantFrom(1, 255, 256, 65534) },
  { weight: 3, arbitrary: fc.integer({ min: 0, max: 65535 }) },
);

// ---------------------------------------------------------------------------
// Arbitrary bytes and values
// ---------------------------------------------------------------------------

/**
 * 0 to 300 random bytes. About half start with 0xC1 so decoding reaches the
 * later header checks; some also get a type byte 0..5 and flags 0..7.
 */
const anyBytesArb: fc.Arbitrary<Uint8Array> = fc
  .tuple(fc.uint8Array({ minLength: 0, maxLength: 300 }), fc.integer({ min: 0, max: 3 }))
  .map(([raw, mode]) => {
    const bytes = Uint8Array.from(raw);
    if (mode <= 1 && bytes.length >= 1) bytes[0] = 0xc1;
    if (mode === 2 && bytes.length >= 3) {
      bytes[0] = 0xc1;
      bytes[1] = (bytes[1] ?? 0) % 6;
      bytes[2] = (bytes[2] ?? 0) & 0x07;
    }
    return bytes;
  });

/** Typed arrays and buffers that are not `Uint8Array`. */
const nonUint8ArrayBinaryArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.int8Array({ maxLength: 20 }),
  fc.uint8ClampedArray({ maxLength: 20 }),
  fc.uint16Array({ maxLength: 20 }),
  fc.int16Array({ maxLength: 20 }),
  fc.uint32Array({ maxLength: 20 }),
  fc.int32Array({ maxLength: 20 }),
  fc.float32Array({ maxLength: 20 }),
  fc.float64Array({ maxLength: 20 }),
  fc.uint8Array({ maxLength: 20 }).map((bytes) => bytes.buffer),
  fc.uint8Array({ maxLength: 20 }).map((bytes) => new DataView(bytes.buffer)),
);

/** Payload-shaped objects with wrong field types or unknown types. */
const malformedPayloadArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.record({ type: fc.constantFrom('text', 'url', 'wifi', 'contact'), text: fc.oneof(fc.integer(), fc.constant(null)) }),
  fc.record({ type: fc.string(), text: fc.string() }),
  fc.record({ type: fc.constant('wifi'), ssid: fc.integer(), password: fc.string(), security: fc.string() }),
  fc.record({ type: fc.constant('url'), url: fc.oneof(fc.integer(), fc.array(fc.string())) }),
  fc.constant({}),
);

/** Arbitrary values for totality tests: nothing a caller could pass may make the codec throw. */
const anythingArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.integer(),
  fc.double({ noNaN: false }),
  fc.constantFrom(NaN, Infinity, -Infinity, -0),
  fc.bigInt(),
  fc.boolean(),
  fc.string(),
  fc.anything(),
  fc.array(fc.anything(), { maxLength: 10 }),
  fc.array(fc.integer({ min: 0, max: 255 }), { maxLength: 20 }),
  nonUint8ArrayBinaryArb,
  fc.uint8Array({ maxLength: 20 }),
  malformedPayloadArb,
  fc.constant(() => 0),
  fc.constant(Symbol('x')),
);

// ---------------------------------------------------------------------------
// Lone surrogates
// ---------------------------------------------------------------------------

const wholeCharsArb: fc.Arbitrary<string> = fc
  .array(codePointArb, { maxLength: 30 })
  .map((points) => points.map((cp) => String.fromCodePoint(cp)).join(''));

/**
 * A string containing exactly one lone surrogate (high or low), with the
 * surrounding text built from whole code points so it never forms a pair.
 */
const stringWithLoneSurrogateArb: fc.Arbitrary<string> = fc
  .tuple(
    wholeCharsArb,
    fc.oneof(
      fc.integer({ min: 0xd800, max: 0xdbff }),
      fc.integer({ min: 0xdc00, max: 0xdfff }),
    ),
    wholeCharsArb,
  )
  .map(([before, surrogate, after]) => before + String.fromCharCode(surrogate) + after);

export {
  anyBytesArb,
  anythingArb,
  counterArb,
  keyArb,
  malformedPayloadArb,
  nonUint8ArrayBinaryArb,
  payloadArb,
  senderIdArb,
  stringOfByteLength,
  stringWithLoneSurrogateArb,
  textArb,
  urlArb,
  wifiArb,
  wifiEmptySsidArb,
  wifiOpenWithPasswordArb,
  wifiOversizedPasswordArb,
  wifiOversizedSsidArb,
  wifiSecuredEmptyPasswordArb,
};
