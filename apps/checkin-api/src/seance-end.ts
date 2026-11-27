import { HUNT_ALPHABET, SESSION_ID_LENGTH } from '@screech/core';
import { json, methodGuard, seanceNotFound, serverError, timingSafeEqual } from './http.js';
import type { SeanceStore } from './seance-store.js';

/** Same value as the entry's `config.method`. */
export const ALLOWED: readonly string[] = ['POST'];

export interface EndDeps {
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

/**
 * POST /api/seance/:id/end. Host-only. Marks the séance ended and returns the
 * check-in count. Calling it again returns the same count and changes nothing.
 */
export async function handleEnd(req: Request, id: string | undefined, deps: EndDeps): Promise<Response> {
  const blocked = methodGuard(ALLOWED, req.method);
  if (blocked !== null) return blocked;

  if (!isSessionId(id)) return seanceNotFound();

  try {
    const seance = await deps.store.getSeance(id);
    // Always run the comparison so a missing token costs the same as a wrong one.
    const token = bearerToken(req);
    const secretOk = timingSafeEqual(token ?? '', seance?.hostSecret ?? '');
    if (seance === null || token === null || !secretOk) return seanceNotFound();

    if (!seance.ended) await deps.store.endSeance(id);

    // One record per device, so the stored list length is the check-in count.
    const stored = await deps.store.listCheckIns(id);
    return json(200, { ended: true, count: stored.length });
  } catch {
    return serverError();
  }
}
