import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { HUNT_ALPHABET, HUNT_ID_LENGTH, sanitizeClueText } from '@screech/core';
import { buildPrintModel } from '../../src/logic/qr-cards';
import { decodeSetupFragment, encodeSetupLink } from '../../src/logic/hunt-link';
import { initialDraft, setupView, type SetupDraft, type SetupRow } from '../../src/logic/hunt-setup';

const NUM_RUNS = 100;
const BASE = 'https://screech.example/app';

const huntIdArb = fc
  .array(fc.constantFrom(...HUNT_ALPHABET.split('')), {
    minLength: HUNT_ID_LENGTH,
    maxLength: HUNT_ID_LENGTH,
  })
  .map((chars) => chars.join(''));

const specialArb = fc.constantFrom('\n', '\t', '\u001f', '\u007f', ' ', 'é', '\u{1F47B}');

/** Short text with control characters and padding mixed in, may sanitise to empty. */
const textArb = (maxLength: number) =>
  fc
    .array(fc.oneof({ weight: 4, arbitrary: fc.string({ maxLength: 1 }) }, { weight: 1, arbitrary: specialArb }), {
      maxLength,
    })
    .map((parts) => parts.join(''));

/** Rows whose name and clue are never empty once sanitised. */
const rowArb: fc.Arbitrary<SetupRow> = fc
  .record({
    // At most 2 padding parts of up to 4 bytes on each side plus 8 letters: 24 bytes, the name limit.
    name: fc.tuple(fc.stringMatching(/^[a-z]{1,8}$/), textArb(2)).map(([a, b]) => `${b}${a}${b}`),
    hideAt: textArb(15),
    clue: fc.tuple(fc.stringMatching(/^[a-z]{1,8}$/), textArb(8)).map(([a, b]) => `${b}${a}${b}`),
  })
  .map((r) => ({ ...r, custom: { name: true, hideAt: true, clue: true } }));

const draftArb: fc.Arbitrary<SetupDraft> = fc
  .record({
    total: fc.integer({ min: 3, max: 7 }),
    opening: textArb(30),
    rows: fc.array(rowArb, { minLength: 7, maxLength: 7 }),
  })
  .map(({ total, opening, rows }) => ({ ...initialDraft(), total, opening, rows }));

describe('buildPrintModel', () => {
  // Feature: ghost-hunt, Property 23: QR cards and print model
  // **Validates: Requirements 3.21, 6.5, 6.12, 6.13, 6.16**
  it('Feature: ghost-hunt, Property 23: QR cards and print model', () => {
    fc.assert(
      fc.property(huntIdArb, draftArb, (huntId, draft) => {
        const model = buildPrintModel(huntId, draft, BASE);
        expect(model).not.toBeNull();
        if (model === null) return;

        expect(model.cards).toHaveLength(draft.total);
        const opening = sanitizeClueText(draft.opening);
        expect(model.opening).toBe(opening === '' ? null : opening);

        model.cards.forEach((card, i) => {
          const row = draft.rows[i] as SetupRow;
          const index = i + 1;
          const name = sanitizeClueText(row.name);
          const hideAt = sanitizeClueText(row.hideAt);
          expect(card.index).toBe(index);
          expect(card.total).toBe(draft.total);
          expect(card.title).toBe(`Spirit ${index} of ${draft.total}`);
          expect(card.name).toBe(name);
          expect(card.huntId).toBe(huntId);
          expect(card.hideAtLine).toBe(hideAt === '' ? null : `Hide at: ${hideAt}`);

          const encoded = encodeSetupLink(BASE, {
            huntId,
            index,
            total: draft.total,
            name: row.name,
            clue: row.clue,
          });
          expect(encoded.ok).toBe(true);
          if (encoded.ok) expect(card.link).toBe(encoded.link);

          // The link carries the same sanitised name the card shows.
          const decoded = decodeSetupFragment(card.link.slice(card.link.indexOf('#')));
          expect(decoded.kind).toBe('fields');
          if (decoded.kind === 'fields') {
            expect(decoded.fields.name).toBe(card.name);
            expect(decoded.fields.index).toBe(index);
            expect(decoded.fields.huntId).toBe(huntId);
          }
        });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: ghost-hunt, Property 23: QR cards and print model
  // **Validates: Requirements 3.21, 6.5, 6.12, 6.13, 6.16**
  it('returns null exactly when setupView cannot make links', () => {
    const maybeBlankRow = fc.oneof(rowArb, rowArb.map((r) => ({ ...r, clue: ' \n ' })));
    const mixedDraft = fc
      .record({
        total: fc.integer({ min: 3, max: 7 }),
        rows: fc.array(maybeBlankRow, { minLength: 7, maxLength: 7 }),
      })
      .map(({ total, rows }) => ({ ...initialDraft(), total, rows }));
    fc.assert(
      fc.property(huntIdArb, mixedDraft, (huntId, draft) => {
        const can = setupView(huntId, draft).canMakeLinks;
        expect(buildPrintModel(huntId, draft, BASE) === null).toBe(!can);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('gives no Hide at line when Hide_At is empty or only whitespace', () => {
    const draft: SetupDraft = {
      ...initialDraft(),
      rows: initialDraft().rows.map((r) => ({ ...r, name: 'Boo', clue: 'Look up', hideAt: ' \t ' })),
    };
    const model = buildPrintModel('ABCDEFGH'.slice(0, HUNT_ID_LENGTH), draft, BASE);
    expect(model?.cards.every((c) => c.hideAtLine === null)).toBe(true);
  });

  it('gives opening null when the Opening_Riddle is empty', () => {
    const draft: SetupDraft = {
      ...initialDraft(),
      opening: ' \n ',
      rows: initialDraft().rows.map((r) => ({ ...r, name: 'Boo', clue: 'Look up', hideAt: 'Desk' })),
    };
    const model = buildPrintModel(HUNT_ALPHABET.slice(0, HUNT_ID_LENGTH), draft, BASE);
    expect(model).not.toBeNull();
    expect(model?.opening).toBeNull();
    expect(model?.cards[0]?.hideAtLine).toBe('Hide at: Desk');
    expect(model?.cards[0]?.alt).toBe('Spirit 1 of 5, Boo');
  });

  it('returns null for a blocked draft (empty name)', () => {
    expect(buildPrintModel(HUNT_ALPHABET.slice(0, HUNT_ID_LENGTH), initialDraft(), BASE)).toBeNull();
  });

  it('returns null for a bad base URL', () => {
    const draft: SetupDraft = {
      ...initialDraft(),
      rows: initialDraft().rows.map((r) => ({ ...r, name: 'Boo', clue: 'Look up' })),
    };
    expect(buildPrintModel(HUNT_ALPHABET.slice(0, HUNT_ID_LENGTH), draft, 'not a url')).toBeNull();
  });
});
