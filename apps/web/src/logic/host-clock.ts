/** Pure helpers for correcting the host's clock against a server `Date` header. */

/** Parse an HTTP `Date` header into epoch ms, or null if missing or unparseable. */
export function parseDateHeader(value: string | null): number | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? ms : null;
}

/** Offset to add to the local clock to get server time: server - local. */
export function clockOffsetMs(serverDateMs: number, localNowMs: number): number {
  return serverDateMs - localNowMs;
}

/** Server-corrected time in whole epoch seconds. */
export function correctedNowSeconds(offsetMs: number, localNowMs: number): number {
  return Math.floor((localNowMs + offsetMs) / 1000);
}
