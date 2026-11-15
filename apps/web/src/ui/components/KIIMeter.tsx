import { useEffect, useState } from 'react';
import {
  SCREECH_BAND_HIGH_HZ,
  SCREECH_BAND_LOW_HZ,
  bandEnergy,
  meterSteps,
} from '../../logic/band-energy';

export interface KIIMeterProps {
  readonly analyser: AnalyserNode;
  /** From the AudioContext, never a constant. */
  readonly sampleRate: number;
  readonly reducedMotion: boolean;
}

export const METER_STEPS = 5;
/** About 20 updates per second while animating (requirement: at least 10). */
const ANIMATED_INTERVAL_MS = 50;
/** Under 3 updates per second when motion is reduced. */
const REDUCED_INTERVAL_MS = 400;

const LIT = '#39ff7a';
const UNLIT = '#15291a';
const LABEL = '#e9e4d4';
const MUTED = '#5aa86c';

/** Text form of the meter, e.g. "[###..] 3 of 5". */
export function meterText(steps: number, total: number = METER_STEPS): string {
  const lit = Math.max(0, Math.min(total, steps));
  return `[${'#'.repeat(lit)}${'.'.repeat(total - lit)}] ${lit} of ${total}`;
}

/**
 * K-II signal meter: LED count is meterSteps(bandEnergy(...)) of the Screech
 * band, read from the analyser. Reduced motion shows text instead of LEDs.
 */
export default function KIIMeter({ analyser, sampleRate, reducedMotion }: KIIMeterProps) {
  const [steps, setSteps] = useState(0);

  useEffect(() => {
    const data = new Uint8Array(analyser.frequencyBinCount);
    const read = (): void => {
      analyser.getByteFrequencyData(data);
      const energy = bandEnergy(data, sampleRate, analyser.fftSize, SCREECH_BAND_LOW_HZ, SCREECH_BAND_HIGH_HZ);
      setSteps(meterSteps(energy, METER_STEPS));
    };
    read();
    const id = window.setInterval(read, reducedMotion ? REDUCED_INTERVAL_MS : ANIMATED_INTERVAL_MS);
    return () => {
      window.clearInterval(id);
    };
  }, [analyser, sampleRate, reducedMotion]);

  return (
    <section
      aria-label="Signal meter"
      data-testid="kii-meter"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: 14,
        border: '1px solid #2f5a3a',
        borderRadius: 12,
        background: '#0a110c',
        fontFamily: "'VT323', monospace",
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 20, letterSpacing: 2, color: LABEL }}>K-II SIGNAL</span>
        {reducedMotion ? null : (
          <span data-testid="kii-count" style={{ fontSize: 18, color: MUTED }}>
            {steps} of {METER_STEPS}
          </span>
        )}
      </div>
      {reducedMotion ? (
        <p data-testid="kii-text" style={{ margin: 0, fontSize: 28, letterSpacing: 2, color: LIT }}>
          {meterText(steps)}
        </p>
      ) : (
        <div
          aria-hidden="true"
          data-testid="kii-leds"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${METER_STEPS}, minmax(0, 1fr))`,
            gap: 10,
            justifyItems: 'center',
          }}
        >
          {Array.from({ length: METER_STEPS }, (_, i) => {
            const on = i < steps;
            return (
              <span
                key={i}
                data-lit={on ? 'true' : 'false'}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  background: on ? LIT : UNLIT,
                  boxShadow: on ? `0 0 14px ${LIT}` : 'none',
                }}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
