/** One-time iOS silent switch hint: pure decisions only, no browser globals. */

export const SOUND_HINT_KEY = 'screech.sound-hint';
export const SOUND_HINT_TEXT = 'On iPhone, the silent switch mutes these sounds.';

export function isIosDevice(userAgent: string, platform: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true;
  const touch = Number.isFinite(maxTouchPoints) ? maxTouchPoints : 0;
  return platform === 'MacIntel' && touch > 1;
}

export interface HintInputs {
  readonly soundOn: boolean;
  readonly ios: boolean;
  /** The Awaken_Tap has happened. */
  readonly awakened: boolean;
  /** Raw value under SOUND_HINT_KEY, null when missing. */
  readonly savedValue: string | null;
}

export function shouldShowSoundHint(i: HintInputs): boolean {
  return i.soundOn && i.ios && i.awakened && !parseHintSeen(i.savedValue);
}

/** Any saved value, including the empty string, counts as seen. */
export function parseHintSeen(raw: string | null | undefined): boolean {
  return typeof raw === 'string';
}

export function serializeHintSeen(): '1' {
  return '1';
}
