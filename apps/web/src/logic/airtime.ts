/**
 * Airtime of a screech and the long-clue note.
 * Pure functions, no React and no audio API.
 */

/** Clue packets above this many bytes get the Long_Clue_Note. */
export const LONG_CLUE_THRESHOLD_BYTES = 100;

/**
 * Whole seconds a screech of `packetBytes` bytes takes:
 * ceil(0.7 + 0.0614 * bytes). Returns 0 for non-finite or negative input.
 */
export function airtimeSeconds(packetBytes: number): number {
  if (typeof packetBytes !== 'number' || !Number.isFinite(packetBytes) || packetBytes < 0) {
    return 0;
  }
  return Math.ceil(0.7 + 0.0614 * packetBytes);
}

/**
 * Non-blocking note for clues above the threshold, otherwise null.
 */
export function longClueNote(packetBytes: number): string | null {
  if (
    typeof packetBytes !== 'number' ||
    !Number.isFinite(packetBytes) ||
    packetBytes <= LONG_CLUE_THRESHOLD_BYTES
  ) {
    return null;
  }
  return `Long clue: players must stay close for about ${airtimeSeconds(packetBytes)} s.`;
}
