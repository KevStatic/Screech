import { EMPTY_CHECKIN_LOG, HUNT_ALPHABET, SESSION_ID_LENGTH, addCheckIn, listCheckIns } from '@screech/core';
import type { CheckinLog } from '@screech/core';
import { json, methodGuard, seanceNotFound, serverError, timingSafeEqual } from './http.js';
import type { SeanceStore } from './seance-store.js';

/** Same value as the entry's `config.method`. */
export const ALLOWED: readonly string[] = ['GET'];

export interface HostDeps {
  readonly store: SeanceStore;
  /** Epoch milliseconds. */
  readonly now: () => number;
}

function isSessionId(id: unknown): id is string {
  if (typeof id !== 'string' || id.length !== SESSION_ID_LENGTH) return false;
  for (const ch of id) if (!HUNT_ALPHABET.includes(ch)) return false;
  return true;
}

/** Extracts the token of `Authorization: Bearer <token>`, or null. */
function bearerToken(req: Request): string | null {
  const header = req.headers.get('authorization');
  if (header === null) return null;
  const match = /^Bearer (\S+)$/i.exec(header.trim());
  return match === null || match[1] === undefined ? null : match[1];
}

/** GET /api/seance/:id. Host-only: title, open state and check-ins (name and time, no device ID). */
export async function handleHost(req: Request, id: string | undefined, deps: HostDeps): Promise<Response> {
  const blocked = methodGuard(ALLOWED, req.method);
  if (blocked !== null) return blocked;

  if (!isSessionId(id)) return seanceNotFound();

  try {
    const seance = await deps.store.getSeance(id);
    // Always run the comparison so a missing token costs the same as a wrong one.
    const token = bearerToken(req);
    const secretOk = timingSafeEqual(token ?? '', seance?.hostSecret ?? '');
    if (seance === null || token === null || !secretOk) return seanceNotFound();

    const stored = await deps.store.listCheckIns(id);
    let log: CheckinLog = EMPTY_CHECKIN_LOG;
    for (const c of stored) log = addCheckIn(log, c).log;
    const checkIns = listCheckIns(log).map((c) => ({ name: c.name, at: c.at }));

    return json(200, { title: seance.title, open: !seance.ended, checkIns });
  } catch {
    return serverError();
  }
}
