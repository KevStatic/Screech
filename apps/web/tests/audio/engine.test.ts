import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRANSMIT_VOLUME } from '../../src/audio/constants';

interface Fake {
  params: Record<string, number>;
  initCalls: Array<Record<string, number>>;
  encodeCalls: Array<{ payload: unknown; protocol: number; volume: number }>;
  waveBytes: Int8Array;
  decodeResult: Int8Array;
  factoryCalls: number;
  initThrows: boolean;
}

function installFake(): Fake {
  const fake: Fake = {
    params: {},
    initCalls: [],
    encodeCalls: [],
    waveBytes: new Int8Array(new Float32Array([0.25, -0.5]).buffer),
    decodeResult: new Int8Array([1, 2, 3]),
    factoryCalls: 0,
    initThrows: false,
  };
  vi.doMock('ggwave', () => ({
    default: async () => {
      fake.factoryCalls++;
      return {
        getDefaultParameters: () => ({ sampleRateInp: 1, sampleRateOut: 1, sampleFormatInp: 0, sampleFormatOut: 0 }),
        init: (p: Record<string, number>) => {
          if (fake.initThrows) throw new Error('boom');
          fake.initCalls.push({ ...p });
          return 7;
        },
        encode: (_i: number, payload: unknown, protocol: number, volume: number) => {
          fake.encodeCalls.push({ payload, protocol, volume });
          return fake.waveBytes;
        },
        decode: () => fake.decodeResult,
        ProtocolId: { GGWAVE_PROTOCOL_AUDIBLE_FAST: 42 },
        SampleFormat: { GGWAVE_SAMPLE_FORMAT_F32: 5 },
      };
    },
  }));
  return fake;
}

describe('engine', () => {
  let fake: Fake;
  beforeEach(() => {
    vi.resetModules();
    fake = installFake();
  });
  afterEach(() => {
    vi.doUnmock('ggwave');
  });

  it('inits with the given rate and F32 formats', async () => {
    const { loadEngine } = await import('../../src/audio/engine');
    const r = await loadEngine(44100);
    expect(r.ok).toBe(true);
    expect(fake.initCalls[0]).toMatchObject({
      sampleRateInp: 44100,
      sampleRateOut: 44100,
      sampleFormatInp: 5,
      sampleFormatOut: 5,
    });
  });

  it('encodes a Uint8Array with audible-fast protocol and TRANSMIT_VOLUME', async () => {
    const { loadEngine } = await import('../../src/audio/engine');
    const r = await loadEngine(48000);
    if (!r.ok) throw new Error('engine failed');
    const packet = new Uint8Array([0xc1, 0x80, 1]);
    const wave = r.engine.encode(packet);
    const call = fake.encodeCalls[0];
    expect(call.payload).toBeInstanceOf(Uint8Array);
    expect(typeof call.payload).not.toBe('string');
    expect(call.protocol).toBe(42);
    expect(call.volume).toBe(TRANSMIT_VOLUME);
    expect(Array.from(wave)).toEqual([0.25, -0.5]);
  });

  it('returns an encode result that does not share the fake buffer', async () => {
    const { loadEngine } = await import('../../src/audio/engine');
    const r = await loadEngine(48000);
    if (!r.ok) throw new Error('engine failed');
    const wave = r.engine.encode(new Uint8Array([1]));
    fake.waveBytes.fill(0);
    expect(Array.from(wave)).toEqual([0.25, -0.5]);
  });

  it('returns a decode result that does not share the fake buffer', async () => {
    const { loadEngine } = await import('../../src/audio/engine');
    const r = await loadEngine(48000);
    if (!r.ok) throw new Error('engine failed');
    const out = r.engine.decode(new Float32Array(4096));
    fake.decodeResult.fill(9);
    expect(Array.from(out ?? [])).toEqual([1, 2, 3]);
  });

  it('decode returns null for an empty result', async () => {
    const { loadEngine } = await import('../../src/audio/engine');
    const r = await loadEngine(48000);
    if (!r.ok) throw new Error('engine failed');
    fake.decodeResult = new Int8Array(0);
    expect(r.engine.decode(new Float32Array(4096))).toBeNull();
  });

  it('reports the plain message when init throws, and does not cache failure', async () => {
    const { loadEngine, ENGINE_FAILURE_MESSAGE } = await import('../../src/audio/engine');
    fake.initThrows = true;
    const bad = await loadEngine(48000);
    expect(bad).toEqual({ ok: false, message: 'The sound engine could not start.' });
    expect(ENGINE_FAILURE_MESSAGE).toBe('The sound engine could not start.');
    fake.initThrows = false;
    expect((await loadEngine(48000)).ok).toBe(true);
  });

  it('caches per rate', async () => {
    const { loadEngine } = await import('../../src/audio/engine');
    const a = await loadEngine(44100);
    const b = await loadEngine(44100);
    expect(b).toBe(a);
    expect(fake.initCalls).toHaveLength(1);
    await loadEngine(48000);
    expect(fake.initCalls).toHaveLength(2);
    expect(fake.initCalls[1].sampleRateInp).toBe(48000);
  });
});
