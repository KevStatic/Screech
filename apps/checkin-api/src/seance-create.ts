import { HUNT_ALPHABET, validateTitle } from '@screech/core';
import { error, json, methodGuard, readJsonBody, serverError } from './http.js';
import type { SeanceStore, StoredSeance } from './seance-store.js';

/** Same value as the entry's `config.method`. */
export const ALLOWED: readonly string[] = ['POST'];

export const SESSION_ID_LENGTH = 8;
export const HOST_SECRET_BYTES = 32;
export const MAX_ID_ATTEMPTS = 10;

export const TITLE_ERROR_MESSAGE = 'The title must be 1 to 60 characters.';
export const CREATE_UNAVAILABLE_MESSAGE = 'A séance could not be created. Try again in a moment.';

export interface CreateDeps {
  readonly store: SeanceStore;
  /** Epoch milliseconds. */
  readonly now: () => number;
  /** Secure random bytes. Defaults to `crypto.getRandomValues`. */
  readonly randomBytes?: (n: number) => Uint8Array;
}

function defaultRandomBytes(n: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Unpadded base64url. 32 bytes give 43 characters. */
function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 1] ?? 0;
    const b2 = bytes[i + 2] ?? 0;
    const n = (b0 << 16) | (b1 << 8) | b2;
    out += B64URL.charAt((n >> 18) & 63) + B64URL.charAt((n >> 12) & 63);
    if (i + 1 < bytes.length) out += B64URL.charAt((n >> 6) & 63);
    if (i + 2 < bytes.length) out += B64URL.charAt(n & 63);
  }
  return out;
}

/** 8 Hunt_Alphabet characters, drawn by rejection sampling so every character is equally likely. */
function generateSessionId(randomBytes: (n: number) => Uint8Array): string {
  const size = HUNT_ALPHABET.length;
  const limit = 256 - (256 % size);
  let id = '';
  for (let round = 0; id.length < SESSION_ID_LENGTH && round < 64; round++) {
    for (const byte of randomBytes(SESSION_ID_LENGTH * 2)) {
      if (byte >= limit) continue;
      id += HUNT_ALPHABET.charAt(byte % size);
      if (id.length === SESSION_ID_LENGTH) break;
    }
  }
  if (id.length !== SESSION_ID_LENGTH) throw new Error('The random source did not yield enough usable bytes.');
  return id;
}

function generateHostSecret(randomBytes: (n: number) => Uint8Array): string {
  const bytes = randomBytes(HOST_SECRET_BYTES);
  if (bytes.length !== HOST_SECRET_BYTES) throw new Error('The random source returned the wrong number of bytes.');
  return toBase64Url(bytes);
}

/** `POST /api/seance` */
export async function handleCreate(req: Request, deps: CreateDeps): Promise<Response> {
  const blocked = methodGuard(ALLOWED, req.method);
  if (blocked) return blocked;

  try {
    const body = await readJsonBody(req);
    if (!body.ok) return body.response;

    const raw = body.value;
    const rawTitle: unknown =
      typeof raw === 'object' && raw !== null && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)['title']
        : undefined;
    const title = validateTitle(rawTitle);
    if (!title.ok) return error(400, TITLE_ERROR_MESSAGE);

    const randomBytes = deps.randomBytes ?? defaultRandomBytes;

    let sessionId: string | null = null;
    for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++) {
      const candidate = generateSessionId(randomBytes);
      if ((await deps.store.getSeance(candidate)) === null) {
        sessionId = candidate;
        break;
      }
    }
    if (sessionId === null) return error(503, CREATE_UNAVAILABLE_MESSAGE);

    const seance: StoredSeance = {
      sessionId,
      title: title.value,
      hostSecret: generateHostSecret(randomBytes),
      createdAt: new Date(deps.now()).toISOString(),
      ended: false,
    };
    await deps.store.createSeance(seance);

    return json(201, { sessionId: seance.sessionId, title: seance.title, hostSecret: seance.hostSecret });
  } catch {
    return serverError();
  }
}
