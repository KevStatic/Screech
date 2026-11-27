import { describe, expect, it } from 'vitest';
import { ALLOWED, handlePublic } from '../src/seance-public.js';
import { createMemoryStore } from '../src/seance-store.js';
import type { SeanceStore, StoredCheckIn, StoredSeance } from '../src/seance-store.js';
import { SEANCE_TTL_MS } from '../src/seance.js';

const T0 = Date.parse('2026-10-31T20:00:00.000Z');
const ID = 'ABCDEFGH';
const SECRET = 'S3CRET-host-secret-value-0123456789abcdefghij';
const DEVICE = 'deadbeefdeadbeefdeadbeefdeadbeef';

function setup() {
  const clock = { now: T0 };
  const store = createMemoryStore({ now: () => clock.now });
  const deps = { store, now: () => clock.now };
  return { clock, store, deps };
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

const get = (id = ID): Request => new Request(`https://example.test/api/seance/${id}/public`);

/** Wraps a store so any method call is recorded. */
function spyStore(inner: SeanceStore): { store: SeanceStore; calls: string[] } {
  const calls: string[] = [];
  const store = new Proxy(inner, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        calls.push(String(prop));
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
  return { store, calls };
}

describe('handlePublic: found', () => {
  it('returns the title and open: true for an open séance', async () => {
    const { store, deps } = setup();
    await store.createSeance(seance());
    const res = await handlePublic(get(), ID, deps);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ title: 'Midnight circle', open: true });
  });

  it('returns open: false for an ended séance', async () => {
    const { store, deps } = setup();
    await store.createSeance(seance());
    await store.endSeance(ID);
    const res = await handlePublic(get(), ID, deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ title: 'Midnight circle', open: false });
  });
});

describe('handlePublic: not found', () => {
  it('gives identical 404 bodies for malformed, unknown and expired IDs', async () => {
    const { clock, store, deps } = setup();
    await store.createSeance(seance({ sessionId: 'EXPIREDX' }));
    clock.now = T0 + SEANCE_TTL_MS;

    const malformed = ['', 'abc', 'ABCDEFG', 'ABCDEFGHJ', 'ABCDEFG0', 'abcdefgh', 'ABCD FGH', '../../x'];
    const responses = [
      ...(await Promise.all(malformed.map((id) => handlePublic(get(), id, deps)))),
      await handlePublic(get(), 'NOPENOPE', deps),
      await handlePublic(get(), 'EXPIREDX', deps),
    ];

    const bodies: string[] = [];
    for (const res of responses) {
      expect(res.status).toBe(404);
      expect(res.headers.get('Content-Type')).toBe('application/json');
      bodies.push(await res.text());
    }
    expect(new Set(bodies).size).toBe(1);
  });

  it('does not touch the store for a malformed ID', async () => {
    const { store, deps } = setup();
    const spy = spyStore(store);
    const res = await handlePublic(get(), 'bad', { ...deps, store: spy.store });
    expect(res.status).toBe(404);
    expect(spy.calls).toEqual([]);
  });

  it('treats a séance as open just before 24 hours and gone at 24 hours', async () => {
    const { clock, store, deps } = setup();
    await store.createSeance(seance());
    clock.now = T0 + SEANCE_TTL_MS - 1;
    expect((await handlePublic(get(), ID, deps)).status).toBe(200);
    clock.now = T0 + SEANCE_TTL_MS;
    expect((await handlePublic(get(), ID, deps)).status).toBe(404);
  });
});

describe('handlePublic: read-only and no leaks', () => {
  it('only reads from the store', async () => {
    const { store, deps } = setup();
    await store.createSeance(seance());
    const spy = spyStore(store);
    await handlePublic(get(), ID, { ...deps, store: spy.store });
    await handlePublic(get(), 'NOPENOPE', { ...deps, store: spy.store });
    expect(spy.calls.every((c) => c === 'getSeance')).toBe(true);
  });

  it('leaves séance and check-ins unchanged', async () => {
    const { store, deps } = setup();
    const original = seance();
    await store.createSeance(original);
    const ci: StoredCheckIn = { name: 'Ada', deviceId: DEVICE, at: new Date(T0).toISOString() };
    await store.addCheckIn(ID, DEVICE, ci);

    await handlePublic(get(), ID, deps);

    expect(await store.getSeance(ID)).toEqual(original);
    expect(await store.listCheckIns(ID)).toEqual([ci]);
    expect(await store.listSeanceIds()).toEqual([ID]);
  });

  it('never includes the secret, check-ins or device IDs in the body', async () => {
    const { store, deps } = setup();
    await store.createSeance(seance());
    await store.addCheckIn(ID, DEVICE, { name: 'Ada Lovelace', deviceId: DEVICE, at: new Date(T0).toISOString() });
    const res = await handlePublic(get(), ID, deps);
    const text = await res.text();
    expect(Object.keys(JSON.parse(text) as object).sort()).toEqual(['open', 'title']);
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain(DEVICE);
    expect(text).not.toContain('Ada Lovelace');
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });
});

describe('handlePublic: method guard', () => {
  it.each(['POST', 'PUT', 'DELETE', 'PATCH'])('answers %s with 405 and Allow, without store access', async (method) => {
    const { store, deps } = setup();
    await store.createSeance(seance());
    const spy = spyStore(store);
    const res = await handlePublic(new Request(get().url, { method }), ID, { ...deps, store: spy.store });
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe(ALLOWED.join(', '));
    expect(res.headers.get('Allow')).toBe('GET');
    expect(spy.calls).toEqual([]);
  });
});

describe('handlePublic: store failure', () => {
  it('answers 500 with a fixed message', async () => {
    const { store, deps } = setup();
    const broken: SeanceStore = {
      ...store,
      getSeance: () => Promise.reject(new Error('blob exploded: secret-detail')),
    };
    const res = await handlePublic(get(), ID, { ...deps, store: broken });
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain('secret-detail');
  });
});
