import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../src/seance-store.js';
import type { StoredCheckIn, StoredSeance } from '../src/seance-store.js';
import { SEANCE_TTL_MS } from '../src/seance.js';
import { runCleanup } from '../src/seance-cleanup.js';

const T0 = Date.parse('2026-10-31T20:00:00.000Z');
const HOUR = 60 * 60 * 1000;

function setup(start = T0) {
  const clock = { now: start };
  const now = () => clock.now;
  const store = createMemoryStore({ now });
  return { clock, store, now };
}

function seance(sessionId: string, createdMs: number, ended = false): StoredSeance {
  return {
    sessionId,
    title: 'Midnight circle',
    hostSecret: 'h'.repeat(43),
    createdAt: new Date(createdMs).toISOString(),
    ended,
  };
}

function checkIn(deviceId: string): StoredCheckIn {
  return { name: 'Ada', deviceId, at: new Date(T0).toISOString() };
}

describe('runCleanup', () => {
  it('removes an expired séance and its check-ins', async () => {
    const { clock, store, now } = setup();
    await store.createSeance(seance('EXPIRED1', T0));
    await store.addCheckIn('EXPIRED1', 'dev-a', checkIn('dev-a'));
    await store.addCheckIn('EXPIRED1', 'dev-b', checkIn('dev-b'));
    clock.now = T0 + SEANCE_TTL_MS + HOUR;

    const result = await runCleanup({ store, now });

    expect(result.deleted).toEqual(['EXPIRED1']);
    expect(await store.listSeanceIds()).toEqual([]);
    expect(await store.listCheckIns('EXPIRED1')).toEqual([]);
  });

  it('removes a séance exactly 24 hours old', async () => {
    const { clock, store, now } = setup();
    await store.createSeance(seance('EXACT24H', T0));
    clock.now = T0 + SEANCE_TTL_MS;

    const result = await runCleanup({ store, now });

    expect(result.deleted).toEqual(['EXACT24H']);
    expect(await store.listSeanceIds()).toEqual([]);
  });

  it('keeps open and ended séances under 24 hours old, with their check-ins', async () => {
    const { clock, store, now } = setup();
    await store.createSeance(seance('OPENOPEN', T0));
    await store.createSeance(seance('ENDEDEND', T0, true));
    await store.addCheckIn('OPENOPEN', 'dev-a', checkIn('dev-a'));
    await store.addCheckIn('ENDEDEND', 'dev-b', checkIn('dev-b'));
    clock.now = T0 + SEANCE_TTL_MS - 1;

    const result = await runCleanup({ store, now });

    expect(result.deleted).toEqual([]);
    expect([...(await store.listSeanceIds())].sort()).toEqual(['ENDEDEND', 'OPENOPEN']);
    expect(await store.listCheckIns('OPENOPEN')).toHaveLength(1);
    expect(await store.listCheckIns('ENDEDEND')).toHaveLength(1);
  });

  it('removes only the expired séances when old and young ones are mixed', async () => {
    const { clock, store, now } = setup();
    await store.createSeance(seance('OLDOLDOL', T0 - 2 * HOUR));
    await store.createSeance(seance('OLDENDED', T0 - 3 * HOUR, true));
    await store.createSeance(seance('YOUNGONE', T0));
    await store.addCheckIn('OLDOLDOL', 'dev-a', checkIn('dev-a'));
    await store.addCheckIn('OLDENDED', 'dev-b', checkIn('dev-b'));
    await store.addCheckIn('YOUNGONE', 'dev-c', checkIn('dev-c'));
    clock.now = T0 - 2 * HOUR + SEANCE_TTL_MS + 1;

    const result = await runCleanup({ store, now });

    expect([...result.deleted].sort()).toEqual(['OLDENDED', 'OLDOLDOL']);
    expect(await store.listSeanceIds()).toEqual(['YOUNGONE']);
    expect(await store.listCheckIns('OLDOLDOL')).toEqual([]);
    expect(await store.listCheckIns('OLDENDED')).toEqual([]);
    expect(await store.listCheckIns('YOUNGONE')).toHaveLength(1);
  });

  it('does not touch check-ins of a kept séance whose ID shares a prefix', async () => {
    const { clock, store, now } = setup();
    await store.createSeance(seance('SAMEPREF', T0 - 2 * HOUR));
    await store.createSeance(seance('SAMEPREF2', T0));
    await store.addCheckIn('SAMEPREF', 'dev-a', checkIn('dev-a'));
    await store.addCheckIn('SAMEPREF2', 'dev-b', checkIn('dev-b'));
    clock.now = T0 - 2 * HOUR + SEANCE_TTL_MS;

    await runCleanup({ store, now });

    expect(await store.listCheckIns('SAMEPREF')).toEqual([]);
    expect(await store.listCheckIns('SAMEPREF2')).toHaveLength(1);
  });

  it('does nothing on an empty store', async () => {
    const { store, now } = setup();
    expect(await runCleanup({ store, now })).toEqual({ deleted: [] });
  });

  it('is idempotent: a second run deletes nothing', async () => {
    const { clock, store, now } = setup();
    await store.createSeance(seance('EXPIRED1', T0));
    clock.now = T0 + SEANCE_TTL_MS + 1;

    expect((await runCleanup({ store, now })).deleted).toEqual(['EXPIRED1']);
    expect((await runCleanup({ store, now })).deleted).toEqual([]);
  });

  it('uses the injected clock, not the real one', async () => {
    const { store } = setup();
    await store.createSeance(seance('FUTUREST', T0));
    // Store clock says "young"; the cleanup clock says 25 hours later.
    const result = await runCleanup({ store, now: () => T0 + 25 * HOUR });
    expect(result.deleted).toEqual(['FUTUREST']);
  });
});
