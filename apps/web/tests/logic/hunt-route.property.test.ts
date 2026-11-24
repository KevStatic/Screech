import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  HUNT_ALPHABET,
  HUNT_ID_LENGTH,
  SPIRIT_TOTAL_MAX,
  SPIRIT_TOTAL_MIN,
  buildClueText,
  parseClueText,
} from '@screech/core';
import type { ClueFields, DecodedPacket, PacketType, Result } from '@screech/core';
import { emptyFoundState, foundReducer } from '../../src/logic/hunt-found';
import type { FoundState } from '../../src/logic/hunt-found';
import {
  PROGRESS_KEY_PREFIX,
  createProgressStore,
  parseFoundState,
  serializeFoundState,
} from '../../src/logic/hunt-progress';
import type { StorageLike } from '../../src/logic/hunt-progress';
import { huntIntake, huntRoute } from '../../src/logic/hunt-route';
import { decodedResult } from './arbitraries';

const huntIdArb = fc
  .array(fc.constantFrom(...HUNT_ALPHABET.split('')), { minLength: HUNT_ID_LENGTH, maxLength: HUNT_ID_LENGTH })
  .map((chars) => chars.join(''));

const nameArb = fc
  .array(fc.constantFrom(...'abcXYZ019 éñ-'.split('')), { minLength: 1, maxLength: 6 })
  .map((chars) => chars.join(''))
  .filter((s) => s.trim() === s && !s.includes('  '));

const clueArb = nameArb;

const fieldsArb: fc.Arbitrary<ClueFields> = fc
  .tuple(huntIdArb, fc.integer({ min: SPIRIT_TOTAL_MIN, max: SPIRIT_TOTAL_MAX }))
  .chain(([huntId, total]) =>
    fc.record({
      huntId: fc.constant(huntId),
      total: fc.constant(total),
      index: fc.integer({ min: 1, max: total }),
      name: nameArb,
      clue: clueArb,
    }),
  );

const flags = { sealed: false, compressed: false, multipart: false };

function hunt(text: string, multipart = false): Result<DecodedPacket> {
  if (multipart) {
    return {
      ok: true,
      value: { multipart: true, type: 'hunt-clue', flags: { ...flags, multipart: true }, body: new Uint8Array(3) },
    };
  }
  return { ok: true, value: { multipart: false, type: 'hunt-clue', flags, payload: { type: 'hunt-clue', text } } };
}

const garbledText = fc.oneof(
  fc.string({ maxLength: 30 }),
  fieldsArb.map((f) => buildClueText(f).replace('\u001f', '')),
);

const routeInput: fc.Arbitrary<Result<DecodedPacket>> = fc.oneof(
  decodedResult,
  fieldsArb.map((f) => hunt(buildClueText(f))),
  garbledText.map((t) => hunt(t)),
  fc.constant(hunt('', true)),
  fc.constantFrom<unknown>(null, undefined, 3, 'x', {}, { ok: true }, { ok: true, value: null }, []).map(
    (v) => v as Result<DecodedPacket>,
  ),
);

function spyingStorage() {
  const data = new Map<string, string>();
  const writes = { count: 0 };
  const storage: StorageLike = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      writes.count += 1;
      data.set(k, v);
    },
    removeItem: (k) => {
      writes.count += 1;
      data.delete(k);
    },
  };
  return { data, writes, storage };
}

describe('hunt-route properties', () => {
  // Feature: ghost-hunt, Property 27: Hunt packet routing
  // **Validates: Requirements 10.1, 10.2, 10.3, 10.7**
  it('Property 27: Hunt packet routing', () => {
    fc.assert(
      fc.property(routeInput, (input) => {
        const route = huntRoute(input);
        const r = input as { ok?: boolean; value?: { multipart?: boolean; type?: PacketType; payload?: { text?: string } } };
        const isHunt =
          typeof input === 'object' &&
          input !== null &&
          r.ok === true &&
          r.value?.multipart === false &&
          r.value.type === 'hunt-clue';
        if (!isHunt) {
          expect(route).toEqual({ kind: 'none' });
          return;
        }
        const parsed = parseClueText(r.value?.payload?.text);
        if (parsed.ok) expect(route).toEqual({ kind: 'clue', fields: parsed.value });
        else expect(route).toEqual({ kind: 'garbled' });
      }),
      { numRuns: 300 },
    );
  });

  // Feature: ghost-hunt, Property 27: Hunt packet routing
  // **Validates: Requirements 10.1, 10.2, 10.3, 10.7**
  it('Property 27: valid built clue text routes to clue with the same fields', () => {
    fc.assert(
      fc.property(fieldsArb, (f) => {
        expect(huntRoute(hunt(buildClueText(f)))).toEqual({ kind: 'clue', fields: f });
      }),
      { numRuns: 200 },
    );
  });

  // Saved state variants: none, valid partial, complete, invalid text, other hunt, other total.
  type Saved =
    | { kind: 'none' }
    | { kind: 'invalid'; text: string }
    | { kind: 'state'; state: FoundState };

  const savedArb = (f: ClueFields): fc.Arbitrary<Saved> =>
    fc.oneof(
      fc.constant<Saved>({ kind: 'none' }),
      fc
        .constantFrom('', 'nope', '{}', '{"v":1}', '[1,2]', '{"v":2,"huntId":"x"}')
        .map((text): Saved => ({ kind: 'invalid', text })),
      fc
        .tuple(
          fc.shuffledSubarray(
            Array.from({ length: f.total }, (_, i) => i + 1),
            { minLength: 0, maxLength: f.total },
          ),
          fc.array(nameArb, { minLength: f.total, maxLength: f.total }),
          fc.integer({ min: 0, max: 1_000_000 }),
          fc.integer({ min: 0, max: 1_000 }),
          fc.boolean(),
        )
        .map(([picked, names, first, span, otherTotal]): Saved => {
          const total = otherTotal && f.total < SPIRIT_TOTAL_MAX ? f.total + 1 : f.total;
          const idx = [...picked].filter((i) => i <= total).sort((a, b) => a - b);
          const found = idx.map((index) => ({ index, name: names[index - 1] ?? 'zz' }));
          return {
            kind: 'state',
            state: {
              huntId: f.huntId,
              total,
              found,
              firstFoundAt: found.length === 0 ? null : first,
              completedAt: found.length === total ? first + span : null,
            },
          };
        }),
    );

  // Feature: ghost-hunt, Property 28: Hunt_Intake classification
  // **Validates: Requirements 10.4, 10.5, 10.8, 10.14, 12.1, 12.2, 14.9, 14.10, 16.16**
  it('Property 28: Hunt_Intake classification', () => {
    fc.assert(
      fc.property(
        fieldsArb.chain((f) => fc.tuple(fc.constant(f), savedArb(f), fc.integer({ min: 0, max: 2_000_000 }))),
        ([f, saved, now]) => {
          const { data, writes, storage } = spyingStorage();
          const key = `${PROGRESS_KEY_PREFIX}${f.huntId}`;
          if (saved.kind === 'invalid') data.set(key, saved.text);
          if (saved.kind === 'state') data.set(key, serializeFoundState(saved.state));
          const snapshot = new Map(data);

          const parsed = parseFoundState(data.get(key) ?? '', f.huntId);
          const loaded = parsed !== null && parsed.total === f.total ? parsed : null;
          const before = loaded ?? emptyFoundState(f);

          const store = createProgressStore(storage);
          const out = huntIntake(store, f, now);

          if (before.completedAt !== null) {
            expect(out.kind).toBe('complete');
            expect(data).toEqual(snapshot);
            expect(writes.count).toBe(0);
          } else if (before.found.some((e) => e.index === f.index)) {
            expect(out.kind).toBe('already');
            if (out.kind === 'already') {
              expect(out.storedName).toBe(before.found.find((e) => e.index === f.index)?.name);
            }
            expect(data).toEqual(snapshot);
            expect(writes.count).toBe(0);
          } else {
            expect(out.kind).toBe('new');
            const expected = foundReducer(before, f, now);
            if (out.kind === 'new') {
              expect(out.state).toEqual(expected);
              expect(out.before).toEqual(before);
              expect(out.persisted).toBe(true);
              expect(parseFoundState(data.get(key) ?? '', f.huntId)).toEqual(out.state);
            }
            expect(writes.count).toBe(1);
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});
