// Real ggwave round trip, no mocks. Requirements 9.2, 9.4, 9.6, 9.8, 16.3.
import { describe, it, expect } from 'vitest';
import { encode } from '@screech/core';
import type { Payload } from '@screech/core';

import { loadEngine } from '../../src/audio/engine';
import { CHUNK_SIZE, EMPTY_CHUNKER, pushSamples } from '../../src/logic/sample-chunker';

function coreBytes(payload: Payload): Uint8Array {
  const result = encode(payload);
  if (!result.ok) throw new Error(`core encode failed: ${result.error.message}`);
  return result.value;
}

function rawBytes(length: number, seed: number, forced: readonly number[] = []): Uint8Array {
  const out = new Uint8Array(length);
  let s = seed;
  for (let i = 0; i < length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    out[i] = (s >>> 16) & 0xff;
  }
  forced.forEach((b, i) => {
    out[i * 3 + 1] = b;
  });
  return out;
}

const packets: ReadonlyArray<{ name: string; bytes: Uint8Array }> = [
  { name: 'text packet', bytes: coreBytes({ type: 'text', text: 'Boo! The spirits say hello.' }) },
  {
    name: 'Wi-Fi packet (core encoded)',
    bytes: coreBytes({ type: 'wifi', ssid: 'Café Ghost', password: 'pässwörd-1987', security: 'wpa' }),
  },
  {
    name: 'raw packet with 0xC1 and high bytes',
    bytes: rawBytes(40, 7, [0xc1, 0x80, 0xff, 0xc1, 0x7f, 0xfe]),
  },
  { name: '140-byte packet', bytes: rawBytes(140, 42) },
];

function decodeThroughChunker(
  engine: { decode(s: Float32Array): Uint8Array | null },
  wave: Float32Array,
  sampleRate: number,
): Uint8Array[] {
  // Trailing silence so the final frame flushes.
  const padded = new Float32Array(wave.length + sampleRate + CHUNK_SIZE);
  padded.set(wave, 0);

  const found: Uint8Array[] = [];
  let state = EMPTY_CHUNKER;
  // Feed in blocks of 128 samples, like an audio callback.
  for (let i = 0; i < padded.length; i += 128) {
    const pushed = pushSamples(state, padded.subarray(i, Math.min(i + 128, padded.length)));
    state = pushed.state;
    for (const chunk of pushed.chunks) {
      const bytes = engine.decode(chunk);
      if (bytes) found.push(bytes);
    }
  }
  return found;
}

describe('real ggwave round trip', () => {
  for (const sampleRate of [44100, 48000]) {
    describe(`at ${sampleRate} Hz`, () => {
      for (const { name, bytes } of packets) {
        it(`decodes the ${name} (${bytes.length} bytes) unchanged`, async () => {
          const loaded = await loadEngine(sampleRate);
          if (!loaded.ok) throw new Error(loaded.message);
          const { engine } = loaded;

          const wave = engine.encode(bytes);
          expect(wave.length).toBeGreaterThan(0);

          const found = decodeThroughChunker(engine, wave, sampleRate);
          expect(found.length).toBeGreaterThanOrEqual(1);
          expect(Array.from(found[0]!)).toEqual(Array.from(bytes));
        }, 60_000);
      }
    });
  }
});
