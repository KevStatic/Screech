import { HUNT_ALPHABET, validateAttendeeName, verifyCode } from '@screech/core';
import { error, json, methodGuard, readJsonBody, seanceNotFound, serverError } from './http.js';
import type { SeanceStore } from './seance-store.js';
import type { StoredCheckIn } from './seance.js';

/** HTTP methods this endpoint accepts. The Netlify entry's `config.method` must equal this. */
export const ALLOWED: readonly string[] = ['POST'];

export interface CheckinDeps {
  readonly store: SeanceStore;
  /** Server clock, epoch milliseconds. The only source of time here. */
  readonly now: () => number;
}

const SESSION_ID_LENGTH = 8;
const DEVICE_ID_PATTERN = /^[0-9a-f]{32}$/;

function isSessionId(id: string): boolean {
  if (id.length !== SESSION_ID_LENGTH) return false;
  for (const ch of id) if (!HUNT_ALPHABET.includes(ch)) return false;
  return true;
}

/** Decodes a base64url string to bytes, or null when it is not valid base64url. */
function base64UrlToBytes(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function recorded(checkIn: StoredCheckIn, alreadyCheckedIn: boolean): Response {
  return json(200, { name: checkIn.name, at: checkIn.at, alreadyCheckedIn });
}

/** POST /api/seance/:id/checkin */
export async function handleCheckin(req: Request, id: string, deps: CheckinDeps): Promise<Response> {
  const blocked = methodGuard(ALLOWED, req.method);
  if (blocked) return blocked;

  if (!isSessionId(id)) return seanceNotFound();

  const body = await readJsonBody(req);
  if (!body.ok) return body.response;
  const fields =
    typeof body.value === 'object' && body.value !== null && !Array.isArray(body.value)
      ? (body.value as Record<string, unknown>)
      : {};

  // Validate every field before any store access.
  const nameResult = validateAttendeeName(fields['name']);
  const rawDevice = fields['deviceId'];
  const rawCode = fields['code'];
  const deviceOk = typeof rawDevice === 'string' && DEVICE_ID_PATTERN.test(rawDevice);
  const codeOk = typeof rawCode === 'string' && rawCode.length > 0;

  if (!nameResult.ok) {
    const bad: string[] = [];
    if (!deviceOk) bad.push('deviceId');
    if (!codeOk) bad.push('code');
    const extra = bad.length > 0 ? ` Also fix: ${bad.join(', ')}.` : '';
    return error(400, `The name must be 1 to 32 characters.${extra}`);
  }
  if (!deviceOk || !codeOk) {
    const bad: string[] = [];
    if (!deviceOk) bad.push('deviceId (32 lowercase hex characters)');
    if (!codeOk) bad.push('code');
    return error(400, `Missing or malformed: ${bad.join(', ')}.`);
  }
  const name = nameResult.value;
  const deviceId = rawDevice as string;
  const code = rawCode as string;

  try {
    const seance = await deps.store.getSeance(id);
    if (!seance) return seanceNotFound();

    // A repeat Device_ID is answered with the stored record, whatever the state of the séance or code.
    const existing = (await deps.store.listCheckIns(id)).find((c) => c.deviceId === deviceId);
    if (existing) return recorded(existing, true);

    if (seance.ended) return error(410, 'The séance has ended.');

    const nowMs = deps.now();
    const secret = base64UrlToBytes(seance.hostSecret);
    const valid = secret !== null && (await verifyCode(secret, code, nowMs / 1000));
    if (!valid) return error(403, 'That code has expired. Wait for the next screech and try again.');

    const result = await deps.store.addCheckIn(id, deviceId, {
      name,
      deviceId,
      at: new Date(nowMs).toISOString(),
    });
    return recorded(result.checkIn, !result.added);
  } catch {
    return serverError();
  }
}
