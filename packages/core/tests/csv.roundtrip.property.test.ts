import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { CheckIn } from '../src/checkin-log.js';
import { exportCsv } from '../src/csv.js';
import { NUM_RUNS } from './helpers.js';

/**
 * Minimal RFC 4180 reader: CRLF separates records, fields may be wrapped in
 * double quotes, and `""` inside a quoted field is one double quote. A quoted
 * field may contain commas, CR and LF. Throws on malformed input.
 */
function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i] as string;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
          const next = text[i];
          if (next !== undefined && next !== ',' && next !== '\r') {
            throw new Error(`unexpected character after closing quote at ${i}`);
          }
        }
      } else {
        field += ch;
        i += 1;
      }
    } else if (ch === '"') {
      if (field !== '') throw new Error(`quote inside unquoted field at ${i}`);
      inQuotes = true;
      i += 1;
    } else if (ch === ',') {
      record.push(field);
      field = '';
      i += 1;
    } else if (ch === '\r') {
      if (text[i + 1] !== '\n') throw new Error(`bare CR in unquoted field at ${i}`);
      record.push(field);
      records.push(record);
      record = [];
      field = '';
      i += 2;
    } else if (ch === '\n') {
      throw new Error(`bare LF in unquoted field at ${i}`);
    } else {
      field += ch;
      i += 1;
    }
  }
  if (inQuotes) throw new Error('unterminated quoted field');
  record.push(field);
  records.push(record);
  return records;
}

const GUARDED = new Set(['=', '+', '-', '@', '\t', '\r']);

// Feature: seance, Property 12: CSV export round trip
// **Validates: Requirements 4.3, 4.5, 4.6**
describe('Property 12: CSV export round trip', () => {
  const BASE_MS = Date.UTC(2026, 9, 31, 23, 0, 0, 0);

  const atArb = fc
    .integer({ min: 0, max: 86_400_000 })
    .map((n) => new Date(BASE_MS + n).toISOString());
  const deviceIdArb = fc
    .array(fc.constantFrom(...'0123456789abcdef'.split('')), { minLength: 32, maxLength: 32 })
    .map((chars) => chars.join(''));

  // Heavy on the characters that matter for quoting and the injection guard.
  const specialChar = fc.constantFrom(',', '"', '\r', '\n', '=', '+', '-', '@', '\t', ' ', "'");
  const nameChar = fc.oneof(
    { weight: 2, arbitrary: specialChar },
    { weight: 3, arbitrary: fc.constantFrom(...'abcXYZ019 é'.split('')) },
  );
  const nameArb = fc
    .array(nameChar, { minLength: 1, maxLength: 32 })
    .map((chars) => chars.join(''));
  const guardedNameArb = fc
    .tuple(
      fc.constantFrom(...GUARDED),
      fc.array(nameChar, { minLength: 0, maxLength: 31 }),
    )
    .map(([first, rest]) => first + rest.join(''));

  const checkInArb: fc.Arbitrary<CheckIn> = fc.record({
    name: fc.oneof(nameArb, guardedNameArb),
    deviceId: deviceIdArb,
    at: atArb,
  });

  it('parses back to a header plus one record per check-in, in order, with only the guard added', () => {
    fc.assert(
      fc.property(fc.array(checkInArb, { minLength: 0, maxLength: 500 }), (checkIns) => {
        const records = parseCsv(exportCsv(checkIns));

        expect(records).toHaveLength(checkIns.length + 1);
        expect(records[0]).toEqual(['name', 'checked_in_at']);

        checkIns.forEach((checkIn, index) => {
          const record = records[index + 1] as string[];
          expect(record).toHaveLength(2);
          const guarded = GUARDED.has(checkIn.name[0] as string);
          expect(record[0]).toBe(guarded ? `'${checkIn.name}` : checkIn.name);
          expect(record[1]).toBe(checkIn.at);
        });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('handles a fixed set of awkward names', () => {
    const names = ['a,b', 'say "hi"', 'line1\nline2', 'cr\rhere', '=SUM(A1)', '\tx', '\rx', "'=x"];
    const checkIns = names.map((name, i) => ({
      name,
      deviceId: i.toString(16).padStart(32, '0'),
      at: new Date(BASE_MS + i * 1000).toISOString(),
    }));
    const records = parseCsv(exportCsv(checkIns));
    expect(records.slice(1).map((r) => r[0])).toEqual([
      'a,b',
      'say "hi"',
      'line1\nline2',
      'cr\rhere',
      "'=SUM(A1)",
      "'\tx",
      "'\rx",
      "'=x",
    ]);
  });
});
