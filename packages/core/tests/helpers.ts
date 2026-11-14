/**
 * Independent reference implementations for the screech-protocol tests.
 * Nothing here imports from `src/`; every constant is hardcoded on purpose,
 * so a wrong constant in `src/` cannot hide behind a matching wrong constant here.
 */

/** Minimum fast-check runs per property (Requirement 12.11). */
export const NUM_RUNS = 100;

// ---------------------------------------------------------------------------
// Header classifier
// ---------------------------------------------------------------------------

export type HeaderErrorCode =
  | 'truncated'
  | 'bad-magic'
  | 'unsupported-version'
  | 'unknown-type'
  | 'reserved-flags';

/**
 * Returns the first header error in the order: truncated (under 3 bytes),
 * bad-magic, unsupported-version, unknown-type (type above 5), reserved-flags
 * (any bit of flags & 0xF8). Returns `null` when the header is valid.
 */
export function classifyHeader(bytes: Uint8Array): HeaderErrorCode | null {
  if (bytes.length < 3) return 'truncated';
  const header = bytes[0] as number;
  const type = bytes[1] as number;
  const flags = bytes[2] as number;
  if (header >> 4 !== 0xc) return 'bad-magic';
  if ((header & 0x0f) !== 1) return 'unsupported-version';
  if (type > 5) return 'unknown-type';
  if ((flags & 0xf8) !== 0) return 'reserved-flags';
  return null;
}

// ---------------------------------------------------------------------------
// Reference URL compressor
// ---------------------------------------------------------------------------

/** Prefix_Table from design.md, codes 0x01 to 0x10. */
export const REFERENCE_PREFIXES: ReadonlyArray<readonly [number, string]> = [
  [0x01, 'www.'],
  [0x02, 'github.com/'],
  [0x03, 'www.youtube.com/'],
  [0x04, 'youtu.be/'],
  [0x05, 'docs.google.com/'],
  [0x06, 'drive.google.com/'],
  [0x07, 'meet.google.com/'],
  [0x08, 'zoom.us/'],
  [0x09, 'discord.gg/'],
  [0x0a, 'linkedin.com/in/'],
  [0x0b, 'www.linkedin.com/in/'],
  [0x0c, 'twitter.com/'],
  [0x0d, 'x.com/'],
  [0x0e, 'bit.ly/'],
  [0x0f, 'en.wikipedia.org/wiki/'],
  [0x10, 'forms.gle/'],
];

export interface ReferenceUrlBody {
  /** Scheme byte: bit 7 = https, bits 6..0 = prefix code (0 for none). */
  readonly schemeByte: number;
  /** The URL with scheme and matched prefix removed. */
  readonly remainder: string;
  /** `[schemeByte] || utf8(remainder)`. */
  readonly body: Uint8Array;
}

/**
 * Compresses a URL as the design describes. Returns `null` when the URL has no
 * http(s) scheme or nothing after it. The scheme match is case-insensitive;
 * the prefix match is case-sensitive and picks the longest entry.
 */
export function referenceCompressUrl(url: string): ReferenceUrlBody | null {
  const match = /^(https?):\/\//i.exec(url);
  if (match === null) return null;
  const https = (match[1] as string).toLowerCase() === 'https';
  const rest = url.slice(match[0].length);
  if (rest.length === 0) return null;

  let code = 0;
  let prefix = '';
  for (const [c, p] of REFERENCE_PREFIXES) {
    if (rest.startsWith(p) && p.length > prefix.length) {
      code = c;
      prefix = p;
    }
  }
  const remainder = rest.slice(prefix.length);
  const schemeByte = (https ? 0x80 : 0x00) | code;
  const tail = new TextEncoder().encode(remainder);
  const body = new Uint8Array(1 + tail.length);
  body[0] = schemeByte;
  body.set(tail, 1);
  return { schemeByte, remainder, body };
}

// ---------------------------------------------------------------------------
// Reference Wi-Fi body builder
// ---------------------------------------------------------------------------

export type ReferenceWifiSecurity = 'open' | 'wpa' | 'wep';

const SECURITY_BYTE: Readonly<Record<ReferenceWifiSecurity, number>> = {
  open: 0,
  wpa: 1,
  wep: 2,
};

/**
 * Builds `security | ssid_len | ssid | password_len | password`.
 * Assumes the inputs are already valid (SSID 1..32 bytes, password 0..63
 * bytes, empty password for open). Open networks write no password bytes.
 */
export function referenceWifiBody(
  security: ReferenceWifiSecurity,
  ssid: string,
  password: string,
): Uint8Array {
  const enc = new TextEncoder();
  const ssidBytes = enc.encode(ssid);
  const passBytes = security === 'open' ? new Uint8Array(0) : enc.encode(password);
  const body = new Uint8Array(3 + ssidBytes.length + passBytes.length);
  let i = 0;
  body[i++] = SECURITY_BYTE[security];
  body[i++] = ssidBytes.length;
  body.set(ssidBytes, i);
  i += ssidBytes.length;
  body[i++] = passBytes.length;
  body.set(passBytes, i);
  return body;
}
