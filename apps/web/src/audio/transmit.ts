export type PlaybackResult = 'ended' | 'stopped' | 'failed';

export interface PlaybackHandle {
  durationSec: number;
  elapsedSec(): number;
  stop(): void;
  finished: Promise<PlaybackResult>;
}

/** Plays a mono waveform through the context destination at the context's own sample rate. */
export function playWaveform(ctx: AudioContext, waveform: Float32Array): PlaybackHandle {
  const durationSec = waveform.length / ctx.sampleRate;
  let startTime = ctx.currentTime;
  let source: AudioBufferSourceNode | null = null;
  let settled = false;
  let resolveFinished: (r: PlaybackResult) => void = () => undefined;
  const finished = new Promise<PlaybackResult>((resolve) => {
    resolveFinished = resolve;
  });

  const onEnded = (): void => settle('ended');
  const onStateChange = (): void => {
    if (ctx.state !== 'running') settle('failed');
  };

  function settle(result: PlaybackResult): void {
    if (settled) return;
    settled = true;
    ctx.removeEventListener('statechange', onStateChange);
    if (source) {
      source.removeEventListener('ended', onEnded);
      if (result !== 'ended') {
        try {
          source.stop();
        } catch {
          /* already stopped */
        }
      }
      try {
        source.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    resolveFinished(result);
  }

  try {
    const buffer = ctx.createBuffer(1, waveform.length, ctx.sampleRate);
    buffer.copyToChannel(waveform, 0);
    source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.addEventListener('ended', onEnded);
    ctx.addEventListener('statechange', onStateChange);
    startTime = ctx.currentTime;
    source.start();
    if (ctx.state !== 'running') settle('failed');
  } catch {
    settle('failed');
  }

  return {
    durationSec,
    elapsedSec(): number {
      return Math.min(Math.max(ctx.currentTime - startTime, 0), durationSec);
    },
    stop(): void {
      settle('stopped');
    },
    finished,
  };
}
