// Feature: haunting-sounds, Property 17: Duplicate one-shots inside 30 ms are ignored
// **Validates: Requirements 6.11**
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEDUPE_WINDOW_MS, decideOneShot, type LastAccepted } from '../../src/logic/haunt-rules';
import type { OneShotName } from '../../src/logic/haunt-synth';

const NAMES: readonly OneShotName[] = [
  'awaken',
  'card-flip',
  'candle-crackle',
  'whisper',
  'broken-crackle',
  'sealed-thud',
  'planchette-scrape',
];

interface Req {
  readonly name: OneShotName;
  readonly t: number;
}

const nameArb = fc.constantFrom(...NAMES);

/** Names drawn from a small pool so repeats are common; gaps cluster around the window. */
const requestsArb = (pool: readonly OneShotName[]): fc.Arbitrary<readonly Req[]> =>
  fc
    .array(
      fc.record({
        name: fc.constantFrom(...pool),
        gap: fc.oneof(fc.integer({ min: 1, max: 80 }), fc.integer({ min: 1, max: 5000 })),
      }),
      { maxLength: 60 },
    )
    .map((items) => {
      let t = 0;
      return items.map((it) => {
        t += it.gap;
        return { name: it.name, t } as Req;
      });
    });

const startArb = fc.integer({ min: 0, max: 1_000_000 });

const seqArb = fc
  .tuple(startArb, requestsArb(NAMES.slice(0, 3)))
  .map(([start, reqs]) => reqs.map((r) => ({ name: r.name, t: r.t + start })));

interface Run {
  readonly req: Req;
  readonly accept: boolean;
  readonly before: LastAccepted;
  readonly next: LastAccepted;
}

function run(reqs: readonly Req[]): Run[] {
  let last: LastAccepted = {};
  const out: Run[] = [];
  for (const req of reqs) {
    const d = decideOneShot(last, req.name, req.t);
    out.push({ req, accept: d.accept, before: last, next: d.next });
    last = d.next;
  }
  return out;
}

function reference(reqs: readonly Req[]): boolean[] {
  const accepted: Req[] = [];
  return reqs.map((r) => {
    const dup = accepted.some((a) => a.name === r.name && r.t - a.t >= 0 && r.t - a.t < DEDUPE_WINDOW_MS);
    if (!dup) accepted.push(r);
    return !dup;
  });
}

describe('Property 17: Duplicate one-shots inside 30 ms are ignored', () => {
  it('the window is 30 ms', () => {
    expect(DEDUPE_WINDOW_MS).toBe(30);
  });

  it('accepts iff no accepted request of the same name lies in the previous 30 ms', () => {
    fc.assert(
      fc.property(seqArb, (reqs) => {
        expect(run(reqs).map((r) => r.accept)).toEqual(reference(reqs));
      }),
      { numRuns: 200 },
    );
  });

  it('a different name is never refused because of another name', () => {
    fc.assert(
      fc.property(seqArb, nameArb, startArb, (reqs, extra, dt) => {
        const results = run(reqs);
        const lastState = results.length > 0 ? (results[results.length - 1] as Run).next : {};
        const tNow = (reqs.length > 0 ? (reqs[reqs.length - 1] as Req).t : 0) + (dt % 30);
        const sameNameSeen = reqs.some((r) => r.name === extra);
        if (!sameNameSeen) {
          expect(decideOneShot(lastState, extra, tNow).accept).toBe(true);
        }
        // Interleaving other names must not change the decisions for one name.
        const only = reqs.filter((r) => r.name === extra);
        const solo = run(only).map((r) => r.accept);
        const mixed = results.filter((r) => r.req.name === extra).map((r) => r.accept);
        expect(mixed).toEqual(solo);
      }),
      { numRuns: 200 },
    );
  });

  it('at most one accepted request per name in any 30 ms window', () => {
    fc.assert(
      fc.property(seqArb, (reqs) => {
        const accepted = run(reqs).filter((r) => r.accept).map((r) => r.req);
        for (const a of accepted) {
          const inWindow = accepted.filter(
            (b) => b.name === a.name && b.t >= a.t && b.t < a.t + DEDUPE_WINDOW_MS,
          );
          expect(inWindow).toHaveLength(1);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('a refused decision returns next equal to the input; an accepted one sets last[name] = now', () => {
    fc.assert(
      fc.property(seqArb, (reqs) => {
        for (const r of run(reqs)) {
          if (r.accept) {
            expect(r.next[r.req.name]).toBe(r.req.t);
            for (const n of NAMES) {
              if (n !== r.req.name) expect(r.next[n]).toBe(r.before[n]);
            }
          } else {
            expect(r.next).toBe(r.before);
            expect(r.next).toEqual(r.before);
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});
