import { isDeviceId, randomDeviceId } from './device-id';

/**
 * Browser storage for the séance feature. Storage is a parameter, never a
 * global, and is only touched inside try. The Host_Secret lives only in the
 * session storage passed to `createHostRecordStore`; the local-storage helpers
 * never see it. No other keys are used.
 */

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const HOST_KEY = 'seance.host';
export const DEVICE_ID_KEY = 'seance.deviceId';
export const LAST_NAME_KEY = 'seance.lastName';

export interface HostRecord {
  readonly sessionId: string;
  readonly title: string;
  readonly hostSecret: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** Returns null for anything that is not a complete host record. Never throws. */
export function parseHostRecord(text: unknown): HostRecord | null {
  try {
    if (typeof text !== 'string') return null;
    const raw: unknown = JSON.parse(text);
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
    const obj = raw as Record<string, unknown>;
    const { sessionId, title, hostSecret } = obj;
    if (!isNonEmptyString(sessionId) || typeof title !== 'string' || !isNonEmptyString(hostSecret)) return null;
    return { sessionId, title, hostSecret };
  } catch {
    return null;
  }
}

export interface HostRecordStore {
  load(): HostRecord | null;
  save(record: HostRecord): { readonly persisted: boolean };
  clear(): { readonly cleared: boolean };
}

/** `session` must be sessionStorage (or a fake of it). Pass null when unavailable. */
export function createHostRecordStore(session: StorageLike | null): HostRecordStore {
  let memory: HostRecord | null = null;
  return {
    load() {
      if (session !== null) {
        try {
          const text = session.getItem(HOST_KEY);
          if (text !== null) {
            const parsed = parseHostRecord(text);
            if (parsed !== null) return parsed;
          }
        } catch {
          // unreadable storage: fall back to memory
        }
      }
      return memory;
    },
    save(record) {
      const clean: HostRecord = {
        sessionId: record.sessionId,
        title: record.title,
        hostSecret: record.hostSecret,
      };
      memory = clean;
      if (session === null) return { persisted: false };
      try {
        session.setItem(HOST_KEY, JSON.stringify(clean));
        return { persisted: true };
      } catch {
        return { persisted: false };
      }
    },
    clear() {
      memory = null;
      if (session === null) return { cleared: true };
      try {
        session.removeItem(HOST_KEY);
        return { cleared: true };
      } catch {
        return { cleared: false };
      }
    },
  };
}

/**
 * Reads the saved Device_ID from `local`; if missing or malformed, makes one,
 * tries to save it and returns it either way. Never throws.
 */
export function getOrCreateDeviceId(
  local: StorageLike | null,
  randomBytes: (n: number) => Uint8Array,
): string {
  if (local !== null) {
    try {
      const saved = local.getItem(DEVICE_ID_KEY);
      if (isDeviceId(saved)) return saved;
    } catch {
      // unreadable storage: make a fresh one below
    }
  }
  const fresh = randomDeviceId(randomBytes);
  if (local !== null) {
    try {
      local.setItem(DEVICE_ID_KEY, fresh);
    } catch {
      // not persisted; still usable for this page
    }
  }
  return fresh;
}

/** Last successful Attendee_Name, for prefill only. Null when missing or unreadable. */
export function loadLastName(local: StorageLike | null): string | null {
  if (local === null) return null;
  try {
    const text = local.getItem(LAST_NAME_KEY);
    return typeof text === 'string' && text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

export function saveLastName(local: StorageLike | null, name: string): { readonly persisted: boolean } {
  if (local === null) return { persisted: false };
  try {
    local.setItem(LAST_NAME_KEY, name);
    return { persisted: true };
  } catch {
    return { persisted: false };
  }
}
