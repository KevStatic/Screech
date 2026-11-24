import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { HUNT_ALPHABET, buildClue, validateClueFields } from '@screech/core';
import type { ClueFields, ClueFieldsInput } from '@screech/core';
import {
  decodeSetupFragment,
  encodeSetupLink,
  MAX_FRAGMENT_LENGTH,
} from '../../src/logic/hunt-link';

const huntIdArb = fc
  .array(fc.constantFrom(...HUNT_ALPHABET.split('')), { minLength: 6, maxLength: 6 })
  .map((a) => a.join(''));

const codePointArb = fc
  .oneof(
    fc.integer({ min: 0, max: 0xd7ff }),
    fc.integer({ min: 0xe000, max: 0x10ffff }),
    fc.constantFrom(0x26, 0x3d, 0x23, 0x25, 0x2b, 0x20, 0x21, 0x27, 0x28, 0x29, 0x2a, 0xe9, 0x4e2d, 0x1f47b),
    fc.integer({ min: 0x20, max: 0x7e }),
  )
  .map((cp) => String.fromCodePoint(cp));

const textArb = fc.array(codePointArb, { maxLength: 30 }).map((a) => a.join(''));

const validFieldsArb: fc.Arbitrary<ClueFields> = fc
  .record({
    huntId: huntIdArb,
    total: fc.integer({ min: 3, max: 7 }),
    indexSeed: fc.integer({ min: 0, max: 6 }),
    name: textArb,
    clue: textArb,
  })
  .map(({ indexSeed, total, ...rest }) => ({ ...rest, total, index: (indexSeed % total) + 1 }))
  .map((f) => validateClueFields(f))
  .filter((r) => r.ok)
  .map((r) => (r.ok ? r.value : (undefined as never)));

const fittingFieldsArb = validFieldsArb.filter((f) => buildClue(f).ok);

const baseArb = fc
  .record({
    scheme: fc.constantFrom('http', 'https'),
    host: fc.constantFrom('example.com', 'localhost:5173', 'a.b.co'),
    path: fc.constantFrom('', '/', '/play', '/a/b/'),
    query: fc.constantFrom('', '?x=1', '?hunt=zz&clue=1'),
    fragment: fc.constantFrom('', '#', '#old=1', '#hunt=ABC'),
  })
  .map((b) => ({
    base: `${b.scheme}://${b.host}${b.path}${b.query}`,
    full: `${b.scheme}://${b.host}${b.path}${b.query}${b.fragment}`,
  }));

function paramsOf(link: string): string {
  return link.slice(link.indexOf('#') + 1);
}

// Feature: ghost-hunt, Property 8: Setup link shape and escaping
describe('Property 8: Setup link shape and escaping', () => {
  it('builds base#hunt&spirit&total&name&clue with escaped values', () => {
    // **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
    fc.assert(
      fc.property(validFieldsArb, baseArb, (f, b) => {
        const r = encodeSetupLink(b.full, f);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const hashAt = r.link.indexOf('#');
        expect(r.link.slice(0, hashAt)).toBe(b.base);
        const m = /^hunt=([^&]*)&spirit=([^&]*)&total=([^&]*)&name=([^&]*)&clue=([^&]*)$/.exec(
          paramsOf(r.link),
        );
        expect(m).not.toBeNull();
        if (!m) return;
        expect(m[1]).toBe(f.huntId);
        expect(m[2]).toBe(String(f.index));
        expect(m[3]).toBe(String(f.total));
        expect(m[4]).toMatch(/^(?:[A-Za-z0-9\-._~]|%[0-9A-F]{2})*$/);
        expect(m[5]).toMatch(/^(?:[A-Za-z0-9\-._~]|%[0-9A-F]{2})*$/);
      }),
      { numRuns: 200 },
    );
  });

  it('returns the validator error for fields it rejects', () => {
    // **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
    const badArb = fc.record({
      huntId: fc.oneof(huntIdArb, fc.string({ maxLength: 8 }), fc.constant(undefined)),
      index: fc.oneof(fc.integer({ min: -2, max: 9 }), fc.constant('1'), fc.constant(1.5)),
      total: fc.oneof(fc.integer({ min: 0, max: 9 }), fc.constant(null)),
      name: fc.oneof(textArb, fc.constant(5)),
      clue: fc.oneof(textArb, fc.constant({})),
    });
    fc.assert(
      fc.property(badArb, baseArb, (input, b) => {
        const v = validateClueFields(input as ClueFieldsInput);
        fc.pre(!v.ok);
        const r = encodeSetupLink(b.base, input as ClueFieldsInput);
        expect(r.ok).toBe(false);
        if (!r.ok && !v.ok) expect(r.error).toEqual(v.error);
      }),
      { numRuns: 200 },
    );
  });
});

function shuffleParams(params: readonly string[], order: readonly number[]): string[] {
  return order
    .map((n, i) => [n, i] as const)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .map(([, i]) => params[i] as string);
}

// Feature: ghost-hunt, Property 9: Setup link round trip
describe('Property 9: Setup link round trip', () => {
  it('decodes any parameter order, with or without a leading #', () => {
    // **Validates: Requirements 5.5, 5.6, 16.6**
    fc.assert(
      fc.property(
        fittingFieldsArb,
        baseArb,
        fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 5, maxLength: 5 }),
        fc.boolean(),
        (f, b, order, withHash) => {
          const r = encodeSetupLink(b.full, f);
          expect(r.ok).toBe(true);
          if (!r.ok) return;
          const params = paramsOf(r.link).split('&');
          const text = shuffleParams(params, order).join('&');
          const expected = validateClueFields(f);
          expect(expected.ok).toBe(true);
          if (!expected.ok) return;
          const got = decodeSetupFragment(withHash ? `#${text}` : text);
          expect(got).toEqual({ kind: 'fields', fields: expected.value });
        },
      ),
      { numRuns: 200 },
    );
  });
});

function mutate(frag: string, kind: number, junk: string): string {
  const parts = frag.split('&');
  switch (kind) {
    case 0:
      return parts.slice(1).join('&');
    case 1:
      return [...parts, parts[0] as string].join('&');
    case 2:
      return frag.replace(/name=[^&]*/, 'name=%E0%A4%A');
    case 3:
      return `${frag}&x=${'a'.repeat(MAX_FRAGMENT_LENGTH)}`;
    case 4:
      return frag + junk;
    default:
      return junk + frag;
  }
}

// Feature: ghost-hunt, Property 10: Fragment decoding is total, deterministic and consistent
describe('Property 10: Fragment decoding is total, deterministic and consistent', () => {
  function check(text: string): void {
    const a = decodeSetupFragment(text);
    const b = decodeSetupFragment(text);
    expect(a).toEqual(b);
    expect(['none', 'fields', 'error']).toContain(a.kind);
    if (a.kind === 'fields') {
      const v = validateClueFields(a.fields);
      expect(v.ok).toBe(true);
      if (v.ok) expect(v.value).toEqual(a.fields);
    }
  }

  it('never throws and is consistent for arbitrary strings', () => {
    // **Validates: Requirements 5.7, 5.8, 5.9, 5.10, 5.11, 5.12, 5.13, 5.14, 16.7**
    fc.assert(fc.property(fc.string({ unit: 'binary', maxLength: 200 }), check), { numRuns: 300 });
  });

  it('returns none when none of the five keys is present', () => {
    // **Validates: Requirements 5.7, 5.8, 5.9, 5.10, 5.11, 5.12, 5.13, 5.14, 16.7**
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('a', 'b=1', 'Hunt=2', 'x=%zz', '=', '#', 'huntx=1'), { maxLength: 6 }),
        (parts) => {
          expect(decodeSetupFragment(parts.join('&'))).toEqual({ kind: 'none' });
        },
      ),
      { numRuns: 100 },
    );
  });

  it('handles mutated valid fragments', () => {
    // **Validates: Requirements 5.7, 5.8, 5.9, 5.10, 5.11, 5.12, 5.13, 5.14, 16.7**
    fc.assert(
      fc.property(
        validFieldsArb,
        fc.integer({ min: 0, max: 5 }),
        fc.string({ unit: 'binary', maxLength: 20 }),
        (f, kind, junk) => {
          const r = encodeSetupLink('https://example.com/', f);
          expect(r.ok).toBe(true);
          if (!r.ok) return;
          const mutated = mutate(paramsOf(r.link), kind, junk);
          check(mutated);
          if (kind === 0 || kind === 1) {
            expect(decodeSetupFragment(mutated).kind).toBe('error');
          }
          if (kind === 3) {
            const res = decodeSetupFragment(mutated);
            expect(res.kind).toBe('error');
            if (res.kind === 'error') expect(res.error.param).toBe('fragment');
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
