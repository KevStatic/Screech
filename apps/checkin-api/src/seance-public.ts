import { HUNT_ALPHABET } from '@screech/core';
import { json, methodGuard, seanceNotFound, serverError } from './http.js';
import type { SeanceStore } from './seance-store.js';

export const ALLOWED: readonly string[] = ['GET'];

const SESSION_ID_LENGTH = 8;

export interface PublicDeps {
  readonly store: SeanceStore;
  /** Epoch milliseconds. */
  readonly now: () => number;
}

function isValidSessionId(id: string): boolean {
  if (id.length !== SESSION_ID_LENGTH) return false;
  for (const ch of id) if (!HUNT_ALPHABET.includes(ch)) return false;
  return true;
}

/**
 * GET /api/seance/:id/public. Returns the Title and whether the séance is open.
 * Malformed, missing and expired IDs all get the same 404. Read-only.
 */
export async function handlePublic(req: Request, id: string, deps: PublicDeps): Promise<Response> {
  const blocked = methodGuard(ALLOWED, req.method);
  if (blocked) return blocked;

  try {
    if (!isValidSessionId(id)) return seanceNotFound();
    // The store treats an expired séance as missing, so expiry gives the same 404.
    const seance = await deps.store.getSeance(id);
    if (!seance) return seanceNotFound();
    return json(200, { title: seance.title, open: !seance.ended });
  } catch {
    return serverError();
  }
}
