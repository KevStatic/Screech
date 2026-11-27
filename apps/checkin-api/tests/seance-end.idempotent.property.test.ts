import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { handleEnd } from '../src/seance-end.js';
import { createMemoryStore } from '../src/seance-store.js';
import type { StoredCheckIn, StoredSeance } from '../src/seance-store.js';

const T0 = Date.parse('2026-10-31T20:00:00.000Z');
const ID = 'ABCDEFGH';
const SECRET = 'S'.repeat(43);

const dev = (n: number): string => n.toString(16).padStart(32, '0');

function endRequest(): Request {
  return new Request(`https://example.test/api/seance/${ID}/end`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SECRET}` },
  });
}

describe('handleEnd idempotence', () => {
  it('Feature: seance, Property 20: Ending a séance is idempotent', async () => {
    // **Validates: Requirements 9.2**
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 30 }),
        fc.integer({ min: 2, max: 5 }),
        fc.boolean(),
        async (names, calls, alreadyEnded) => {
          const now = () => T0;
          const store = createMemoryStore({ now });
          const seance: StoredSeance = {
            sessionId: ID,
            title: 'Midnight circle',
            hostSecret: SECRET,
            createdAt: new Date(T0).toISOString(),
            ended: false,
          };
          await store.createSeance(seance);
          for (const [i, name] of names.entries()) {
            const checkIn: StoredCheckIn = { name, deviceId: dev(i), at: new Date(T0 + i * 1000).toISOString() };
            await store.addCheckIn(ID, dev(i), checkIn);
          }
          if (alreadyEnded) await store.endSeance(ID);

          const deps = { store, now };
          const first = await handleEnd(endRequest(), ID, deps);
          expect(first.status).toBe(200);
          const firstBody = (await first.json()) as { count: number };
          expect(firstBody.count).toBe(names.length);
          const seanceAfterFirst = await store.getSeance(ID);
          const checkInsAfterFirst = await store.listCheckIns(ID);
          expect(seanceAfterFirst?.ended).toBe(true);

          for (let i = 1; i < calls; i++) {
            const res = await handleEnd(endRequest(), ID, deps);
            expect(res.status).toBe(200);
            expect(((await res.json()) as { count: number }).count).toBe(firstBody.count);
            expect(await store.getSeance(ID)).toEqual(seanceAfterFirst);
            expect(await store.listCheckIns(ID)).toEqual(checkInsAfterFirst);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
