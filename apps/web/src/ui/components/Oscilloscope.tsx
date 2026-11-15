import { useEffect, useRef } from 'react';

export interface OscilloscopeProps {
  /** The outgoing waveform, as played. */
  readonly wave: Float32Array;
  readonly sampleRate: number;
  /** Seconds of playback so far, from the Audio_Context clock. */
  readonly elapsedSec: () => number;
  readonly reducedMotion: boolean;
}

const WIDTH = 350;
const HEIGHT = 120;
/** Samples shown at once while animating (about 43 ms at 48 kHz). */
const WINDOW_SAMPLES = 2048;
const BACKGROUND = '#050806';
const TRACE = '#39ff7a';
const GRATICULE = '#5aa86c';

/**
 * Draws a slice of `wave` as a phosphor trace. Each pixel column shows the
 * min and max of the samples it covers, so the shape is kept when zoomed out.
 */
export function drawWave(
  ctx: CanvasRenderingContext2D,
  wave: Float32Array,
  start: number,
  end: number,
): void {
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = GRATICULE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, HEIGHT / 2);
  ctx.lineTo(WIDTH, HEIGHT / 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  const from = Math.max(0, Math.min(wave.length, Math.floor(start)));
  const to = Math.max(from, Math.min(wave.length, Math.floor(end)));
  const span = to - from;
  if (span <= 0) return;

  const mid = HEIGHT / 2;
  const amp = HEIGHT / 2 - 4;
  ctx.strokeStyle = TRACE;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let x = 0; x < WIDTH; x += 1) {
    const a = from + Math.floor((x * span) / WIDTH);
    const b = Math.max(a + 1, from + Math.floor(((x + 1) * span) / WIDTH));
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = a; i < b && i < to; i += 1) {
      const v = wave[i] ?? 0;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (lo === Infinity) continue;
    ctx.moveTo(x + 0.5, mid - hi * amp);
    ctx.lineTo(x + 0.5, mid - lo * amp);
  }
  ctx.stroke();
}

/**
 * Oscilloscope canvas. Animated: redraws the window at `elapsedSec() * sampleRate`
 * on every animation frame. Reduced motion: one static drawing of the full waveform.
 */
export default function Oscilloscope({ wave, sampleRate, elapsedSec, reducedMotion }: OscilloscopeProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return undefined;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return undefined;

    if (reducedMotion) {
      drawWave(ctx, wave, 0, wave.length);
      return undefined;
    }

    let frame = 0;
    const tick = (): void => {
      const pos = Math.max(0, elapsedSec() * sampleRate);
      const half = WINDOW_SAMPLES / 2;
      drawWave(ctx, wave, pos - half, pos + half);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [wave, sampleRate, elapsedSec, reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      className="scope"
      width={WIDTH}
      height={HEIGHT}
      role="img"
      aria-label="Waveform of the outgoing sound"
      data-testid="oscilloscope"
      style={{ width: '100%', maxWidth: WIDTH, height: 'auto', display: 'block', background: BACKGROUND }}
    />
  );
}
