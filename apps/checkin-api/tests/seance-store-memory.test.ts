import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createMemoryStore } from '../src/seance-store.js';
import type { StoredCheckIn, StoredSeance } from '../src/seance-store.js';
import { SEANCE_TTL_MS } from '../src/seance.js';

const T0 = Date.parse('2026-10-31T20:00:00.000Z');

function setup(start = T0) {
  const clock = { now: start };
  const store = createMemoryStore({ now: () => clock.now });
  return { clock, store };
}

function seance(sessionId: string, createdMs = T0, title = 'Midnight circle'): StoredSeance {
  return {
    sessionId,
    title,
    hostSecret: 'h'.repeat(43),
    createdAt: new Date(createdMs).toISOString(),
    ended: false,
  };
}

function checkIn(deviceId: string, name = 'Ada'): StoredCheckIn {
  return { name, deviceId, at: new Date(T0).toISOString() };
}

const dev = (n: number): string => n.toString(16).padStart(32, '0');

describe('memory store: create and get', () => {
  it('returns a created séance', async () => {
    const { store } = setup();
    const s = seance('ABCDEFGH');
    await store.createSeance(s);
    expect(await store.getSeance('ABCDEFGH')).toEqual(s);
  });

  it('returns null for an unknown séance', async () => {
    const { store } = setup();
    expect(await store.getSeance('NOPENOPE')).toBeNull();
  });

  it('never overwrites an existing séance', async () => {
    const { store } = setup();
    await store.createSeance(seance('ABCDEFGH', T0, 'first'));
    await store.createSeance(seance('ABCDEFGH', T0, 'second'));
    expect((await store.getSeance('ABCDEFGH'))?.title).toBe('first');
  });

  it('endSeance marks the séance ended', async () => {
    const { store } = setup();
    await store.createSeance(seance('ABCDEFGH'));
    await store.endSeance('ABCDEFGH');
    expect((await store.getSeance('ABCDEFGH'))?.ended).toBe(true);
  });
});

describe('memory store: expiry (injected clock)', () => {
  it('is readable just before 24 hours', async () => {
    const { store, clock } = setup();
    await store.createSeance(seance('ABCDEFGH'));
    clock.now = T0 + SEANCE_TTL_MS - 1;
    expect(await store.getSeance('ABCDEFGH')).not.toBeNull();
  });

  it('reads as missing at 24 hours but is still listed until deleted', async () => {
    const { store, clock } = setup();
    await store.createSeance(seance('ABCDEFGH'));
    clock.now = T0 + SEANCE_TTL_MS;
    expect(await store.getSeance('ABCDEFGH')).toBeNull();
    expect(await store.listSeanceIds()).toEqual(['ABCDEFGH']);
  });

  it('endSeance on an expired séance does nothing', async () => {
    const { store, clock } = setup();
    await store.createSeance(seance('ABCDEFGH'));
    clock.now = T0 + SEANCE_TTL_MS + 1;
    await store.endSeance('ABCDEFGH');
    clock.now = T0; // rewind: the stored record must be unchanged
    expect((await store.getSeance('ABCDEFGH'))?.ended).toBe(false);
  });
});

describe('memory store: check-ins, list and delete', () => {
  it('first check-in is added, a repeat returns the original', async () => {
    const { store } = setup();
    const first = await store.addCheckIn('ABCDEFGH', dev(1), checkIn(dev(1), 'Ada'));
    const again = await store.addCheckIn('ABCDEFGH', dev(1), checkIn(dev(1), 'Bob'));
    expect(first.added).toBe(true);
    expect(again.added).toBe(false);
    expect(again.checkIn.name).toBe('Ada');
    expect(await store.listCheckIns('ABCDEFGH')).toHaveLength(1);
  });

  it('lists only the check-ins of the requested séance', async () => {
    const { store } = setup();
    await store.addCheckIn('AAAAAAAA', dev(1), checkIn(dev(1)));
    await store.addCheckIn('AAAAAAAA', dev(2), checkIn(dev(2)));
    await store.addCheckIn('BBBBBBBB', dev(3), checkIn(dev(3)));
    const names = (await store.listCheckIns('AAAAAAAA')).map((c) => c.deviceId).sort();
    expect(names).toEqual([dev(1), dev(2)]);
    expect(await store.listCheckIns('CCCCCCCC')).toEqual([]);
  });

  it('lists every séance ID', async () => {
    const { store } = setup();
    await store.createSeance(seance('AAAAAAAA'));
    await store.createSeance(seance('BBBBBBBB'));
    expect([...(await store.listSeanceIds())].sort()).toEqual(['AAAAAAAA', 'BBBBBBBB']);
  });

  it('delete removes the séance and its check-ins only', async () => {
    const { store } = setup();
    await store.createSeance(seance('AAAAAAAA'));
    await store.createSeance(seance('BBBBBBBB'));
    await store.addCheckIn('AAAAAAAA', dev(1), checkIn(dev(1)));
    await store.addCheckIn('BBBBBBBB', dev(2), checkIn(dev(2)));
    await store.deleteSeance('AAAAAAAA');
    expect(await store.getSeance('AAAAAAAA')).toBeNull();
    expect(await store.listCheckIns('AAAAAAAA')).toEqual([]);
    expect(await store.listSeanceIds()).toEqual(['BBBBBBBB']);
    expect(await store.listCheckIns('BBBBBBBB')).toHaveLength(1);
  });

  it('deleting a missing séance is not an error', async () => {
    const { store } = setup();
    await expect(store.deleteSeance('NOPENOPE')).resolves.toBeUndefined();
  });
});

describe('memory store: concurrent addCheckIn', () => {
  it('yields exactly one winner for one key (example)', async () => {
    const { store } = setup();
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        store.addCheckIn('ABCDEFGH', dev(1), checkIn(dev(1), `name${i}`)),
      ),
    );
    const winners = results.filter((r) => r.added);
    expect(winners).toHaveLength(1);
    for (const r of results) expect(r.checkIn).toEqual(winners[0]!.checkIn);
    expect(await store.listCheckIns('ABCDEFGH')).toHaveLength(1);
  });

  it('yields exactly one winner for any number of concurrent calls (property)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 20 }), async (n) => {
        const { store } = setup();
        const results = await Promise.all(
          Array.from({ length: n }, (_, i) =>
            store.addCheckIn('ABCDEFGH', dev(7), checkIn(dev(7), `n${i}`)),
          ),
        );
        const winners = results.filter((r) => r.added);
        expect(winners).toHaveLength(1);
        expect(results.every((r) => r.checkIn.name === winners[0]!.checkIn.name)).toBe(true);
        expect(await store.listCheckIns('ABCDEFGH')).toHaveLength(1);
      }),
      { numRuns: 50 },
    );
  });
});
