import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { rollingCode, windowNumber } from '@screech/core';
import { handleCheckin } from '../src/seance-checkin.js';
import { createMemoryStore } from '../src/seance-store.js';
import type { StoredSeance } from '../src/seance-store.js';

const T0 = Date.parse('2026-10-31T20:00:00.000Z');
const ID = 'ABCDEFGH';
const SECRET = Uint8Array.from({ length: 32 }, (_, i) => i * 7 + 3);
const HOST_SECRET = Buffer.from(SECRET).toString('base64url');

function post(body: unknown): Request {
  return new Request(`https://example.test/api/seance/${ID}/checkin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const nameArb = fc.stringMatching(/^[A-Za-z0-9]{1,32}$/);
const deviceArb = fc.stringMatching(/^[0-9a-f]{32}$/);

// Feature: seance, Property 19: Concurrent same-device check-ins resolve to exactly one new record
describe('Feature: seance, Property 19: Concurrent same-device check-ins resolve to exactly one new record', () => {
  it('**Validates: Requirements 8.8, 17.3, 17.5** exactly one request is new, the rest repeat it, one record is stored', async () => {
    await fc.assert(
      fc.asyncProperty(
        deviceArb,
        fc.array(nameArb, { minLength: 1, maxLength: 20 }),
        async (deviceId, names) => {
          // Injected clock that moves forward on every read, so each request sees a different time.
          let tick = 0;
          const now = (): number => T0 + tick++;
          const store = createMemoryStore({ now: () => T0 });
          const seance: StoredSeance = {
            sessionId: ID,
            title: 'Midnight circle',
            hostSecret: HOST_SECRET,
            createdAt: new Date(T0).toISOString(),
            ended: false,
          };
          await store.createSeance(seance);
          const code = await rollingCode(SECRET, windowNumber(T0 / 1000));
          const deps = { store, now };

          const responses = await Promise.all(
            names.map((name) => handleCheckin(post({ name, deviceId, code }), ID, deps)),
          );
          const bodies = await Promise.all(
            responses.map((r) => r.json() as Promise<{ name: string; at: string; alreadyCheckedIn: boolean }>),
          );

          expect(responses.every((r) => r.status === 200)).toBe(true);
          const fresh = bodies.filter((b) => !b.alreadyCheckedIn);
          expect(fresh).toHaveLength(1);

          const winner = fresh[0]!;
          for (const b of bodies) {
            expect(b.name).toBe(winner.name);
            expect(b.at).toBe(winner.at);
          }

          const stored = await store.listCheckIns(ID);
          expect(stored).toHaveLength(1);
          expect(stored[0]).toEqual({ name: winner.name, deviceId, at: winner.at });
        },
      ),
      { numRuns: 100 },
    );
  });
});
