import { getStore as netlifyGetStore } from '@netlify/blobs';
import type { Store } from '@netlify/blobs';
import {
  CHECKIN_STORE_NAME,
  SEANCE_STORE_NAME,
  checkInKey,
  checkInPrefix,
  isExpired,
  seanceKey,
  sessionIdFromKey,
} from './seance.js';
import type { StoredCheckIn, StoredSeance } from './seance.js';

export type { StoredCheckIn, StoredSeance } from './seance.js';

/** Thrown when the backing store cannot be reached or answers with an error. */
export class StoreUnavailableError extends Error {
  override readonly cause: unknown;
  constructor(cause: unknown) {
    super('The séance store is unavailable.');
    this.name = 'StoreUnavailableError';
    this.cause = cause;
  }
}

export interface AddCheckInResult {
  readonly added: boolean;
  /** The record now stored: the new one, or the pre-existing one on a repeat. */
  readonly checkIn: StoredCheckIn;
}

export interface SeanceStore {
  /** Stores a new séance. Never overwrites an existing one. The caller's retry loop checks for ID clashes with `getSeance`. */
  createSeance(seance: StoredSeance): Promise<void>;
  /** null when the séance is missing or 24 hours old (expired but not yet cleaned up). */
  getSeance(sessionId: string): Promise<StoredSeance | null>;
  /** Marks the séance ended. No-op when it is missing or expired. */
  endSeance(sessionId: string): Promise<void>;
  /** Atomic: `added` is true only if this (sessionId, deviceId) key did not exist. */
  addCheckIn(sessionId: string, deviceId: string, checkIn: StoredCheckIn): Promise<AddCheckInResult>;
  listCheckIns(sessionId: string): Promise<readonly StoredCheckIn[]>;
  /** Every stored séance ID, expired ones included, so cleanup can find them. */
  listSeanceIds(): Promise<readonly string[]>;
  /** Removes the séance and all its check-ins. Missing séance is not an error. */
  deleteSeance(sessionId: string): Promise<void>;
}

export interface StoreDeps {
  /** Epoch milliseconds. Injected so tests control the clock. */
  readonly now: () => number;
}

export function createMemoryStore(deps: StoreDeps): SeanceStore {
  const seances = new Map<string, StoredSeance>();
  const checkIns = new Map<string, StoredCheckIn>();

  return {
    async createSeance(seance) {
      const key = seanceKey(seance.sessionId);
      if (!seances.has(key)) seances.set(key, seance);
    },
    async getSeance(sessionId) {
      const seance = seances.get(seanceKey(sessionId));
      if (!seance || isExpired(seance, deps.now())) return null;
      return seance;
    },
    async endSeance(sessionId) {
      const key = seanceKey(sessionId);
      const seance = seances.get(key);
      if (!seance || isExpired(seance, deps.now())) return;
      seances.set(key, { ...seance, ended: true });
    },
    async addCheckIn(sessionId, deviceId, checkIn) {
      // No await between the check and the write, so this is atomic.
      const key = checkInKey(sessionId, deviceId);
      const existing = checkIns.get(key);
      if (existing) return { added: false, checkIn: existing };
      checkIns.set(key, checkIn);
      return { added: true, checkIn };
    },
    async listCheckIns(sessionId) {
      const prefix = checkInPrefix(sessionId);
      const out: StoredCheckIn[] = [];
      for (const [key, value] of checkIns) if (key.startsWith(prefix)) out.push(value);
      return out;
    },
    async listSeanceIds() {
      const ids: string[] = [];
      for (const key of seances.keys()) {
        const id = sessionIdFromKey(key);
        if (id !== null) ids.push(id);
      }
      return ids;
    },
    async deleteSeance(sessionId) {
      seances.delete(seanceKey(sessionId));
      const prefix = checkInPrefix(sessionId);
      for (const key of [...checkIns.keys()]) if (key.startsWith(prefix)) checkIns.delete(key);
    },
  };
}

export interface BlobsStoreDeps extends StoreDeps {
  /** Replaceable for tests; defaults to Netlify's `getStore`. */
  readonly getStore?: (options: { name: string; consistency: 'strong' }) => Store;
}

async function wrap<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw new StoreUnavailableError(error);
  }
}

export function createBlobsStore(deps: BlobsStoreDeps): SeanceStore {
  const open = deps.getStore ?? ((options): Store => netlifyGetStore(options));
  const sessions = open({ name: SEANCE_STORE_NAME, consistency: 'strong' });
  const checkins = open({ name: CHECKIN_STORE_NAME, consistency: 'strong' });

  async function readSeance(sessionId: string): Promise<StoredSeance | null> {
    const value = (await sessions.get(seanceKey(sessionId), { type: 'json' })) as StoredSeance | null;
    return value ?? null;
  }

  async function listKeys(store: Store, prefix: string): Promise<string[]> {
    const keys: string[] = [];
    for await (const page of store.list({ prefix, paginate: true })) {
      for (const blob of page.blobs) keys.push(blob.key);
    }
    return keys;
  }

  return {
    createSeance: (seance) =>
      wrap(async () => {
        await sessions.setJSON(seanceKey(seance.sessionId), seance, { onlyIfNew: true });
      }),
    getSeance: (sessionId) =>
      wrap(async () => {
        const seance = await readSeance(sessionId);
        if (!seance || isExpired(seance, deps.now())) return null;
        return seance;
      }),
    endSeance: (sessionId) =>
      wrap(async () => {
        const seance = await readSeance(sessionId);
        if (!seance || isExpired(seance, deps.now())) return;
        await sessions.setJSON(seanceKey(sessionId), { ...seance, ended: true });
      }),
    addCheckIn: (sessionId, deviceId, checkIn) =>
      wrap(async () => {
        const key = checkInKey(sessionId, deviceId);
        const result = await checkins.setJSON(key, checkIn, { onlyIfNew: true });
        if (result.modified) return { added: true, checkIn };
        const existing = (await checkins.get(key, { type: 'json' })) as StoredCheckIn | null;
        if (!existing) throw new Error('Check-in vanished after a conditional write was refused.');
        return { added: false, checkIn: existing };
      }),
    listCheckIns: (sessionId) =>
      wrap(async () => {
        const keys = await listKeys(checkins, checkInPrefix(sessionId));
        const values = await Promise.all(
          keys.map((key) => checkins.get(key, { type: 'json' }) as Promise<StoredCheckIn | null>),
        );
        return values.filter((v): v is StoredCheckIn => v !== null);
      }),
    listSeanceIds: () =>
      wrap(async () => {
        const keys = await listKeys(sessions, 'session:');
        return keys.flatMap((key) => {
          const id = sessionIdFromKey(key);
          return id === null ? [] : [id];
        });
      }),
    deleteSeance: (sessionId) =>
      wrap(async () => {
        const keys = await listKeys(checkins, checkInPrefix(sessionId));
        await Promise.all(keys.map((key) => checkins.delete(key)));
        await sessions.delete(seanceKey(sessionId));
      }),
  };
}
