import { ggwaveViewToBytes, waveformFromBytes } from '../logic/bytes';
import { TRANSMIT_VOLUME } from './constants';

/** The sound engine as the rest of the app sees it. Easy to fake in tests. */
export interface GgwaveEngine {
  /** Turns packet bytes into audio samples (a fresh, owned Float32Array). */
  encode(packet: Uint8Array): Float32Array;
  /** Decodes one chunk of samples. Returns a copy of the packet bytes, or null if none. */
  decode(samples: Float32Array): Uint8Array | null;
}

export type EngineResult =
  | { readonly ok: true; readonly engine: GgwaveEngine }
  | { readonly ok: false; readonly message: string };

export const ENGINE_FAILURE_MESSAGE = 'The sound engine could not start.';

const cache = new Map<number, Promise<EngineResult>>();

async function createEngine(sampleRate: number): Promise<EngineResult> {
  try {
    const { default: factory } = await import('ggwave');
    const gg = await factory();
    const params = gg.getDefaultParameters();
    params.sampleRateInp = sampleRate;
    params.sampleRateOut = sampleRate;
    params.sampleFormatInp = gg.SampleFormat.GGWAVE_SAMPLE_FORMAT_F32;
    params.sampleFormatOut = gg.SampleFormat.GGWAVE_SAMPLE_FORMAT_F32;
    const instance = gg.init(params);

    const engine: GgwaveEngine = {
      encode(packet) {
        const wave = gg.encode(
          instance,
          packet,
          gg.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_FAST,
          TRANSMIT_VOLUME,
        );
        return waveformFromBytes(wave);
      },
      decode(samples) {
        const view = gg.decode(
          instance,
          new Int8Array(samples.buffer, samples.byteOffset, samples.byteLength),
        );
        return view && view.length > 0 ? ggwaveViewToBytes(view) : null;
      },
    };
    return { ok: true, engine };
  } catch {
    return { ok: false, message: ENGINE_FAILURE_MESSAGE };
  }
}

/**
 * Loads ggwave and initialises it for the given sample rate.
 * Never throws. Successful results are cached per rate; failures are not, so a retry can work.
 */
export function loadEngine(sampleRate: number): Promise<EngineResult> {
  const cached = cache.get(sampleRate);
  if (cached) return cached;
  const pending = createEngine(sampleRate).then((result) => {
    if (!result.ok) cache.delete(sampleRate);
    return result;
  });
  cache.set(sampleRate, pending);
  return pending;
}
