import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { ClueFields } from '@screech/core';
import {
  counterHeading,
  counterRows,
  emptyFoundState,
  foundReducer,
  formatTimeTaken,
  timeTakenSeconds,
  type FoundState,
} from '../../src/logic/hunt-found';

const HUNT = 'ABC234';
const OTHER = 'XYZ789';

const totalArb = fc.integer({ min: 3, max: 7 });
const nameArb = fc.string({ minLength: 1, maxLength: 12 });
const timeArb = fc.integer({ min: 0, max: 1_000_000_000 });

function clue(huntId: string, total: number, index: number, name: string): ClueFields {
  return { huntId, total, index, name, clue: 'go' };
}

/** A hunt total plus a sequence of clues that mixes matching, foreign and repeated ones. */
const scenarioArb = totalArb.chain((total) =>
  fc.record({
    total: fc.constant(total),
    steps: fc.array(
      fc.record({
        huntId: fc.oneof(
          { arbitrary: fc.constant(HUNT), weight: 5 },
          { arbitrary: fc.constant(OTHER), weight: 1 },
        ),
        total: fc.oneof(
          { arbitrary: fc.constant(total), weight: 5 },
          { arbitrary: totalArb, weight: 1 },
        ),
        index: fc.integer({ min: 1, max: total }),
        name: nameArb,
        now: timeArb,
      }),
      { maxLength: 30 },
    ),
  }),
);

function run(total: number, steps: ReadonlyArray<{ huntId: string; total: number; index: number; name: string; now: number }>) {
  let state = emptyFoundState({ huntId: HUNT, total });
  const states: FoundState[] = [state];
  for (const s of steps) {
    state = foundReducer(state, clue(s.huntId, s.total, s.index, s.name), s.now);
    states.push(state);
  }
  return states;
}

describe('hunt-found properties', () => {
  // Feature: ghost-hunt, Property 30: Found reducer counts each Spirit once
  // **Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.9, 11.10, 16.8**
  it('Property 30: Found reducer counts each Spirit once', () => {
    fc.assert(
      fc.property(scenarioArb, ({ total, steps }) => {
        let state = emptyFoundState({ huntId: HUNT, total });
        for (const s of steps) {
          const before = state;
          const snapshot = JSON.stringify(before);
          const input = clue(s.huntId, s.total, s.index, s.name);
          state = foundReducer(before, input, s.now);
          expect(JSON.stringify(before)).toBe(snapshot);
          const foreign = s.huntId !== HUNT || s.total !== total;
          const already = before.found.some((e) => e.index === s.index);
          if (foreign || already || before.completedAt !== null) {
            expect(state).toBe(before);
          } else {
            expect(state.found.length).toBe(before.found.length + 1);
            expect(state.found.find((e) => e.index === s.index)?.name).toBe(s.name);
          }
          const idx = state.found.map((e) => e.index);
          expect(idx).toEqual([...new Set(idx)].sort((a, b) => a - b));
          expect(state.huntId).toBe(HUNT);
          expect(state.total).toBe(total);
        }
      }),
      { numRuns: 200 },
    );
  });

  // Feature: ghost-hunt, Property 31: Completion exactly at the total
  // **Validates: Requirements 11.5, 11.6, 11.7, 11.8, 14.1, 16.8**
  it('Property 31: Completion exactly at the total', () => {
    fc.assert(
      fc.property(scenarioArb, ({ total, steps }) => {
        const states = run(total, steps);
        states.forEach((state, i) => {
          expect(state.completedAt !== null).toBe(state.found.length === total);
          expect(state.firstFoundAt === null).toBe(state.found.length === 0);
          if (i > 0 && state !== states[i - 1] && state.found.length === total) {
            expect(state.completedAt).toBe(steps[i - 1]!.now);
          }
          if (i > 0 && states[i - 1]!.completedAt !== null) {
            expect(state).toBe(states[i - 1]);
          }
        });
      }),
      { numRuns: 200 },
    );
  });

  // Feature: ghost-hunt, Property 32: Reducer confluence
  // **Validates: Requirements 11.11, 16.8**
  it('Property 32: Reducer confluence', () => {
    const arb = totalArb.chain((total) =>
      fc.record({
        total: fc.constant(total),
        order: fc.shuffledSubarray(
          Array.from({ length: total }, (_, i) => i + 1),
          { minLength: 0, maxLength: total },
        ),
        names: fc.array(nameArb, { minLength: total, maxLength: total }),
      }),
    );
    fc.assert(
      fc.property(arb, fc.array(fc.nat(), { minLength: 7, maxLength: 7 }), ({ total, order, names }, keys) => {
        const permuted = [...order].sort((a, b) => keys[a - 1]! - keys[b - 1]! || a - b);
        const apply = (seq: readonly number[]) =>
          seq.reduce(
            (st, index) => foundReducer(st, clue(HUNT, total, index, names[index - 1]!), 1000),
            emptyFoundState({ huntId: HUNT, total }),
          );
        const a = apply(order);
        const b = apply(permuted);
        expect(b.found).toEqual(a.found);
        expect(b.completedAt === null).toBe(a.completedAt === null);
        expect(b.firstFoundAt === null).toBe(a.firstFoundAt === null);
      }),
      { numRuns: 200 },
    );
  });

  // Feature: ghost-hunt, Property 33: Time taken and its format
  // **Validates: Requirements 11.12, 11.13, 14.3**
  it('Property 33: Time taken and its format', () => {
    const base = { huntId: HUNT, total: 3, found: [] } as const;
    fc.assert(
      fc.property(timeArb, fc.integer({ min: -100_000, max: 100_000_000 }), (first, delta) => {
        const done = first + delta;
        const state: FoundState = { ...base, firstFoundAt: first, completedAt: done };
        const secs = timeTakenSeconds(state);
        expect(Number.isInteger(secs)).toBe(true);
        expect(secs).toBeGreaterThanOrEqual(0);
        expect(secs).toBe(delta <= 0 ? 0 : Math.floor(delta / 1000));
        const text = formatTimeTaken(secs);
        expect(text).toMatch(/^\d+:\d{2}$/);
        const [m, s] = text.split(':').map(Number) as [number, number];
        expect(s).toBeLessThan(60);
        expect(m * 60 + s).toBe(secs);
      }),
      { numRuns: 200 },
    );
    fc.assert(
      fc.property(fc.constantFrom(null, 5), fc.constantFrom(null, 9), (f, c) => {
        if (f !== null && c !== null) return;
        expect(timeTakenSeconds({ ...base, firstFoundAt: f, completedAt: c })).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: ghost-hunt, Property 35: Spirit counter rows
  // **Validates: Requirements 13.1, 13.2, 13.3, 13.4, 13.10**
  it('Property 35: Spirit counter rows', () => {
    fc.assert(
      fc.property(scenarioArb, ({ total, steps }) => {
        const state = run(total, steps).at(-1)!;
        const rows = counterRows(state);
        expect(rows.length).toBe(total);
        rows.forEach((row, i) => {
          expect(row.index).toBe(i + 1);
          const entry = state.found.find((e) => e.index === row.index);
          expect(row.name).toBe(entry ? entry.name : null);
        });
        const foundNames = new Set(state.found.map((e) => e.name));
        for (const row of rows) {
          if (row.name !== null) expect(foundNames.has(row.name)).toBe(true);
        }
        expect(rows.filter((r) => r.name !== null).length).toBe(state.found.length);
        expect(counterHeading(state)).toBe(`Spirits found: ${state.found.length} of ${total}`);
      }),
      { numRuns: 200 },
    );
  });
});
