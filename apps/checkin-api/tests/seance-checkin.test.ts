import { describe, expect, it } from 'vitest';
import { rollingCode, windowNumber } from '@screech/core';
import { ALLOWED, handleCheckin } from '../src/seance-checkin.js';
import { createMemoryStore } from '../src/seance-store.js';
import type { SeanceStore, StoredSeance } from '../src/seance-store.js';
import { SEANCE_TTL_MS } from '../src/seance.js';

const T0 = Date.parse('2026-10-31T20:00:00.000Z');
const ID = 'ABCDEFGH';
const SECRET = Uint8Array.from({ length: 32 }, (_, i) => i * 7 + 3);
const HOST_SECRET = Buffer.from(SECRET).toString('base64url');
const DEVICE_A = 'a'.repeat(32);
const DEVICE_B = 'b'.repeat(32);

function setup(opts: { ended?: boolean; seed?: boolean } = {}) {
  const clock = { now: T0 };
  const store = createMemoryStore({ now: () => clock.now });
  const deps = { store, now: () => clock.now };
  const seance: StoredSeance = {
    sessionId: ID,
    title: 'Midnight circle',
    hostSecret: HOST_SECRET,
    createdAt: new Date(T0).toISOString(),
    ended: opts.ended ?? false,
  };
  const ready = opts.seed === false ? Promise.resolve() : store.createSeance(seance);
  return { clock, store, deps, ready };
}

const codeAt = (ms: number): Promise<string> => rollingCode(SECRET, windowNumber(ms / 1000));

function post(body: unknown, method = 'POST'): Request {
  return new Request(`https://example.test/api/seance/${ID}/checkin`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function bodyOf(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

/** A store that fails the test on any access. */
function forbiddenStore(): SeanceStore {
  return new Proxy({} as SeanceStore, {
    get(_t, prop) {
      throw new Error(`store.${String(prop)} must not be touched`);
    },
  });
}

describe('handleCheckin success', () => {
  it('200 for a new check-in, with the name, server time and alreadyCheckedIn false', async () => {
    const { deps, ready } = setup();
    await ready;
    const res = await handleCheckin(post({ name: 'Ada', deviceId: DEVICE_A, code: await codeAt(T0) }), ID, deps);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(await bodyOf(res)).toEqual({ name: 'Ada', at: new Date(T0).toISOString(), alreadyCheckedIn: false });
  });

  it('accepts the previous window code', async () => {
    const { deps, ready } = setup();
    await ready;
    const res = await handleCheckin(post({ name: 'Ada', deviceId: DEVICE_A, code: await codeAt(T0 - 30_000) }), ID, deps);
    expect(res.status).toBe(200);
  });

  it('200 for a repeat of the same device, returning the stored record without a second one', async () => {
    const { deps, store, clock, ready } = setup();
    await ready;
    const code = await codeAt(T0);
    await handleCheckin(post({ name: 'Ada', deviceId: DEVICE_A, code }), ID, deps);
    clock.now = T0 + 5_000;
    const res = await handleCheckin(post({ name: 'Other', deviceId: DEVICE_A, code }), ID, deps);
    expect(res.status).toBe(200);
    expect(await bodyOf(res)).toEqual({ name: 'Ada', at: new Date(T0).toISOString(), alreadyCheckedIn: true });
    expect(await store.listCheckIns(ID)).toHaveLength(1);
  });

  it('stores both check-ins when different devices check in', async () => {
    const { deps, store, ready } = setup();
    await ready;
    const code = await codeAt(T0);
    const a = await handleCheckin(post({ name: 'Ada', deviceId: DEVICE_A, code }), ID, deps);
    const b = await handleCheckin(post({ name: 'Ada', deviceId: DEVICE_B, code }), ID, deps);
    expect((await bodyOf(a))['alreadyCheckedIn']).toBe(false);
    expect((await bodyOf(b))['alreadyCheckedIn']).toBe(false);
    const stored = await store.listCheckIns(ID);
    expect(stored.map((c) => c.deviceId).sort()).toEqual([DEVICE_A, DEVICE_B]);
  });

  it('returns the name as plain JSON text, not markup-escaped', async () => {
    const { deps, ready } = setup();
    await ready;
    const name = '<b>Ada & "Bo"</b>';
    const res = await handleCheckin(post({ name, deviceId: DEVICE_A, code: await codeAt(T0) }), ID, deps);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    const text = await res.text();
    expect(JSON.parse(text).name).toBe(name);
    expect(text).not.toContain('&lt;');
    expect(text).not.toContain('&amp;');
  });

  it('trims the name before storing', async () => {
    const { deps, ready } = setup();
    await ready;
    const res = await handleCheckin(post({ name: '  Ada  ', deviceId: DEVICE_A, code: await codeAt(T0) }), ID, deps);
    expect((await bodyOf(res))['name']).toBe('Ada');
  });
});

describe('handleCheckin repeats after the séance or code is no longer valid', () => {
  it('200 repeat after the séance ended', async () => {
    const { deps, store, ready } = setup();
    await ready;
    const code = await codeAt(T0);
    await handleCheckin(post({ name: 'Ada', deviceId: DEVICE_A, code }), ID, deps);
    await store.endSeance(ID);
    const res = await handleCheckin(post({ name: 'Ada', deviceId: DEVICE_A, code }), ID, deps);
    expect(res.status).toBe(200);
    expect((await bodyOf(res))['alreadyCheckedIn']).toBe(true);
  });

  it('200 repeat after the code expired, even with a wrong code', async () => {
    const { deps, clock, ready } = setup();
    await ready;
    const code = await codeAt(T0);
    await handleCheckin(post({ name: 'Ada', deviceId: DEVICE_A, code }), ID, deps);
    clock.now = T0 + 10 * 60_000;
    const res = await handleCheckin(post({ name: 'Ada', deviceId: DEVICE_A, code }), ID, deps);
    expect(res.status).toBe(200);
    expect((await bodyOf(res))['alreadyCheckedIn']).toBe(true);
  });
});

describe('handleCheckin errors', () => {
  it('400 naming the name when it is empty, and stores nothing', async () => {
    const { deps, store, ready } = setup();
    await ready;
    const res = await handleCheckin(post({ name: '   ', deviceId: DEVICE_A, code: await codeAt(T0) }), ID, deps);
    expect(res.status).toBe(400);
    expect(String((await bodyOf(res))['error'])).toMatch(/name/i);
    expect(await store.listCheckIns(ID)).toHaveLength(0);
  });

  it('400 when the name is longer than 32 characters, and accepts exactly 32', async () => {
    const { deps, ready } = setup();
    await ready;
    const code = await codeAt(T0);
    const tooLong = await handleCheckin(post({ name: 'x'.repeat(33), deviceId: DEVICE_A, code }), ID, deps);
    expect(tooLong.status).toBe(400);
    const ok = await handleCheckin(post({ name: 'x'.repeat(32), deviceId: DEVICE_A, code }), ID, deps);
    expect(ok.status).toBe(200);
  });

  it('400 when the name is not a string', async () => {
    const { deps, ready } = setup();
    await ready;
    const res = await handleCheckin(post({ name: 42, deviceId: DEVICE_A, code: await codeAt(T0) }), ID, deps);
    expect(res.status).toBe(400);
  });

  it.each([
    ['missing', undefined],
    ['too short', 'abc'],
    ['uppercase hex', 'A'.repeat(32)],
    ['not hex', 'z'.repeat(32)],
    ['not a string', 12],
  ])('400 naming deviceId when it is %s', async (_label, deviceId) => {
    const { deps, ready } = setup();
    await ready;
    const res = await handleCheckin(post({ name: 'Ada', deviceId, code: await codeAt(T0) }), ID, deps);
    expect(res.status).toBe(400);
    expect(String((await bodyOf(res))['error'])).toContain('deviceId');
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['not a string', 123456],
  ])('400 naming code when it is %s', async (_label, code) => {
    const { deps, ready } = setup();
    await ready;
    const res = await handleCheckin(post({ name: 'Ada', deviceId: DEVICE_A, code }), ID, deps);
    expect(res.status).toBe(400);
    expect(String((await bodyOf(res))['error'])).toContain('code');
  });

  it('400 for a body that is not JSON or not an object, without store access', async () => {
    const deps = { store: forbiddenStore(), now: () => T0 };
    expect((await handleCheckin(post('not json'), ID, deps)).status).toBe(400);
    expect((await handleCheckin(post([1, 2]), ID, deps)).status).toBe(400);
    expect((await handleCheckin(post(null), ID, deps)).status).toBe(400);
  });

  it('validates fields before touching the store', async () => {
    const deps = { store: forbiddenStore(), now: () => T0 };
    const res = await handleCheckin(post({ name: '', deviceId: 'bad', code: '' }), ID, deps);
    expect(res.status).toBe(400);
  });

  it('403 for a wrong code, and stores nothing', async () => {
    const { deps, store, ready } = setup();
    await ready;
    const right = await codeAt(T0);
    const wrong = right === '000000' ? '000001' : '000000';
    const res = await handleCheckin(post({ name: 'Ada', deviceId: DEVICE_A, code: wrong }), ID, deps);
    expect(res.status).toBe(403);
    expect(await store.listCheckIns(ID)).toHaveLength(0);
  });

  it('403 for a code two windows old, 200 for one window old', async () => {
    const { deps, clock, ready } = setup();
    await ready;
    const old = await codeAt(T0);
    clock.now = T0 + 30_000;
    expect((await handleCheckin(post({ name: 'Ada', deviceId: DEVICE_A, code: old }), ID, deps)).status).toBe(200);
    clock.now = T0 + 60_000;
    expect((await handleCheckin(post({ name: 'Bo', deviceId: DEVICE_B, code: old }), ID, deps)).status).toBe(403);
  });

  it('403 for a code that is not six digits', async () => {
    const { deps, ready } = setup();
    await ready;
    const res = await handleCheckin(post({ name: 'Ada', deviceId: DEVICE_A, code: 'abcdef' }), ID, deps);
    expect(res.status).toBe(403);
  });

  it('404 for an unknown séance', async () => {
    const { deps, ready } = setup({ seed: false });
    await ready;
    const res = await handleCheckin(post({ name: 'Ada', deviceId: DEVICE_A, code: await codeAt(T0) }), ID, deps);
    expect(res.status).toBe(404);
  });

  it('404 for a malformed séance ID, with the same body as an unknown one, and no store access', async () => {
    const { deps, ready } = setup({ seed: false });
    await ready;
    const unknown = await handleCheckin(post({ name: 'Ada', deviceId: DEVICE_A, code: '123456' }), ID, deps);
    const forbidden = { store: forbiddenStore(), now: () => T0 };
    for (const bad of ['short', 'ABCDEFGHI', 'abcdefgh', '!!!!!!!!', '']) {
      const res = await handleCheckin(post({ name: 'Ada', deviceId: DEVICE_A, code: '123456' }), bad, forbidden);
      expect(res.status).toBe(404);
      expect(await res.text()).toBe(await unknown.clone().text());
    }
  });

  it('404 for an expired séance', async () => {
    const { deps, clock, ready } = setup();
    await ready;
    clock.now = T0 + SEANCE_TTL_MS;
    const res = await handleCheckin(post({ name: 'Ada', deviceId: DEVICE_A, code: await codeAt(clock.now) }), ID, deps);
    expect(res.status).toBe(404);
  });

  it('410 for a new device after the séance ended, and stores nothing', async () => {
    const { deps, store, ready } = setup({ ended: true });
    await ready;
    const res = await handleCheckin(post({ name: 'Ada', deviceId: DEVICE_A, code: await codeAt(T0) }), ID, deps);
    expect(res.status).toBe(410);
    expect(await store.listCheckIns(ID)).toHaveLength(0);
  });

  it('every error body is JSON with an error string in plain words', async () => {
    const { deps, ready } = setup({ ended: true });
    await ready;
    const res = await handleCheckin(post({ name: 'Ada', deviceId: DEVICE_A, code: await codeAt(T0) }), ID, deps);
    const body = await bodyOf(res);
    expect(typeof body['error']).toBe('string');
    expect(res.headers.get('Content-Type')).toBe('application/json');
  });
});

describe('handleCheckin method guard', () => {
  it('allows only POST', () => {
    expect(ALLOWED).toEqual(['POST']);
  });

  it.each(['GET', 'PUT', 'DELETE', 'PATCH'])('405 with Allow for %s and no store access', async (method) => {
    const deps = { store: forbiddenStore(), now: () => T0 };
    const req = new Request(`https://example.test/api/seance/${ID}/checkin`, { method });
    const res = await handleCheckin(req, ID, deps);
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('POST');
  });
});
