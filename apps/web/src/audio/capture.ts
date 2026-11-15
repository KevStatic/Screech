import { EMPTY_CHUNKER, pushSamples, type ChunkerState } from '../logic/sample-chunker';
import { FFT_SIZE } from './constants';
import { CAPTURE_PROCESSOR_NAME, CAPTURE_WORKLET_SOURCE } from './capture-worklet-source';
import { stopStream } from './mic';

export interface CaptureHandlers {
  onPacketBytes(bytes: Uint8Array): void;
  onMicLost(): void;
}

export interface CaptureHandle {
  readonly analyser: AnalyserNode;
  /** performance.now() time of the last audio block, or 0 if none has arrived. */
  lastBlockAt(): number;
  /** Stops the mic and tears down every node. Safe to call more than once. */
  stop(): void;
}

export type CaptureResult =
  | { readonly ok: true; readonly handle: CaptureHandle }
  | { readonly ok: false; readonly message: string };

export const CAPTURE_FAILED_MESSAGE =
  'The listening circuit would not start. Reload the page and try again.';

const SCRIPT_BLOCK_SIZE = 4096;

type Decode = (samples: Float32Array) => Uint8Array | null;

function safely(action: () => void): void {
  try {
    action();
  } catch {
    // Teardown must continue even when one step fails.
  }
}

/** Wires the mic stream to an analyser and a muted capture node. Never throws. */
export async function startCapture(
  ctx: AudioContext,
  stream: MediaStream,
  decode: Decode,
  handlers: CaptureHandlers,
): Promise<CaptureResult> {
  const disposers: Array<() => void> = [];
  let stopped = false;
  let lastBlock = 0;
  let chunker: ChunkerState = EMPTY_CHUNKER;

  const onBlock = (block: Float32Array): void => {
    if (stopped) return;
    lastBlock = performance.now();
    const pushed = pushSamples(chunker, block);
    chunker = pushed.state;
    for (const chunk of pushed.chunks) {
      let bytes: Uint8Array | null = null;
      try {
        bytes = decode(chunk);
      } catch {
        bytes = null;
      }
      if (bytes !== null) handlers.onPacketBytes(bytes);
    }
  };

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    for (const dispose of disposers.reverse()) safely(dispose);
    disposers.length = 0;
    safely(() => stopStream(stream));
  };

  try {
    const source = ctx.createMediaStreamSource(stream);
    disposers.push(() => source.disconnect());

    const analyser = ctx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    disposers.push(() => analyser.disconnect());

    const mute = ctx.createGain();
    mute.gain.value = 0;
    disposers.push(() => mute.disconnect());

    source.connect(analyser);

    if (ctx.audioWorklet !== undefined) {
      const url = URL.createObjectURL(new Blob([CAPTURE_WORKLET_SOURCE], { type: 'text/javascript' }));
      disposers.push(() => URL.revokeObjectURL(url));
      await ctx.audioWorklet.addModule(url);
      const node = new AudioWorkletNode(ctx, CAPTURE_PROCESSOR_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
      });
      disposers.push(() => {
        node.port.onmessage = null;
        node.port.close();
        node.disconnect();
      });
      node.port.onmessage = (event: MessageEvent<Float32Array>): void => onBlock(event.data);
      source.connect(node);
      node.connect(mute);
    } else {
      const node = ctx.createScriptProcessor(SCRIPT_BLOCK_SIZE, 1, 1);
      disposers.push(() => {
        node.onaudioprocess = null;
        node.disconnect();
      });
      node.onaudioprocess = (event: AudioProcessingEvent): void => {
        onBlock(event.inputBuffer.getChannelData(0).slice());
      };
      source.connect(node);
      node.connect(mute);
    }
    mute.connect(ctx.destination);

    for (const track of stream.getTracks()) {
      const onEnded = (): void => {
        if (!stopped) handlers.onMicLost();
      };
      track.addEventListener('ended', onEnded);
      disposers.push(() => track.removeEventListener('ended', onEnded));
    }

    return { ok: true, handle: { analyser, lastBlockAt: () => lastBlock, stop } };
  } catch {
    stop();
    return { ok: false, message: CAPTURE_FAILED_MESSAGE };
  }
}
