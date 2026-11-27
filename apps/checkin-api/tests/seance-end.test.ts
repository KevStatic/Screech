import { rollingCode, windowNumber } from '@screech/core';
import { describe, expect, it } from 'vitest';
import { handleCheckin } from '../src/seance-checkin.js';
import { ALLOWED, handleEnd } from '../src/seance-end.js';
import { createMemoryStore } from '../src/seance-store.js';
import type { SeanceStore, StoredSeance } from '../src/seance-store.js';

const T0 = Date.parse('2026-10-31T20:00:00.000Z');
const ID = 'ABCDEFGH';
const SECRET_BYTES = Uint8Array.from({ length: 32 }, (_, i) => i * 7 + 3);
const HOST_SECRET = Buffer.from(SECRET_BYTES).toString('base64url');

function setup() {
  const clock = { now: T0 };
  const now = () => clock.now;
  const store = createMemoryStore({ now });
  return { store, clock, deps: { store, now } };
}

function seance(overrides: Partial<StoredSeance> = {}): StoredSeance {
  return {
    sessionId: ID,
    title: 'Midnight circle',
    hostSecret: HOST_SECRET,
    createdAt: new Date(T0).toISOString(),
    ended: false,
    ...overrides,
  };
}

const dev = (n: number): string => n.toString(16).padStart(32, '0');

function end(secret?: string, method = 'POST'): Request {
  const headers = new Headers();
  if (secret !== undefined) headers.set('Authorization', `Bearer ${secret}`);
  return new Request(`https://example.test/api/seance/${ID}/end`, { method, headers });
}

async function checkin(
  deps: { store: SeanceStore; now: () => number },
  n: number,
  at: number,
): Promise<Response> {
  const code = await rollingCode(SECRET_BYTES, windowNumber(at / 1000));
  const req = new Request(`https://example.test/api/seance/${ID}/checkin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `Guest ${n}`, deviceId: dev(n), code }),
  });
  return handleCheckin(req, ID, deps);
}

describe('handleEnd', () => {
  it('ends the séance and returns the check-in count', async () => {
    const { store, deps } = setup();
    await store.createSeance(seance());
    for (const n of [1, 2, 3]) expect((await checkin(deps, n, T0)).status).toBe(200);

    const res = await handleEnd(end(HOST_SECRET), ID, deps);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ ended: true, count: 3 });
    expect((await store.getSeance(ID))?.ended).toBe(true);
  });

  it('returns a count of 0 when nobody checked in', async () => {
    const { store, deps } = setup();
    await store.createSeance(seance());
    const res = await handleEnd(end(HOST_SECRET), ID, deps);
    expect(await res.json()).toEqual({ ended: true, count: 0 });
  });

  it('is idempotent: a second end returns the same count', async () => {
    const { store, deps } = setup();
    await store.createSeance(seance());
    await checkin(deps, 1, T0);
    const first = await handleEnd(end(HOST_SECRET), ID, deps);
    const second = await handleEnd(end(HOST_SECRET), ID, deps);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(await first.json());
  });

  it('answers a missing or wrong secret with a body identical to a missing séance', async () => {
    const { store, deps } = setup();
    await store.createSeance(seance());
    const missing = await handleEnd(end(HOST_SECRET), 'ZZZZZZZZ', deps);
    const missingBody = await missing.text();
    expect(missing.status).toBe(404);

    for (const req of [end(), end('wrong'), end(HOST_SECRET.slice(0, -1) + 'x'), end('')]) {
      const res = await handleEnd(req, ID, deps);
      expect(res.status).toBe(404);
      expect(await res.text()).toBe(missingBody);
    }
    // A failed attempt must not end the séance.
    expect((await store.getSeance(ID))?.ended).toBe(false);
  });

  it('answers 404 for an unknown, malformed or expired séance', async () => {
    const { store, deps } = setup();
    await store.createSeance(seance({ createdAt: new Date(T0 - 24 * 3600 * 1000).toISOString() }));
    const unknownBody = await (await handleEnd(end(HOST_SECRET), 'ZZZZZZZZ', deps)).text();

    for (const id of [ID, 'ZZZZZZZZ', 'bad', undefined]) {
      const res = await handleEnd(end(HOST_SECRET), id, deps);
      expect(res.status).toBe(404);
      expect(await res.text()).toBe(unknownBody);
    }
  });

  it('rejects a check-in after the end with 410', async () => {
    const { store, deps } = setup();
    await store.createSeance(seance());
    await checkin(deps, 1, T0);
    await handleEnd(end(HOST_SECRET), ID, deps);

    const res = await checkin(deps, 2, T0);
    expect(res.status).toBe(410);
    expect(await store.listCheckIns(ID)).toHaveLength(1);

    const count = (await (await handleEnd(end(HOST_SECRET), ID, deps)).json()) as { count: number };
    expect(count.count).toBe(1);
  });

  it('answers 405 with Allow for an unsupported method, without touching the store', async () => {
    const touched: string[] = [];
    const guarded = new Proxy({} as SeanceStore, {
      get: (_t, prop) => {
        touched.push(String(prop));
        throw new Error('store must not be used');
      },
    });
    const deps = { store: guarded, now: () => T0 };
    for (const method of ['GET', 'PUT', 'DELETE', 'PATCH']) {
      const res = await handleEnd(end(HOST_SECRET, method), ID, deps);
      expect(res.status).toBe(405);
      expect(res.headers.get('Allow')).toBe(ALLOWED.join(', '));
      expect(res.headers.get('Cache-Control')).toBe('no-store');
    }
    expect(touched).toEqual([]);
  });
});
