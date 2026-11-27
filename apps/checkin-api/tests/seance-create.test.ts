import { describe, expect, it } from 'vitest';
import { HUNT_ALPHABET } from '@screech/core';
import {
  ALLOWED,
  CREATE_UNAVAILABLE_MESSAGE,
  MAX_ID_ATTEMPTS,
  TITLE_ERROR_MESSAGE,
  handleCreate,
} from '../src/seance-create.js';
import type { CreateDeps } from '../src/seance-create.js';
import { createMemoryStore } from '../src/seance-store.js';
import type { SeanceStore, StoredSeance } from '../src/seance-store.js';

const NOW = Date.UTC(2026, 9, 31, 12, 0, 0);

function post(body: string | null): Request {
  return new Request('https://example.test/api/seance', { method: 'POST', body });
}

function postTitle(title: unknown): Request {
  return post(JSON.stringify({ title }));
}

/** Bytes that all map to one alphabet character, so the 8-character ID is that character repeated. */
function idFor(k: number): string {
  return HUNT_ALPHABET.charAt(k % HUNT_ALPHABET.length).repeat(8);
}

/** 16-byte draws (the ID) come from `idDraws` in order; 32-byte draws (the secret) are all `secretByte`. */
function scriptedRandom(idDraws: readonly number[], secretByte = 7): (n: number) => Uint8Array {
  let i = 0;
  return (n) => {
    if (n === 32) return new Uint8Array(32).fill(secretByte);
    const k = idDraws[Math.min(i++, idDraws.length - 1)] ?? 0;
    return new Uint8Array(n).fill(k);
  };
}

function seanceStub(sessionId: string): StoredSeance {
  return { sessionId, title: 'old', hostSecret: 'x', createdAt: new Date(NOW).toISOString(), ended: false };
}

/** Wraps a store and counts every call. */
function countingStore(inner: SeanceStore): { store: SeanceStore; calls: () => number } {
  let count = 0;
  const store = new Proxy(inner, {
    get(target, prop, receiver) {
      const value: unknown = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        count++;
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
  return { store, calls: () => count };
}

function setup(randomBytes?: (n: number) => Uint8Array): { store: SeanceStore; deps: CreateDeps } {
  const store = createMemoryStore({ now: () => NOW });
  return { store, deps: { store, now: () => NOW, ...(randomBytes ? { randomBytes } : {}) } };
}

describe('handleCreate: success', () => {
  it('answers 201 with sessionId, title and hostSecret', async () => {
    const { deps } = setup(scriptedRandom([3]));
    const res = await handleCreate(postTitle('Math club'), deps);
    expect(res.status).toBe(201);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['hostSecret', 'sessionId', 'title']);
    expect(body['sessionId']).toBe(idFor(3));
    expect(body['title']).toBe('Math club');
    expect(body['hostSecret']).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('uses the default random source: ID from the Hunt alphabet, distinct secrets', async () => {
    const { deps } = setup();
    const a = (await (await handleCreate(postTitle('A'), deps)).json()) as { sessionId: string; hostSecret: string };
    const b = (await (await handleCreate(postTitle('B'), deps)).json()) as { sessionId: string; hostSecret: string };
    expect(a.sessionId).toHaveLength(8);
    for (const ch of a.sessionId) expect(HUNT_ALPHABET).toContain(ch);
    expect(a.hostSecret).not.toBe(b.hostSecret);
  });

  it('stores exactly the five fields, with createdAt from the injected clock', async () => {
    const { store, deps } = setup(scriptedRandom([5]));
    const body = (await (await handleCreate(postTitle('Night shift'), deps)).json()) as {
      sessionId: string;
      hostSecret: string;
    };
    const stored = await store.getSeance(body.sessionId);
    expect(stored).not.toBeNull();
    expect(Object.keys(stored ?? {}).sort()).toEqual(['createdAt', 'ended', 'hostSecret', 'sessionId', 'title']);
    expect(stored).toEqual({
      sessionId: body.sessionId,
      title: 'Night shift',
      hostSecret: body.hostSecret,
      createdAt: new Date(NOW).toISOString(),
      ended: false,
    });
  });
});

describe('handleCreate: title validation', () => {
  it('rejects an empty title with 400 and stores nothing', async () => {
    const { store, deps } = setup(scriptedRandom([1]));
    const res = await handleCreate(postTitle(''), deps);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: TITLE_ERROR_MESSAGE });
    expect(await store.listSeanceIds()).toEqual([]);
  });

  it('rejects a whitespace-only title', async () => {
    const { deps } = setup();
    expect((await handleCreate(postTitle('   \t '), deps)).status).toBe(400);
  });

  it('accepts 1 and 60 characters', async () => {
    const { deps } = setup();
    expect((await handleCreate(postTitle('a'), deps)).status).toBe(201);
    expect((await handleCreate(postTitle('b'.repeat(60)), deps)).status).toBe(201);
  });

  it('rejects 61 characters', async () => {
    const { deps } = setup();
    const res = await handleCreate(postTitle('c'.repeat(61)), deps);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: TITLE_ERROR_MESSAGE });
  });

  it('trims before counting and stores the trimmed title', async () => {
    const { store, deps } = setup(scriptedRandom([2]));
    const res = await handleCreate(postTitle(`  ${'d'.repeat(60)}  `), deps);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { sessionId: string; title: string };
    expect(body.title).toBe('d'.repeat(60));
    expect((await store.getSeance(body.sessionId))?.title).toBe('d'.repeat(60));
  });

  it('still rejects 61 characters that remain after trimming', async () => {
    const { deps } = setup();
    expect((await handleCreate(postTitle(` ${'e'.repeat(61)} `), deps)).status).toBe(400);
  });

  it('rejects a non-string title', async () => {
    const { store, deps } = setup();
    for (const title of [42, null, true, ['x'], { a: 1 }]) {
      const res = await handleCreate(postTitle(title), deps);
      expect(res.status).toBe(400);
    }
    expect(await store.listSeanceIds()).toEqual([]);
  });

  it('rejects a missing title and non-object bodies', async () => {
    const { deps } = setup();
    for (const raw of ['{}', '[]', '"title"', 'null', '7']) {
      expect((await handleCreate(post(raw), deps)).status).toBe(400);
    }
  });
});

describe('handleCreate: bad body', () => {
  it('answers 400 for invalid JSON and stores nothing', async () => {
    const { store, deps } = setup();
    const res = await handleCreate(post('{not json'), deps);
    expect(res.status).toBe(400);
    expect(await store.listSeanceIds()).toEqual([]);
  });

  it('answers 400 for an empty body', async () => {
    const { deps } = setup();
    expect((await handleCreate(post(null), deps)).status).toBe(400);
  });
});

describe('handleCreate: ID collisions', () => {
  it('retries after a collision and uses the next free ID', async () => {
    const { store, deps } = setup(scriptedRandom([1, 1, 2]));
    await store.createSeance(seanceStub(idFor(1)));
    const res = await handleCreate(postTitle('Retry'), deps);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { sessionId: string };
    expect(body.sessionId).toBe(idFor(2));
    // The pre-existing séance is untouched.
    expect((await store.getSeance(idFor(1)))?.title).toBe('old');
  });

  it('succeeds on the 10th attempt', async () => {
    const draws = Array.from({ length: MAX_ID_ATTEMPTS }, (_, i) => i);
    const { store, deps } = setup(scriptedRandom(draws));
    for (const k of draws.slice(0, -1)) await store.createSeance(seanceStub(idFor(k)));
    const res = await handleCreate(postTitle('Last chance'), deps);
    expect(res.status).toBe(201);
    expect(((await res.json()) as { sessionId: string }).sessionId).toBe(idFor(MAX_ID_ATTEMPTS - 1));
  });

  it('answers 503 after 10 collisions and creates nothing', async () => {
    const draws = Array.from({ length: MAX_ID_ATTEMPTS }, (_, i) => i);
    const { store, deps } = setup(scriptedRandom(draws));
    for (const k of draws) await store.createSeance(seanceStub(idFor(k)));
    const before = (await store.listSeanceIds()).length;
    const res = await handleCreate(postTitle('Crowded'), deps);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: CREATE_UNAVAILABLE_MESSAGE });
    expect((await store.listSeanceIds()).length).toBe(before);
  });
});

describe('handleCreate: method guard', () => {
  it.each(['GET', 'PUT', 'DELETE', 'PATCH'])('answers 405 with Allow for %s and never touches the store', async (method) => {
    const { store, calls } = (() => {
      const c = countingStore(createMemoryStore({ now: () => NOW }));
      return { store: c.store, calls: c.calls };
    })();
    const res = await handleCreate(new Request('https://example.test/api/seance', { method }), {
      store,
      now: () => NOW,
    });
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe(ALLOWED.join(', '));
    expect(res.headers.get('Allow')).toBe('POST');
    expect(calls()).toBe(0);
  });
});
