import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { HUNT_ALPHABET, SPIRIT_NAME_MAX_BYTES } from '@screech/core';
import { encodeSetupLink } from '../../src/logic/hunt-link';
import { layoutQr, QR_QUIET_MODULES } from '../../src/logic/qr-layout';

const DARK = [0x05, 0x08, 0x06] as const; // #050806
const LIGHT = [0xe9, 0xe4, 0xd4] as const; // #e9e4d4
const CLUE_MAX_BYTES = 128;
const AVAILABLE_CSS_PX = 340;

const encoder = new TextEncoder();

/** Longest prefix (by whole code points) that fits the byte budget, trimmed. */
function fitBytes(chars: readonly string[], maxBytes: number): string {
  let out = '';
  let used = 0;
  for (const ch of chars) {
    const n = encoder.encode(ch).length;
    if (used + n > maxBytes) break;
    out += ch;
    used += n;
  }
  return out.trim();
}

const asciiChar = fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
const punctChar = fc.constantFrom(...'!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~ ');
const accentChar = fc.constantFrom(...'éèêëàâäôöùûüçñßÅøæœÿÉÑ');
const cjkChar = fc.constantFrom(...'幽霊鬼影暗夜墓地古井戸の森한국어日本語');
const emojiChar = fc.constantFrom(...'👻💀🕯️🦇🕸️⚰️🌑🔮');

const textChars = fc.array(
  fc.oneof(
    { weight: 3, arbitrary: asciiChar },
    { weight: 2, arbitrary: punctChar },
    { weight: 2, arbitrary: accentChar },
    { weight: 2, arbitrary: cjkChar },
    { weight: 2, arbitrary: emojiChar },
  ),
  { minLength: 1, maxLength: 140 },
);

// Characters that are 3 or 4 bytes long inflate the percent-encoded link the most.
const heavyChars = fc.array(fc.oneof(cjkChar, emojiChar), { minLength: 30, maxLength: 140 });

const nameArb = fc
  .oneof({ weight: 3, arbitrary: heavyChars }, { weight: 2, arbitrary: textChars })
  .map((chars) => fitBytes(chars, SPIRIT_NAME_MAX_BYTES))
  .filter((s) => s.length > 0);

const clueArb = fc
  .oneof({ weight: 3, arbitrary: heavyChars }, { weight: 2, arbitrary: textChars })
  .map((chars) => fitBytes(chars, CLUE_MAX_BYTES))
  .filter((s) => s.length > 0);

const huntIdArb = fc
  .array(fc.constantFrom(...HUNT_ALPHABET), { minLength: 6, maxLength: 6 })
  .map((a) => a.join(''));

const pathChar = fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_/');

/** https://host/path with a total length of 20 to 100 characters and no fragment. */
const baseUrlArb = fc
  .tuple(fc.integer({ min: 20, max: 100 }), fc.boolean(), fc.array(pathChar, { minLength: 100, maxLength: 100 }))
  .map(([length, secure, filler]) => {
    const head = `${secure ? 'https' : 'http'}://screech.example/`;
    const rest = filler.slice(0, Math.max(0, length - head.length)).join('');
    return (head + rest).slice(0, length);
  });

const fieldsArb = fc
  .integer({ min: 3, max: 7 })
  .chain((total) =>
    fc.record({
      huntId: huntIdArb,
      index: fc.integer({ min: 1, max: total }),
      total: fc.constant(total),
      name: nameArb,
      clue: clueArb,
    }),
  );

/** Draws the matrix into an RGBA array: quiet zone, then modules, app colours. */
function rasterise(
  size: number,
  data: ArrayLike<number>,
  modulePx: number,
): { pixels: Uint8ClampedArray; width: number } {
  const total = size + 2 * QR_QUIET_MODULES;
  const width = total * modulePx;
  const pixels = new Uint8ClampedArray(width * width * 4);
  for (let y = 0; y < width; y++) {
    const row = Math.floor(y / modulePx) - QR_QUIET_MODULES;
    for (let x = 0; x < width; x++) {
      const col = Math.floor(x / modulePx) - QR_QUIET_MODULES;
      const dark = row >= 0 && col >= 0 && row < size && col < size && data[row * size + col] === 1;
      const rgb = dark ? DARK : LIGHT;
      const i = (y * width + x) * 4;
      pixels[i] = rgb[0];
      pixels[i + 1] = rgb[1];
      pixels[i + 2] = rgb[2];
      pixels[i + 3] = 255;
    }
  }
  return { pixels, width };
}

describe('qr-scan', () => {
  it('scans a fixed longest-case link at dpr 1', () => {
    const name = '幽'.repeat(8);
    const clue = '👻'.repeat(32);
    const res = encodeSetupLink(`https://screech.example/${'a'.repeat(76)}`, {
      huntId: 'ABCDEF',
      index: 7,
      total: 7,
      name,
      clue,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const qr = QRCode.create(res.link, { errorCorrectionLevel: 'M' });
    const layout = layoutQr(qr.modules.size, AVAILABLE_CSS_PX, 1);
    expect(layout.fits).toBe(true);
    const { pixels, width } = rasterise(qr.modules.size, qr.modules.data, layout.modulePx);
    expect(jsQR(pixels, width, width)?.data).toBe(res.link);
  });

  it(
    // Feature: ghost-hunt, Property 11: A full-size Setup QR scans
    'Feature: ghost-hunt, Property 11: A full-size Setup QR scans',
    () => {
      // **Validates: Requirements 6.1, 6.4**
      fc.assert(
        fc.property(
          baseUrlArb,
          fieldsArb,
          fc.constantFrom(1, 2, 3),
          (baseUrl, fields, dpr) => {
            const res = encodeSetupLink(baseUrl, fields);
            if (!res.ok) throw new Error(`link rejected: ${res.error.message}`);

            const qr = QRCode.create(res.link, { errorCorrectionLevel: 'M' });
            const size = qr.modules.size;
            const layout = layoutQr(size, AVAILABLE_CSS_PX, dpr);
            expect(layout.fits).toBe(true);

            const { pixels, width } = rasterise(size, qr.modules.data, layout.modulePx);
            expect(width).toBe(layout.sizePx);
            const found = jsQR(pixels, width, width);
            expect(found?.data).toBe(res.link);
          },
        ),
        { numRuns: 40 },
      );
    },
    120_000,
  );
});
