import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  FIELD_SEPARATOR,
  buildContactText,
  parseContactText,
  sanitizeField,
} from '../../src/logic/contact';
import { contactFields, fieldString } from './arbitraries';

const RUNS = { numRuns: 200 };

describe('contact properties', () => {
  it('Feature: spirit-box-app, Property 3: Contact text round trip with sanitising', () => {
    // **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
    fc.assert(
      fc.property(contactFields, (f) => {
        const text = buildContactText(f);
        expect(text).not.toMatch(/[\n\r]/);
        expect(text.split(FIELD_SEPARATOR).length).toBeLessThanOrEqual(3);

        const expected = {
          name: sanitizeField(f.name),
          phone: sanitizeField(f.phone),
          email: sanitizeField(f.email),
        };
        const parsed = parseContactText(text);
        if (expected.name.trim() === '') {
          expect(parsed.ok).toBe(false);
          return;
        }
        expect(parsed).toEqual({ ok: true, fields: expected });

        const clean = [f.name, f.phone, f.email].every((v) => !/[\u001f\n\r]/.test(v));
        if (clean && parsed.ok) expect(parsed.fields).toEqual(f);
      }),
      RUNS,
    );
  });

  it('Feature: spirit-box-app, Property 4: Contact parsing is total', () => {
    // **Validates: Requirements 6.2, 6.10**
    const sepString = fc
      .array(fc.oneof(fieldString, fc.constant(FIELD_SEPARATOR)), { maxLength: 8 })
      .map((p) => p.join(''));
    fc.assert(
      fc.property(fc.oneof(fc.string(), sepString), (text) => {
        const parts = text.split(FIELD_SEPARATOR);
        const r = parseContactText(text);
        const shouldBeOk = parts.length >= 1 && parts.length <= 3 && (parts[0] ?? '').trim() !== '';
        expect(r.ok).toBe(shouldBeOk);
        if (r.ok) {
          expect(r.fields.name).toBe(parts[0]);
          expect(r.fields.phone).toBe(parts[1] ?? '');
          expect(r.fields.email).toBe(parts[2] ?? '');
        }
      }),
      RUNS,
    );
  });
});
