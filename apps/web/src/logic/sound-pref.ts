/** Saved Sound_Preference. Pure: no browser globals, no link to the motion code. */
export const SOUND_KEY = 'screech.sound';

/** Sound is off only when the saved value is exactly '0'. Anything else is on. */
export function parseSound(raw: string | null | undefined): boolean {
  return raw !== '0';
}

export function serializeSound(on: boolean): '1' | '0' {
  return on ? '1' : '0';
}
