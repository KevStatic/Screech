import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { HUNT_ALPHABET, HUNT_ID_LENGTH, buildClue, SIZE_CAP } from '@screech/core';
import {
  HIDE_AT_MAX,
  OPENING_MAX,
  SETUP_ROW_COUNT,
  customCountToOverwrite,
  fillPack,
  initialDraft,
  measureText,
  rowStatus,
  setupReducer,
  setupView,
  type RowField,
  type SetupDraft,
  type SetupRow,
} from '../../src/logic/hunt-setup';
import { RIDDLE_PACKS, type PackId } from '../../src/logic/riddle-packs';
import { airtimeSeconds } from '../../src/logic/airtime';
import { encodeSetupLink } from '../../src/logic/hunt-link';

const NUM_RUNS = 100;
const PACK_IDS: readonly PackId[] = ['office', 'home', 'classroom'];
const FIELDS: readonly RowField[] = ['name', 'hideAt', 'clue'];

const packArb = fc.constantFrom(...PACK_IDS);
const totalArb = fc.integer({ min: 3, max: 7 });

const huntIdArb = fc
  .array(fc.constantFrom(...HUNT_ALPHABET.split('')), {
    minLength: HUNT_ID_LENGTH,
    maxLength: HUNT_ID_LENGTH,
  })
  .map((chars) => chars.join(''));

const specialArb = fc.constantFrom('\n', '\t', '\u001f', '\u007f', ' ', 'é', '\u{1F47B}', '\u00a0');

/** Text with control characters, whitespace and astral characters mixed in. */
const textArb = (maxLength: number) =>
  fc
    .array(fc.oneof({ weight: 5, arbitrary: fc.string({ maxLength: 1 }) }, { weight: 1, arbitrary: specialArb }), {
      maxLength,
    })
    .map((parts) => parts.join(''));

const nameArb = fc.oneof(
  { weight: 4, arbitrary: fc.string({ minLength: 1, maxLength: 20 }) },
  { weight: 1, arbitrary: textArb(40) },
);
const clueArb = fc.oneof(
  { weight: 3, arbitrary: fc.string({ minLength: 1, maxLength: 40 }) },
  { weight: 3, arbitrary: fc.string({ minLength: 80, maxLength: 140 }) },
  { weight: 1, arbitrary: fc.string({ minLength: 120, maxLength: 200 }) },
  { weight: 1, arbitrary: textArb(60) },
);

const marksArb = fc.record({ name: fc.boolean(), hideAt: fc.boolean(), clue: fc.boolean() });

const rowArb: fc.Arbitrary<SetupRow> = fc.record({
  name: nameArb,
  hideAt: textArb(30),
  clue: clueArb,
  custom: marksArb,
});

const draftArb: fc.Arbitrary<SetupDraft> = fc
  .record({
    total: totalArb,
    opening: textArb(50),
    openingCustom: fc.boolean(),
    rows: fc.array(rowArb, { minLength: SETUP_ROW_COUNT, maxLength: SETUP_ROW_COUNT }),
  })
  .map((d) => ({ ...d, appliedPack: null, pendingPack: null, packNote: false }));

const NO_MARKS = { name: false, hideAt: false, clue: false };

/** Draft whose Custom_Text marks are all clear. */
const cleanDraftArb: fc.Arbitrary<SetupDraft> = draftArb.map((d) => ({
  ...d,
  openingCustom: false,
  rows: d.rows.map((r) => ({ ...r, custom: NO_MARKS })),
}));

/** Draft with at least one Custom_Text mark set somewhere (any of the 7 rows or the opening). */
const markedDraftArb: fc.Arbitrary<SetupDraft> = fc
  .tuple(draftArb, fc.integer({ min: -1, max: 6 }), fc.constantFrom(...FIELDS))
  .map(([d, at, field]) => {
    if (at === -1) return { ...d, openingCustom: true };
    return {
      ...d,
      rows: d.rows.map((r, i) => (i === at ? { ...r, custom: { ...r.custom, [field]: true } } : r)),
    };
  });

/** Valid draft built from a pack, so only the field under test can cause problems. */
const packDraftArb = fc
  .tuple(packArb, totalArb)
  .map(([pack, total]) => fillPack(initialDraft(), pack, total));

function expectedMeasure(value: string): number {
  // eslint-disable-next-line no-control-regex
  return Array.from(value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()).length;
}

function withRow(draft: SetupDraft, row: number, patch: Partial<SetupRow>): SetupDraft {
  return { ...draft, rows: draft.rows.map((r, i) => (i === row ? { ...r, ...patch } : r)) };
}

// Feature: ghost-hunt, Property 16: Filling a pack for a total
describe('Property 16: Filling a pack for a total', () => {
  it('writes entries, finale and opening, keeps later rows and clears marks', () => {
    // **Validates: Requirements 3.7, 3.11, 16.15**
    fc.assert(
      fc.property(draftArb, packArb, totalArb, (draft, packId, total) => {
        const pack = RIDDLE_PACKS[packId];
        const out = fillPack(draft, packId, total);
        expect(out.rows).toHaveLength(SETUP_ROW_COUNT);
        expect(out.opening).toBe(pack.opening);
        expect(out.openingCustom).toBe(false);
        for (let i = 0; i < total; i++) {
          const entry = pack.entries[i]!;
          const row = out.rows[i]!;
          expect(row.name).toBe(entry.name);
          expect(row.hideAt).toBe(entry.hideAt);
          expect(row.clue).toBe(i === total - 1 ? pack.finale : entry.clue);
          expect(row.custom).toEqual(NO_MARKS);
          if (i < total - 1) expect(row.clue).not.toBe(pack.finale);
        }
        for (let i = total; i < SETUP_ROW_COUNT; i++) {
          expect(out.rows[i]).toEqual(draft.rows[i]);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// Feature: ghost-hunt, Property 17: Pack choice never destroys typed text without confirmation
describe('Property 17: Pack choice never destroys typed text without confirmation', () => {
  it('fills at once only when nothing typed would be lost, otherwise waits for confirmation', () => {
    // **Validates: Requirements 3.9, 3.10, 3.11, 3.12**
    fc.assert(
      fc.property(fc.oneof(cleanDraftArb, markedDraftArb), packArb, (draft, packId) => {
        let expectedCount = draft.openingCustom ? 1 : 0;
        for (let i = 0; i < draft.total; i++) {
          const m = draft.rows[i]!.custom;
          expectedCount += Number(m.name) + Number(m.hideAt) + Number(m.clue);
        }
        expect(customCountToOverwrite(draft)).toBe(expectedCount);

        const chosen = setupReducer(draft, { type: 'choosePack', pack: packId });
        const filled = fillPack(draft, packId, draft.total);
        if (expectedCount === 0) {
          expect(chosen).toEqual(filled);
          expect(chosen.appliedPack).toBe(packId);
          return;
        }
        expect(chosen.pendingPack).toBe(packId);
        expect(chosen.rows).toEqual(draft.rows);
        expect(chosen.opening).toBe(draft.opening);
        expect(chosen.appliedPack).toBe(draft.appliedPack);

        const cancelled = setupReducer(chosen, { type: 'cancelPack' });
        expect(cancelled.pendingPack).toBeNull();
        expect(cancelled.rows).toEqual(draft.rows);
        expect(cancelled.opening).toBe(draft.opening);
        expect(cancelled.appliedPack).toBe(draft.appliedPack);

        const confirmed = setupReducer(chosen, { type: 'confirmPack' });
        expect(confirmed).toEqual(filled);
        expect(confirmed.appliedPack).toBe(packId);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// Feature: ghost-hunt, Property 18: Total change keeps and restores rows
describe('Property 18: Total change keeps and restores rows', () => {
  it('a, b, a keeps all 7 rows', () => {
    // **Validates: Requirements 3.3, 3.4, 3.9**
    fc.assert(
      fc.property(draftArb, totalArb, totalArb, (draft, a, b) => {
        let d = setupReducer(draft, { type: 'setTotal', total: a });
        d = setupReducer(d, { type: 'setTotal', total: b });
        d = setupReducer(d, { type: 'setTotal', total: a });
        expect(d.total).toBe(a);
        expect(d.rows).toEqual(draft.rows);
        expect(d.opening).toBe(draft.opening);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('edit changes only the named field and sets the mark from the value', () => {
    // **Validates: Requirements 3.3, 3.4, 3.9**
    fc.assert(
      fc.property(
        draftArb,
        fc.integer({ min: 0, max: 6 }),
        fc.constantFrom(...FIELDS),
        fc.oneof(textArb(30), fc.constantFrom('', '   ', '\n')),
        (draft, row, field, value) => {
          const out = setupReducer(draft, { type: 'edit', row, field, value });
          out.rows.forEach((r, i) => {
            if (i !== row) expect(r).toEqual(draft.rows[i]);
          });
          const before = draft.rows[row]!;
          const after = out.rows[row]!;
          expect(after[field]).toBe(value);
          for (const f of FIELDS) {
            if (f !== field) {
              expect(after[f]).toBe(before[f]);
              expect(after.custom[f]).toBe(before.custom[f]);
            }
          }
          expect(after.custom[field]).toBe(value.trim() !== '');
          expect(out.opening).toBe(draft.opening);
          expect(out.total).toBe(draft.total);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

// Feature: ghost-hunt, Property 19: Total change re-applies or leaves the pack
describe('Property 19: Total change re-applies or leaves the pack', () => {
  const withPack = (arb: fc.Arbitrary<SetupDraft>) =>
    fc.tuple(arb, packArb, totalArb).map(([d, pack, newTotal]) => ({ d: { ...d, appliedPack: pack }, pack, newTotal }));

  it('re-applies the pack when no Custom_Text exists', () => {
    // **Validates: Requirements 3.13, 3.14, 16.15**
    fc.assert(
      fc.property(withPack(cleanDraftArb), ({ d, pack, newTotal }) => {
        fc.pre(newTotal !== d.total);
        const out = setupReducer(d, { type: 'setTotal', total: newTotal });
        const expected = fillPack(d, pack, newTotal);
        expect(out.total).toBe(newTotal);
        expect(out.rows).toEqual(expected.rows);
        expect(out.opening).toBe(expected.opening);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('leaves rows and opening and sets packNote when Custom_Text exists', () => {
    // **Validates: Requirements 3.13, 3.14, 16.15**
    fc.assert(
      fc.property(withPack(markedDraftArb), ({ d, newTotal }) => {
        fc.pre(newTotal !== d.total);
        const out = setupReducer(d, { type: 'setTotal', total: newTotal });
        expect(out.total).toBe(newTotal);
        expect(out.rows).toEqual(d.rows);
        expect(out.opening).toBe(d.opening);
        expect(out.packNote).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// Feature: ghost-hunt, Property 20: Hide_At and Opening_Riddle measure and limits
describe('Property 20: Hide_At and Opening_Riddle measure and limits', () => {
  it('measureText counts code points of the sanitised, trimmed text', () => {
    // **Validates: Requirements 3.15, 3.16**
    fc.assert(
      fc.property(fc.oneof(textArb(80), fc.fullUnicodeString({ maxLength: 60 })), (value) => {
        expect(measureText(value)).toBe(expectedMeasure(value));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('blocks and reports a Hide_At over 40, without changing the text', () => {
    // **Validates: Requirements 3.15, 3.16**
    fc.assert(
      fc.property(
        packDraftArb,
        fc.integer({ min: 0, max: 6 }),
        fc.integer({ min: 1, max: 80 }),
        fc.constantFrom('x', '\u{1F47B}', 'é'),
        (base, rowRaw, length, unit) => {
          const row = rowRaw % base.total;
          const hideAt = unit.repeat(length);
          const draft = withRow(base, row, { hideAt, custom: { ...base.rows[row]!.custom, hideAt: true } });
          const snapshot = structuredClone(draft);
          const view = setupView('ABCDEF', draft);
          expect(draft).toEqual(snapshot);
          if (length > HIDE_AT_MAX) {
            expect(view.canMakeLinks).toBe(false);
            expect(view.limitProblems).toEqual([`Spirit ${row + 1}: Hide at is ${length}/${HIDE_AT_MAX} characters`]);
          } else {
            expect(view.canMakeLinks).toBe(true);
            expect(view.limitProblems).toEqual([]);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('blocks and reports an Opening_Riddle over 200, without changing the text', () => {
    // **Validates: Requirements 3.15, 3.16**
    fc.assert(
      fc.property(
        packDraftArb,
        fc.integer({ min: 1, max: 260 }),
        fc.constantFrom('x', '\u{1F47B}'),
        (base, length, unit) => {
          const draft = { ...base, opening: unit.repeat(length), openingCustom: true };
          const snapshot = structuredClone(draft);
          const view = setupView('ABCDEF', draft);
          expect(draft).toEqual(snapshot);
          if (length > OPENING_MAX) {
            expect(view.canMakeLinks).toBe(false);
            expect(view.limitProblems).toEqual([`Opening riddle is ${length}/${OPENING_MAX} characters`]);
          } else {
            expect(view.canMakeLinks).toBe(true);
            expect(view.limitProblems).toEqual([]);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

// Feature: ghost-hunt, Property 21: Hide_At and Opening_Riddle never reach the Packet or the link
describe('Property 21: Hide_At and Opening_Riddle never reach the Packet or the link', () => {
  it('changing only Hide_At or the opening leaves packets, links and labels identical', () => {
    // **Validates: Requirements 3.18, 4.9, 16.15**
    fc.assert(
      fc.property(
        draftArb,
        huntIdArb,
        fc.array(textArb(60), { minLength: SETUP_ROW_COUNT, maxLength: SETUP_ROW_COUNT }),
        textArb(250),
        (a, huntId, hideAts, opening) => {
          const b: SetupDraft = {
            ...a,
            opening,
            rows: a.rows.map((r, i) => ({ ...r, hideAt: hideAts[i]! })),
          };
          for (let i = 0; i < a.total; i++) {
            const fa = { huntId, index: i + 1, total: a.total, name: a.rows[i]!.name, clue: a.rows[i]!.clue };
            const fb = { huntId, index: i + 1, total: b.total, name: b.rows[i]!.name, clue: b.rows[i]!.clue };
            expect(buildClue(fb)).toEqual(buildClue(fa));
            expect(encodeSetupLink('https://example.test/play', fb)).toEqual(
              encodeSetupLink('https://example.test/play', fa),
            );
            expect(rowStatus(huntId, b, i)).toEqual(rowStatus(huntId, a, i));
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

// Feature: ghost-hunt, Property 22: Row status mirrors the builder
describe('Property 22: Row status mirrors the builder', () => {
  it('each status matches a direct buildClue call', () => {
    // **Validates: Requirements 3.19, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.9, 4.10, 4.15, 4.16**
    fc.assert(
      fc.property(draftArb, huntIdArb, (draft, huntId) => {
        for (let i = 0; i < draft.total; i++) {
          const row = draft.rows[i]!;
          const built = buildClue({ huntId, index: i + 1, total: draft.total, name: row.name, clue: row.clue });
          const status = rowStatus(huntId, draft, i);
          if (built.ok) {
            const size = built.value.length;
            expect(size).toBeLessThanOrEqual(SIZE_CAP);
            expect(status.kind).toBe('ok');
            if (status.kind !== 'ok') continue;
            expect(status.size).toBe(size);
            expect(status.label).toBe(`${size}/${SIZE_CAP} bytes \u00b7 about ${airtimeSeconds(size)} s`);
            if (size > 100) {
              expect(status.longNote).not.toBeNull();
              expect(status.longNote).toContain(`about ${airtimeSeconds(size)} s`);
            } else {
              expect(status.longNote).toBeNull();
            }
          } else if (built.error.code === 'too-large') {
            expect(status).toEqual({
              kind: 'too-large',
              length: built.error.length,
              label: `Too heavy to cross over (${built.error.length}/${SIZE_CAP} bytes)`,
            });
          } else {
            expect(status.kind).toBe('invalid');
            if (status.kind !== 'invalid') continue;
            const error = built.error;
            if (error.code === 'invalid-payload') {
              expect(status.field).toBe(error.field);
              if (error.field === 'name' && /bytes$/.test(error.message)) {
                expect(status.label).toMatch(/\d+\/24 bytes/);
              }
            }
          }
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('canMakeLinks and summary follow the row statuses, limits and Hunt_ID', () => {
    // **Validates: Requirements 3.19, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.9, 4.10, 4.15, 4.16**
    fc.assert(
      fc.property(draftArb, fc.option(huntIdArb, { nil: null }), (draft, huntId) => {
        const view = setupView(huntId, draft);
        expect(view.statuses).toHaveLength(draft.total);
        const firstBad = view.statuses.findIndex((s) => s.kind !== 'ok');
        const limitsOk =
          measureText(draft.opening) <= OPENING_MAX &&
          draft.rows.slice(0, draft.total).every((r) => measureText(r.hideAt) <= HIDE_AT_MAX);
        expect(view.canMakeLinks).toBe(huntId !== null && firstBad < 0 && limitsOk);
        if (firstBad >= 0) {
          expect(view.summary).not.toBeNull();
          expect(view.summary!.startsWith(`Spirit ${firstBad + 1}`)).toBe(true);
        } else if (!limitsOk) {
          expect(view.summary).toBe(view.limitProblems[0]);
        } else {
          expect(view.summary).toBeNull();
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
