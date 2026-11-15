import { useEffect, useRef } from 'react';
import {
  SCREECH_BAND_HIGH_HZ,
  SCREECH_BAND_LOW_HZ,
  binFrequency,
} from '../../logic/band-energy';

export interface SpectrogramProps {
  /** Analyser connected to the microphone source. */
  readonly analyser: AnalyserNode;
  /** From the AudioContext, never a constant. */
  readonly sampleRate: number;
  readonly reducedMotion: boolean;
}

const WIDTH = 350;
const BARS_HEIGHT = 120;
const FALL_HEIGHT = 96;
const HEIGHT = BARS_HEIGHT + FALL_HEIGHT;
/** Top of the displayed frequency axis. */
export const DISPLAY_MAX_HZ = 8000;
/** About 20 frames per second while animating (requirement: at least 10). */
export const ANIMATED_INTERVAL_MS = 50;
/** Under 3 frames per second when motion is reduced (about 2.5). */
export const REDUCED_INTERVAL_MS = 400;

const BACKGROUND = '#050806';
const OUTSIDE = '#5aa86c';
const INSIDE = '#39ff7a';
const BAND_FILL = 'rgba(57, 255, 122, 0.12)';
const AXIS = '#2f5a3a';

function hzToX(hz: number): number {
  return (hz / DISPLAY_MAX_HZ) * WIDTH;
}

/** True when bin `index` lies inside the Screech band (inclusive). */
export function binInBand(index: number, sampleRate: number, fftSize: number): boolean {
  const f = binFrequency(index, sampleRate, fftSize);
  return f >= SCREECH_BAND_LOW_HZ && f <= SCREECH_BAND_HIGH_HZ;
}

/**
 * Draws one frame: the bar graph on top and a waterfall row that scrolls
 * the older rows down. Bins are placed with `binFrequency`.
 */
export function drawSpectrogramFrame(
  ctx: CanvasRenderingContext2D,
  magnitudes: ArrayLike<number>,
  sampleRate: number,
  fftSize: number,
): void {
  // Scroll the waterfall down one pixel row, then clear the bar area.
  ctx.drawImage(ctx.canvas, 0, BARS_HEIGHT, WIDTH, FALL_HEIGHT - 1, 0, BARS_HEIGHT + 1, WIDTH, FALL_HEIGHT - 1);
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, WIDTH, BARS_HEIGHT + 1);

  // Band highlight with dashed edges.
  const x0 = hzToX(SCREECH_BAND_LOW_HZ);
  const x1 = hzToX(SCREECH_BAND_HIGH_HZ);
  ctx.fillStyle = BAND_FILL;
  ctx.fillRect(x0, 0, x1 - x0, BARS_HEIGHT);
  ctx.strokeStyle = INSIDE;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(x0 + 0.5, 0);
  ctx.lineTo(x0 + 0.5, BARS_HEIGHT);
  ctx.moveTo(x1 + 0.5, 0);
  ctx.lineTo(x1 + 0.5, BARS_HEIGHT);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = AXIS;
  ctx.fillRect(0, BARS_HEIGHT, WIDTH, 1);

  for (let i = 0; i < magnitudes.length; i += 1) {
    const f = binFrequency(i, sampleRate, fftSize);
    if (f > DISPLAY_MAX_HZ) break;
    const raw = magnitudes[i];
    const m = Number.isFinite(raw) ? Math.min(255, Math.max(0, raw)) : 0;
    const x = Math.floor(hzToX(f));
    const w = Math.max(1, Math.ceil(hzToX(binFrequency(1, sampleRate, fftSize))));
    const color = binInBand(i, sampleRate, fftSize) ? INSIDE : OUTSIDE;
    const h = Math.round((m / 255) * (BARS_HEIGHT - 2));
    ctx.fillStyle = color;
    ctx.fillRect(x, BARS_HEIGHT - h, w, h);
    // Waterfall row: brightness shows magnitude.
    ctx.globalAlpha = m / 255;
    ctx.fillRect(x, BARS_HEIGHT + 1, w, 1);
    ctx.globalAlpha = 1;
  }
}

/**
 * Frequency display fed by `AnalyserNode.getByteFrequencyData`. Redraws about
 * 20 times per second, or fewer than 3 per second under reduced motion.
 */
export default function Spectrogram({ analyser, sampleRate, reducedMotion }: SpectrogramProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return undefined;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return undefined;
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const data = new Uint8Array(analyser.frequencyBinCount);
    const draw = (): void => {
      analyser.getByteFrequencyData(data);
      drawSpectrogramFrame(ctx, data, sampleRate, analyser.fftSize);
    };
    draw();
    const id = window.setInterval(draw, reducedMotion ? REDUCED_INTERVAL_MS : ANIMATED_INTERVAL_MS);
    return () => {
      window.clearInterval(id);
    };
  }, [analyser, sampleRate, reducedMotion]);

  return (
    <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        role="img"
        aria-label="Frequency display. The Screech band, 1.9 kilohertz to 6.4 kilohertz, is highlighted."
        data-testid="spectrogram"
        style={{
          width: '100%',
          maxWidth: WIDTH,
          height: 'auto',
          display: 'block',
          background: BACKGROUND,
          border: `1px solid ${AXIS}`,
          borderRadius: 8,
        }}
      />
      <figcaption
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: "'VT323', monospace",
          fontSize: 17,
          color: OUTSIDE,
        }}
      >
        <span>0 Hz</span>
        <span style={{ color: INSIDE }}>Screech band 1.9 kHz to 6.4 kHz</span>
        <span>8 kHz</span>
      </figcaption>
    </figure>
  );
}
