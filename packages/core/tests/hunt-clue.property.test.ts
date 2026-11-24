import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decode } from '../src/codec.js';
import {
  CLUE_SEPARATOR,
  HUNT_ALPHABET,
  buildClue,
  buildClueText,
  parseClueText,
  sanitizeClueText,
  validateClueFields,
} from '../src/hunt-clue.js';
import type { ClueFields } from '../src/hunt-clue.js';
import { NUM_RUNS } from './helpers.js';

// Feature: ghost-hunt, Properties 1 to 6 (clue builder and parser)

const encoder = new TextEncoder();
const CONTROL_RE = new RegExp('[\\u0000-\\u001f\\u007f]', 'g');
const HAS_CONTROL_RE = new RegExp('[\\u0000-\\u001f\\u007f]');

/** Independent reference for the sanitiser: control characters to one space, then trim. */
function refSanitise(s: string): string {
  return s.replace(CONTROL_RE, ' ').trim();
}

function hasLoneSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const n = s.charCodeAt(i + 1);
      if (n >= 0xdc00 && n <= 0xdfff) i++;
      else return true;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return true;
    }
  }
  return false;
}

const huntIdArb = fc
  .array(fc.constantFrom(...HUNT_ALPHABET.split('')), { minLength: 6, maxLength: 6 })
  .map((a) => a.join(''));
const totalArb = fc.integer({ min: 3, max: 7 });

/** Clean text: printable, no control characters, no surrounding whitespace, non-empty. */
const cleanUnit = fc.oneof(
  { weight: 6, arbitrary: fc.char() },
  { weight: 1, arbitrary: fc.constantFrom('é', 'ü', '日', '本', '😀', '👻', '&', '=', '#', '%') },
);
const cleanText = (maxLength: number): fc.Arbitrary<string> =>
  fc
    .string({ unit: cleanUnit, minLength: 1, maxLength })
    .filter((s) => s.length > 0 && s === s.trim() && !HAS_CONTROL_RE.test(s));

const cleanName = cleanText(10).filter((s) => encoder.encode(s).length <= 24);
const cleanClue = cleanText(40);

const validFieldsArb: fc.Arbitrary<ClueFields> = fc
  .tuple(huntIdArb, totalArb, cleanName, cleanClue)
  .chain(([huntId, total, name, clue]) =>
    fc.integer({ min: 1, max: total }).map((index) => ({ huntId, index, total, name, clue })),
  );

/** Arbitrary text, including control characters, whitespace and lone surrogates. */
const wildText = fc.oneof(
  fc.string({ unit: 'binary', maxLength: 40 }),
  fc.string({ maxLength: 40 }),
  fc
    .array(fc.oneof(fc.char(), fc.integer({ min: 0, max: 31 }).map((c) => String.fromCharCode(c)), fc.constantFrom('\u007f', ' ', '\ud800', '\udc00', '😀')), {
      maxLength: 40,
    })
    .map((a) => a.join('')),
);

describe('hunt-clue properties', () => {
  it('Feature: ghost-hunt, Property 1: Clue round trip', () => {
    // **Validates: Requirements 1.2, 1.3, 1.5, 16.1**
    let fitted = 0;
    fc.assert(
      fc.property(validFieldsArb, (f) => {
        const built = buildClue(f);
        // Names up to 24 bytes and clues up to 40 chars can still pass 140 bytes only for long emoji; skip those.
        if (!built.ok) {
          expect(built.error.code).toBe('too-large');
          return;
        }
        fitted++;
        const decoded = decode(built.value);
        expect(decoded.ok).toBe(true);
        if (!decoded.ok) return;
        expect(decoded.value.multipart).toBe(false);
        if (decoded.value.multipart) return;
        expect(decoded.value.type).toBe('hunt-clue');
        const payload = decoded.value.payload;
        expect(payload.type).toBe('hunt-clue');
        if (payload.type !== 'hunt-clue') return;
        const parsed = parseClueText(payload.text);
        const validated = validateClueFields(f);
        expect(parsed.ok).toBe(true);
        expect(validated.ok).toBe(true);
        if (!parsed.ok || !validated.ok) return;
        expect(parsed.value).toEqual(validated.value);
        expect(parsed.value).toEqual(f);
      }),
      { numRuns: NUM_RUNS },
    );
    expect(fitted).toBeGreaterThan(0);
  });

  it('Feature: ghost-hunt, Property 2: Builder is total and bounded', () => {
    // **Validates: Requirements 1.1, 1.2, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 16.2**
    const wildRecord = fc.record({
      huntId: fc.oneof(huntIdArb, fc.anything()),
      index: fc.oneof(fc.integer({ min: 1, max: 7 }), fc.anything()),
      total: fc.oneof(totalArb, fc.anything()),
      name: fc.oneof(wildText, fc.anything()),
      clue: fc.oneof(wildText, fc.anything()),
    });
    const semiValid = fc
      .tuple(huntIdArb, totalArb, wildText, fc.string({ unit: 'binary', maxLength: 200 }))
      .chain(([huntId, total, name, clue]) =>
        fc.integer({ min: 1, max: total }).map((index) => ({ huntId, index, total, name, clue })),
      );
    fc.assert(
      fc.property(fc.oneof(fc.anything(), wildRecord, semiValid), (input) => {
        // buildClue takes ClueFieldsInput; the property feeds it arbitrary values on purpose.
        const result = buildClue(input as Parameters<typeof buildClue>[0]);
        if (result.ok) {
          expect(result.value).toBeInstanceOf(Uint8Array);
          expect(result.value.length).toBeGreaterThanOrEqual(1);
          expect(result.value.length).toBeLessThanOrEqual(140);
          const f = input as ClueFields;
          expect(result.value.length).toBe(
            12 + encoder.encode(refSanitise(f.name)).length + encoder.encode(refSanitise(f.clue)).length,
          );
        } else {
          expect(typeof result.error.code).toBe('string');
        }
      }),
      { numRuns: NUM_RUNS },
    );

    // Length rule on inputs whose other fields are valid: exact length, or too-large with that length.
    let tooLarge = 0;
    let built = 0;
    const sized = fc
      .tuple(
        huntIdArb,
        totalArb,
        fc.oneof(wildText, cleanName),
        fc.oneof(
          fc.string({ unit: fc.oneof(cleanUnit, fc.constantFrom('\u0001', ' ')), maxLength: 160 }),
          fc.string({ unit: cleanUnit, minLength: 100, maxLength: 160 }),
        ),
      )
      .chain(([huntId, total, name, clue]) =>
        fc.integer({ min: 1, max: total }).map((index) => ({ huntId, index, total, name, clue })),
      );
    fc.assert(
      fc.property(sized, (f) => {
        const name = refSanitise(f.name);
        const clue = refSanitise(f.clue);
        const fieldsValid =
          name.length > 0 &&
          clue.length > 0 &&
          !hasLoneSurrogate(name) &&
          !hasLoneSurrogate(clue) &&
          encoder.encode(name).length <= 24;
        const result = buildClue(f);
        if (!fieldsValid) {
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.error.code).toBe('invalid-payload');
          return;
        }
        const length = 12 + encoder.encode(name).length + encoder.encode(clue).length;
        if (length > 140) {
          tooLarge++;
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.error.code).toBe('too-large');
            if (result.error.code === 'too-large') expect(result.error.length).toBe(length);
          }
        } else {
          built++;
          expect(result.ok).toBe(true);
          if (result.ok) expect(result.value.length).toBe(length);
        }
      }),
      { numRuns: 300 },
    );
    expect(tooLarge).toBeGreaterThan(0);
    expect(built).toBeGreaterThan(0);
  });

  it('Feature: ghost-hunt, Property 3: Control characters never survive', () => {
    // **Validates: Requirements 1.4, 1.5**
    fc.assert(
      fc.property(wildText, (s) => {
        const out = sanitizeClueText(s);
        expect(out).toBe(refSanitise(s));
        expect(HAS_CONTROL_RE.test(out)).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );

    const dirtyUnit = fc.oneof(
      cleanUnit,
      fc.integer({ min: 0, max: 31 }).map((c) => String.fromCharCode(c)),
      fc.constantFrom('\u007f', ' '),
    );
    const dirty = (maxLength: number): fc.Arbitrary<string> =>
      fc.string({ unit: dirtyUnit, maxLength }).filter((s) => refSanitise(s).length > 0);
    const dirtyName = dirty(8).filter((s) => encoder.encode(refSanitise(s)).length <= 24);
    fc.assert(
      fc.property(huntIdArb, totalArb, dirtyName, dirty(30), (huntId, total, name, clue) => {
        const built = buildClue({ huntId, index: 1, total, name, clue });
        if (!built.ok) {
          expect(built.error.code).toBe('too-large');
          return;
        }
        const decoded = decode(built.value);
        expect(decoded.ok).toBe(true);
        if (!decoded.ok || decoded.value.multipart || decoded.value.payload.type !== 'hunt-clue') return;
        const parsed = parseClueText(decoded.value.payload.text);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.value.name).toBe(refSanitise(name));
        expect(parsed.value.clue).toBe(refSanitise(clue));
        expect(HAS_CONTROL_RE.test(parsed.value.name)).toBe(false);
        expect(HAS_CONTROL_RE.test(parsed.value.clue)).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('Feature: ghost-hunt, Property 4: First failing field is reported', () => {
    // **Validates: Requirements 1.12**
    type Field = 'huntId' | 'total' | 'index' | 'name' | 'clue';
    const badHuntId = fc.oneof(
      fc.constantFrom('', 'ABC', 'ABCDEFG', 'AB0DEF', 'ABIDEF', 'abcdef', 'ABCDEO'),
      fc.anything(),
    );
    const maybe = <T>(valid: fc.Arbitrary<T>, bad: fc.Arbitrary<unknown>): fc.Arbitrary<unknown> =>
      fc.oneof(valid, bad);
    const badTotal = fc.oneof(fc.constantFrom(0, 1, 2, 8, 3.5, -4, NaN, '5'), fc.anything());
    const badIndex = fc.oneof(fc.constantFrom(0, -1, 8, 100, 1.5, NaN, '2'), fc.anything());
    const badText = fc.oneof(
      fc.constantFrom('', '   ', '\u0001\u0002', 'x'.repeat(25), '\ud800'),
      fc.anything(),
    );

    function oracle(f: Record<Field, unknown>): Field | null {
      const validId =
        typeof f.huntId === 'string' &&
        f.huntId.length === 6 &&
        [...f.huntId].every((c) => HUNT_ALPHABET.includes(c));
      if (!validId) return 'huntId';
      const total = f.total;
      if (typeof total !== 'number' || !Number.isInteger(total) || total < 3 || total > 7) return 'total';
      const index = f.index;
      if (typeof index !== 'number' || !Number.isInteger(index) || index < 1 || index > total) return 'index';
      if (typeof f.name !== 'string') return 'name';
      const n = refSanitise(f.name);
      if (n.length === 0 || hasLoneSurrogate(n) || encoder.encode(n).length > 24) return 'name';
      if (typeof f.clue !== 'string') return 'clue';
      const c = refSanitise(f.clue);
      if (c.length === 0 || hasLoneSurrogate(c)) return 'clue';
      return null;
    }

    const arb = fc.record({
      huntId: maybe(huntIdArb, badHuntId),
      total: maybe(totalArb, badTotal),
      index: maybe(fc.integer({ min: 1, max: 7 }), badIndex),
      name: maybe(cleanName, badText),
      clue: maybe(cleanClue, badText),
    });
    const seen = new Set<string>();
    fc.assert(
      fc.property(arb, (f) => {
        const expected = oracle(f);
        const input = f as unknown as Parameters<typeof buildClue>[0];
        const validated = validateClueFields(input);
        const built = buildClue(input);
        if (expected === null) {
          expect(validated.ok).toBe(true);
          seen.add('valid');
          if (!built.ok) expect(built.error.code).toBe('too-large');
          return;
        }
        seen.add(expected);
        expect(validated.ok).toBe(false);
        expect(built.ok).toBe(false);
        for (const r of [validated, built]) {
          if (!r.ok) {
            expect(r.error.code).toBe('invalid-payload');
            if (r.error.code === 'invalid-payload') expect(r.error.field).toBe(expected);
          }
        }
      }),
      { numRuns: 500 },
    );
    expect(seen.has('huntId') && seen.has('total') && seen.has('index') && seen.has('name') && seen.has('clue')).toBe(true);

    // too-large only when all five fields are valid
    const big = fc.record({
      huntId: huntIdArb,
      total: totalArb,
      index: fc.constant(1),
      name: fc.constant('N'.repeat(24)),
      clue: fc.string({ minLength: 120, maxLength: 200 }).filter((s) => refSanitise(s).length >= 110),
    });
    fc.assert(
      fc.property(big, (f) => {
        const r = buildClue(f);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.code).toBe('too-large');
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('Feature: ghost-hunt, Property 5: Builder is deterministic', () => {
    // **Validates: Requirements 1.16, 8.12, 16.4**
    const arb = fc.oneof(
      validFieldsArb,
      fc.anything(),
      fc.record({ huntId: huntIdArb, index: fc.constant(1), total: totalArb, name: wildText, clue: wildText }),
    );
    fc.assert(
      fc.property(arb, (input) => {
        const i = input as Parameters<typeof buildClue>[0];
        const a = buildClue(i);
        const b = buildClue(i);
        expect(b).toEqual(a);
        if (a.ok && b.ok) expect(Array.from(a.value)).toEqual(Array.from(b.value));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('Feature: ghost-hunt, Property 6: Parser is total and strict', () => {
    // **Validates: Requirements 1.13, 1.14, 16.3**
    // Total: any value of any type.
    fc.assert(
      fc.property(fc.oneof(fc.anything(), wildText), (v) => {
        const r = parseClueText(v);
        if (r.ok) {
          expect(buildClueText(r.value)).toBe(v);
        } else {
          expect(r.error.code).toBe('invalid-body');
        }
      }),
      { numRuns: NUM_RUNS },
    );

    // Mutations of valid text: whatever is accepted must rebuild to the same text.
    const mutated = fc
      .tuple(validFieldsArb, fc.nat(80), wildText)
      .map(([f, pos, junk]) => {
        const t = buildClueText(f);
        const p = pos % (t.length + 1);
        return t.slice(0, p) + junk.slice(0, 3) + t.slice(p + (junk.length % 2));
      });
    let accepted = 0;
    fc.assert(
      fc.property(fc.oneof(mutated, validFieldsArb.map(buildClueText)), (text) => {
        const r = parseClueText(text);
        if (r.ok) {
          accepted++;
          expect(buildClueText(r.value)).toBe(text);
        } else {
          expect(r.error.code).toBe('invalid-body');
        }
      }),
      { numRuns: 300 },
    );
    expect(accepted).toBeGreaterThan(0);

    // Strict: a name or clue not in sanitised form is rejected.
    const dirtyAffix = fc.constantFrom(' ', '\t', '\n', '\u0001', '\u007f', ' \u0000');
    fc.assert(
      fc.property(validFieldsArb, dirtyAffix, fc.constantFrom('prefix', 'suffix', 'name-prefix', 'name-suffix'), (f, d, where) => {
        const name = where === 'name-prefix' ? d + f.name : where === 'name-suffix' ? f.name + d : f.name;
        const clue = where === 'prefix' ? d + f.clue : where === 'suffix' ? f.clue + d : f.clue;
        const text = `${f.huntId}${f.index}${f.total}${name}${CLUE_SEPARATOR}${clue}`;
        const r = parseClueText(text);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.code).toBe('invalid-body');
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
