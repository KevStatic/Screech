/**
 * Séance check-in log. Pure and immutable: every operation returns a new
 * value and never mutates its input. One entry per device; the first write wins.
 */
export interface CheckIn {
  /** Trimmed Attendee_Name, 1..32 code points. */
  readonly name: string;
  /** 32 lowercase hex chars. */
  readonly deviceId: string;
  /** UTC ISO 8601, e.g. 2026-10-31T23:04:05.123Z. */
  readonly at: string;
}

export interface CheckinLog {
  readonly byDevice: ReadonlyMap<string, CheckIn>;
  /** deviceIds in insertion order, for the stable tie-break. */
  readonly order: readonly string[];
}

export const EMPTY_CHECKIN_LOG: CheckinLog = Object.freeze({
  byDevice: new Map<string, CheckIn>(),
  order: Object.freeze([] as string[]),
});

export interface AddResult {
  readonly log: CheckinLog;
  /** The stored check-in: the new one, or the pre-existing one on a repeat. */
  readonly checkIn: CheckIn;
  readonly isNew: boolean;
}

/**
 * Records a check-in unless the device already has one. On a repeat the same
 * log object and the originally stored check-in are returned.
 */
export function addCheckIn(log: CheckinLog, checkIn: CheckIn): AddResult {
  const existing = log.byDevice.get(checkIn.deviceId);
  if (existing !== undefined) return { log, checkIn: existing, isNew: false };
  const byDevice = new Map(log.byDevice);
  byDevice.set(checkIn.deviceId, checkIn);
  return {
    log: { byDevice, order: [...log.order, checkIn.deviceId] },
    checkIn,
    isNew: true,
  };
}

function compareAt(a: string, b: string): number {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (!Number.isNaN(ta) && !Number.isNaN(tb)) return ta - tb;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Ascending by `at`; ties keep insertion order (Array.prototype.sort is stable). */
export function listCheckIns(log: CheckinLog): readonly CheckIn[] {
  const entries: CheckIn[] = [];
  for (const id of log.order) {
    const entry = log.byDevice.get(id);
    if (entry !== undefined) entries.push(entry);
  }
  return entries.sort((a, b) => compareAt(a.at, b.at));
}

export function soulCount(log: CheckinLog): number {
  return log.byDevice.size;
}
