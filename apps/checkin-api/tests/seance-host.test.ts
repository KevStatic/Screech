import { describe, expect, it } from 'vitest';
import { ALLOWED, handleHost } from '../src/seance-host.js';
import { createMemoryStore } from '../src/seance-store.js';
import type { SeanceStore, StoredCheckIn, StoredSeance } from '../src/seance-store.js';

const T0 = Date.parse('2026-10-31T20:00:00.000Z');
const ID = 'ABCDEFGH';
const SECRET = 'S'.repeat(43);

function setup() {
  const clock = { now: T0 };
  const now = () => clock.now;
  const store = createMemoryStore({ now });
  return { store, deps: { store, now } };
}

function seance(overrides: Partial<StoredSeance> = {}): StoredSeance {
  return {
    sessionId: ID,
    title: 'Midnight circle',
    hostSecret: SECRET,
    createdAt: new Date(T0).toISOString(),
    ended: false,
    ...overrides,
  };
}

const dev = (n: number): string => n.toString(16).padStart(32, '0');
const ci = (n: number, name: string, at: string): StoredCheckIn => ({ name, deviceId: dev(n), at });

function get(secret?: string, method = 'GET'): Request {
  const headers = new Headers();
  if (secret !== undefined) headers.set('Authorization', `Bearer ${secret}`);
  return new Request(`https://example.test/api/seance/${ID}`, { method, headers });
}

describe('handleHost', () => {
  it('returns title, open state and an empty list for a séance with no check-ins', async () => {
    const { store, deps } = setup();
    await store.createSeance(seance());
    const res = await handleHost(get(SECRET), ID, deps);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ title: 'Midnight circle', open: true, checkIns: [] });
  });

  it('reports open: false for an ended séance', async () => {
    const { store, deps } = setup();
    await store.createSeance(seance());
    await store.endSeance(ID);
    const body = (await (await handleHost(get(SECRET), ID, deps)).json()) as { open: boolean };
    expect(body.open).toBe(false);
  });

  it('sorts by time ascending and keeps insertion order for equal times', async () => {
    const { store, deps } = setup();
    await store.createSeance(seance());
    const same = '2026-10-31T20:05:00.000Z';
    await store.addCheckIn(ID, dev(1), ci(1, 'Late', '2026-10-31T20:09:00.000Z'));
    await store.addCheckIn(ID, dev(2), ci(2, 'First tie', same));
    await store.addCheckIn(ID, dev(3), ci(3, 'Early', '2026-10-31T20:01:00.000Z'));
    await store.addCheckIn(ID, dev(4), ci(4, 'Second tie', same));
    await store.addCheckIn(ID, dev(5), ci(5, 'Third tie', same));
    const body = (await (await handleHost(get(SECRET), ID, deps)).json()) as {
      checkIns: { name: string; at: string }[];
    };
    expect(body.checkIns.map((c) => c.name)).toEqual(['Early', 'First tie', 'Second tie', 'Third tie', 'Late']);
  });

  it('exposes only name and time, never a Device_ID or the secret', async () => {
    const { store, deps } = setup();
    await store.createSeance(seance());
    await store.addCheckIn(ID, dev(1), ci(1, 'Ada', '2026-10-31T20:01:00.000Z'));
    const res = await handleHost(get(SECRET), ID, deps);
    const text = await res.text();
    expect(text).not.toContain(dev(1));
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain('deviceId');
    expect(text).not.toContain('hostSecret');
    expect(JSON.parse(text).checkIns).toEqual([{ name: 'Ada', at: '2026-10-31T20:01:00.000Z' }]);
  });

  it('answers a missing or wrong secret with a body identical to a missing séance', async () => {
    const { store, deps } = setup();
    await store.createSeance(seance());
    const missing = await handleHost(get(SECRET), 'ZZZZZZZZ', deps);
    const missingBody = await missing.text();
    expect(missing.status).toBe(404);

    for (const req of [get(), get('wrong'), get(SECRET.slice(0, -1) + 'T'), get('')]) {
      const res = await handleHost(req, ID, deps);
      expect(res.status).toBe(404);
      expect(await res.text()).toBe(missingBody);
    }
  });

  it('does not leak check-ins on a wrong secret', async () => {
    const { store, deps } = setup();
    await store.createSeance(seance());
    await store.addCheckIn(ID, dev(1), ci(1, 'Ada', '2026-10-31T20:01:00.000Z'));
    const text = await (await handleHost(get('wrong'), ID, deps)).text();
    expect(text).not.toContain('Ada');
    expect(text).not.toContain('Midnight');
  });

  it('answers 404 for an expired séance', async () => {
    const { store, deps } = setup();
    await store.createSeance(seance({ createdAt: new Date(T0 - 24 * 3600 * 1000).toISOString() }));
    expect((await handleHost(get(SECRET), ID, deps)).status).toBe(404);
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
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const res = await handleHost(get(SECRET, method), ID, deps);
      expect(res.status).toBe(405);
      expect(res.headers.get('Allow')).toBe(ALLOWED.join(', '));
      expect(res.headers.get('Cache-Control')).toBe('no-store');
    }
    expect(touched).toEqual([]);
  });
});
