import { useEffect, useRef } from 'react';
import { hapticPattern, type HapticScreen } from '../../logic/haptics';
import { useMotion } from './useMotion';

/** Vibrates once when the screen arrives. Later re-renders and motion changes do nothing. */
export function useHaptic(screen: HapticScreen): void {
  const { reduced } = useMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    const supported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
    const pattern = hapticPattern(screen, { supported, reducedMotion: reducedRef.current });
    if (pattern !== null) navigator.vibrate([...pattern]);
  }, [screen]);
}
