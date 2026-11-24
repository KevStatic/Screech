import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { spellShown } from '../../logic/ouija';
import { useMotion } from './useMotion';

/** Spelling display refresh. 12 characters per second needs a step at least every 83 ms. */
export const SPELL_TICK_MS = 40;

export interface Spelling {
  /** The value split into code points. */
  readonly chars: readonly string[];
  /** Code points to show now. Equals `chars.length` once finished. */
  readonly shown: number;
  /** True when spelling is done, skipped, or Reduced_Motion is on. */
  readonly finished: boolean;
  /** Elapsed time to give to `OuijaBoard`; `Infinity` once finished. */
  readonly elapsedMs: number;
  /** Show the whole value at once. */
  readonly skip: () => void;
}

/**
 * Spelling timer for Reveal-style screens: `performance.now` origin, a 40 ms
 * tick and `spellShown`. Plays no Haunting Sound. Under Reduced_Motion the
 * whole value is shown from the first render and no timer runs.
 */
export function useSpelling(value: string): Spelling {
  const { reduced } = useMotion();
  const chars = useMemo(() => Array.from(value), [value]);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [skippedValue, setSkippedValue] = useState<string | null>(null);
  const startedAt = useRef<number | null>(null);
  const lastValue = useRef(value);

  // A new value restarts the spelling.
  if (lastValue.current !== value) {
    lastValue.current = value;
    startedAt.current = null;
    if (elapsedMs !== 0) setElapsedMs(0);
  }

  const skipped = skippedValue === value;
  const spelled = spellShown(elapsedMs, chars);
  const finished = reduced || skipped || spelled.done;
  const shown = finished ? chars.length : spelled.shown;

  useEffect(() => {
    if (finished) return undefined;
    if (startedAt.current === null) startedAt.current = performance.now();
    const origin = startedAt.current;
    const id = window.setInterval(() => {
      setElapsedMs(performance.now() - origin);
    }, SPELL_TICK_MS);
    return () => {
      window.clearInterval(id);
    };
  }, [finished, value]);

  const skip = useCallback((): void => {
    setSkippedValue(value);
  }, [value]);

  return {
    chars,
    shown,
    finished,
    elapsedMs: finished ? Number.POSITIVE_INFINITY : elapsedMs,
    skip,
  };
}
