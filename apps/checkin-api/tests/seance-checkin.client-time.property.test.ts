import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { rollingCode, windowNumber } from '@screech/core';
import { handleCheckin } from '../src/seance-checkin.js';
import { createMemoryStore } from '../src/seance-store.js';
import type { StoredSeance } from '../src/seance-store.js';

const ID = 'ABCDEFGH';
const SECRET = Uint8Array.from({ length: 32 }, (_, i) => i * 5 + 11);
const HOST_SECRET = Buffer.from(SECRET).toString('base64url');
const DEVICE = 'c'.repeat(32);

const TIME_KEYS = ['at', 'time', 'timestamp', 'now', 'ts', 'createdAt', 'clientTime', 'date', 'checkedInAt'] as const;
const TIME_HEADERS = ['Date', 'X-Client-Time', 'X-Timestamp', 'X-Request-Time'] as const;

const serverMs = fc.integer({ min: 1_700_000_000_000, max: 4_000_000_000_000 });

const timeValue = fc.oneof(
  fc.integer({ min: -1_000_000_000_000, max: 5_000_000_000_000 }),
  fc.double({ noNaN: true, noDefaultInfinity: true }),
  fc.date({ noInvalidDate: true }).map((d) => d.toISOString()),
  fc.string({ maxLength: 20 }),
  fc.constant(null),
  fc.boolean(),
);

const timeFields = fc.dictionary(fc.constantFrom(...TIME_KEYS), timeValue);
const headerValue = fc.oneof(
  fc.integer({ min: 0, max: 5_000_000_000_000 }).map(String),
  fc.date({ noInvalidDate: true }).map((d) => d.toUTCString()),
  fc.date({ noInvalidDate: true }).map((d) => d.toISOString()),
);
const timeHeaders = fc.dictionary(fc.constantFrom(...TIME_HEADERS), headerValue);

async function seeded(clockMs: number) {
  const store = createMemoryStore({ now: () => clockMs });
  const seance: StoredSeance = {
    sessionId: ID,
    title: 'Midnight circle',
    hostSecret: HOST_SECRET,
    createdAt: new Date(clockMs).toISOString(),
    ended: false,
  };
  await store.createSeance(seance);
  return { store, deps: { store, now: () => clockMs } };
}

const codeAt = (ms: number): Promise<string> => rollingCode(SECRET, windowNumber(ms / 1000));

function post(body: Record<string, unknown>, headers: Record<string, string>): Request {
  return new Request(`https://example.test/api/seance/${ID}/checkin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('Feature: seance, Property 18: Check-in handler ignores client-supplied time', () => {
  /** **Validates: Requirements 8.10** */
  it('stores `at` from the server clock whatever time fields the body or headers carry', async () => {
    await fc.assert(
      fc.asyncProperty(serverMs, timeFields, timeHeaders, async (clockMs, extraBody, extraHeaders) => {
        const { store, deps } = await seeded(clockMs);
        const body = { ...extraBody, name: 'Ada', deviceId: DEVICE, code: await codeAt(clockMs) };
        const res = await handleCheckin(post(body, extraHeaders), ID, deps);

        expect(res.status).toBe(200);
        const expectedAt = new Date(clockMs).toISOString();
        expect(((await res.json()) as { at: string }).at).toBe(expectedAt);
        const stored = await store.listCheckIns(ID);
        expect(stored).toHaveLength(1);
        expect(stored[0]?.at).toBe(expectedAt);
      }),
      { numRuns: 100 },
    );
  });

  /** **Validates: Requirements 8.10** */
  it('verifies the code against the server clock, not a client-supplied time', async () => {
    await fc.assert(
      fc.asyncProperty(
        serverMs,
        fc.integer({ min: 120_000, max: 10_000_000_000 }),
        fc.boolean(),
        async (clockMs, offset, ahead) => {
          const clientMs = ahead ? clockMs + offset : clockMs - offset;
          const { store, deps } = await seeded(clockMs);
          const iso = new Date(clientMs).toISOString();
          const body = {
            at: iso,
            time: clientMs,
            timestamp: clientMs / 1000,
            name: 'Ada',
            deviceId: DEVICE,
            code: await codeAt(clientMs),
          };
          const res = await handleCheckin(post(body, { Date: new Date(clientMs).toUTCString(), 'X-Client-Time': iso }), ID, deps);

          expect(res.status).toBe(403);
          expect(await store.listCheckIns(ID)).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
