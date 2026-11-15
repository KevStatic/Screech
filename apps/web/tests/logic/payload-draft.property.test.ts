import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { WifiSecurity } from '@screech/core';
import { buildPayload, hasContent, type Draft, type TypeKey } from '../../src/logic/payload-draft';

const hasNonWhitespace = (s: string): boolean => /\S/.test(s);

/** Mostly whitespace (ASCII, NBSP, ideographic space, line separators) with the odd visible char. */
const spaceChar = fc.constantFrom(' ', '\t', '\n', '\r', '\u00a0', '\u3000', '\u2028', '\ufeff');
const field = fc.oneof(
  fc.stringOf(spaceChar, { maxLength: 8 }),
  fc.string({ maxLength: 8 }),
  fc.tuple(fc.stringOf(spaceChar, { maxLength: 4 }), fc.constantFrom('a', '7', '#'), fc.stringOf(spaceChar, { maxLength: 4 })).map(
    ([a, b, c]) => a + b + c,
  ),
);

const typeKey: fc.Arbitrary<TypeKey> = fc.constantFrom('text', 'url', 'wifi', 'contact');
const security: fc.Arbitrary<WifiSecurity> = fc.constantFrom('wpa', 'wep', 'open');

const draft: fc.Arbitrary<Draft> = fc.record({
  selected: typeKey,
  text: field,
  url: field,
  wifi: fc.record({ ssid: field, password: field, security }),
  contact: fc.record({ name: field, phone: field, email: field }),
});

function expected(d: Draft): boolean {
  switch (d.selected) {
    case 'text':
      return hasNonWhitespace(d.text);
    case 'url':
      return hasNonWhitespace(d.url);
    case 'wifi':
      return hasNonWhitespace(d.wifi.ssid);
    case 'contact':
      return (
        hasNonWhitespace(d.contact.name) ||
        hasNonWhitespace(d.contact.phone) ||
        hasNonWhitespace(d.contact.email)
      );
  }
}

describe('Property 9: Content gate follows the whitespace rule', () => {
  /** **Validates: Requirements 5.8, 5.9** */
  it('hasContent matches the whitespace rule for the selected type', () => {
    fc.assert(
      fc.property(draft, (d) => {
        expect(hasContent(d)).toBe(expected(d));
      }),
      { numRuns: 200 },
    );
  });

  /** **Validates: Requirements 5.8, 5.9** */
  it('fields of unselected types never change the result', () => {
    fc.assert(
      fc.property(draft, draft, (a, b) => {
        const mixed: Draft = {
          selected: a.selected,
          text: a.selected === 'text' ? a.text : b.text,
          url: a.selected === 'url' ? a.url : b.url,
          wifi:
            a.selected === 'wifi'
              ? a.wifi
              : { ssid: b.wifi.ssid, password: b.wifi.password, security: b.wifi.security },
          contact: a.selected === 'contact' ? a.contact : b.contact,
        };
        expect(hasContent(mixed)).toBe(hasContent(a));
      }),
      { numRuns: 200 },
    );
  });

  /** **Validates: Requirements 5.8, 5.9** */
  it('the Wi-Fi password never affects the gate', () => {
    fc.assert(
      fc.property(draft, field, (d, password) => {
        const other: Draft = { ...d, wifi: { ...d.wifi, password } };
        expect(hasContent(other)).toBe(hasContent(d));
      }),
      { numRuns: 100 },
    );
  });

  /** **Validates: Requirements 5.8, 5.9** */
  it("buildPayload returns reason 'empty' exactly when hasContent is false", () => {
    fc.assert(
      fc.property(draft, (d) => {
        const result = buildPayload(d);
        const isEmpty = !result.ok && result.reason === 'empty';
        expect(isEmpty).toBe(!hasContent(d));
      }),
      { numRuns: 200 },
    );
  });
});
