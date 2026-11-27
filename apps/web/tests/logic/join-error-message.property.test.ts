import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { joinErrorMessage, type ApiOutcome } from '../../src/logic/checkin-client';

// Feature: seance, Property 17: Join-error message mapping never leaks internals
describe('Property 17: Join-error message mapping never leaks internals', () => {
  const leakyText = fc.oneof(
    fc.string({ minLength: 8, maxLength: 80 }).map((s) => `LEAK<${s}>`),
    fc.constantFrom(
      'Error: connect ECONNREFUSED 10.0.0.5:5432\n    at Object.handler (/var/task/src/join.ts:42:13)',
      'TypeError: Cannot read properties of undefined\n    at run (checkin.ts:7:1)',
      'secret=hunter2-hostSecret-abc123',
      'HTTP 500 Internal Server Error',
    ),
  );
  const body = fc.oneof(
    leakyText,
    leakyText.map((message) => ({ message, stack: message, status: 500 })),
    fc.constant(null),
    fc.constant(undefined),
    fc.integer(),
  );
  const outcome: fc.Arbitrary<ApiOutcome<unknown>> = fc.oneof(
    fc.record({
      kind: fc.constant('http-error' as const),
      status: fc.oneof(fc.integer({ min: 100, max: 599 }), fc.integer({ min: 100, max: 999 })),
      body,
    }),
    fc.constant({ kind: 'network-error' as const }),
    fc.constant({ kind: 'timeout' as const }),
    fc.constant({ kind: 'ok' as const, value: { secret: 'LEAK<ok>' } }),
  );

  it('returns non-empty plain text with no status code, body text or stack fragment', () => {
    // **Validates: Requirements 16.9**
    fc.assert(
      fc.property(outcome, (o) => {
        const msg = joinErrorMessage(o);
        expect(msg.trim().length).toBeGreaterThan(0);
        expect(msg).not.toMatch(/\d{3}/);
        expect(msg).not.toMatch(/Error|\.ts:|\bat /);
        expect(msg).not.toMatch(/[<>{}\n]/);
        if (o.kind === 'http-error') {
          expect(msg).not.toContain(String(o.status));
          const b = o.body;
          const texts: string[] = [];
          if (typeof b === 'string') texts.push(b);
          if (typeof b === 'object' && b !== null) texts.push(JSON.stringify(b));
          for (const t of texts) expect(msg).not.toContain(t);
          if (typeof b === 'string') for (const part of b.split('\n')) if (part.length >= 8) expect(msg).not.toContain(part);
        }
      }),
      { numRuns: 300 },
    );
  });
});
