/** Screens that vibrate on arrival. */
export type HapticScreen = 'reveal' | 'garbled' | 'sealed';

/** Vibration patterns in milliseconds: vibrate, pause, vibrate, ... */
export const HAPTIC_PATTERNS: Readonly<Record<HapticScreen, readonly number[]>> = {
  reveal: [60, 40, 120],
  garbled: [40, 30, 40],
  sealed: [200],
};

export interface HapticContext {
  /** True when `navigator.vibrate` exists (Android; iOS has none). */
  readonly supported: boolean;
  /** Exorcise toggle or system prefers-reduced-motion. */
  readonly reducedMotion: boolean;
}

/** The pattern to play on arrival, or null when haptics must stay silent. */
export function hapticPattern(
  screen: HapticScreen,
  ctx: HapticContext,
): readonly number[] | null {
  if (!ctx.supported || ctx.reducedMotion) return null;
  return HAPTIC_PATTERNS[screen];
}
