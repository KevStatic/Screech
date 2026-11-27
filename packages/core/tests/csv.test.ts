import { describe, expect, it } from 'vitest';
import type { CheckIn } from '../src/checkin-log';
import { exportCsv } from '../src/csv';

const AT = '2026-10-31T23:04:05.123Z';
const DEV = '0'.repeat(32);
const ci = (name: string, at: string = AT): CheckIn => ({ name, deviceId: DEV, at });

describe('exportCsv', () => {
  it('returns only the header for an empty list', () => {
    expect(exportCsv([])).toBe('name,checked_in_at');
  });

  it('separates lines with CRLF and has no trailing CRLF', () => {
    const out = exportCsv([ci('Ada'), ci('Bob', '2026-10-31T23:05:00.000Z')]);
    expect(out).toBe(
      `name,checked_in_at\r\nAda,${AT}\r\nBob,2026-10-31T23:05:00.000Z`,
    );
    expect(out.endsWith('\r\n')).toBe(false);
    expect(exportCsv([ci('Ada')]).endsWith('\r\n')).toBe(false);
  });

  it.each([
    ['=', '=SUM(A1)'],
    ['+', '+1'],
    ['-', '-1'],
    ['@', '@home'],
  ])('prefixes a single quote when the name starts with %s', (_c, name) => {
    expect(exportCsv([ci(name)])).toBe(`name,checked_in_at\r\n'${name},${AT}`);
  });

  it('prefixes a single quote and quotes a name starting with a tab', () => {
    // Tab is guarded but needs no RFC 4180 quoting.
    expect(exportCsv([ci('\tx')])).toBe(`name,checked_in_at\r\n'\tx,${AT}`);
  });

  it('prefixes a single quote and quotes a name starting with CR', () => {
    expect(exportCsv([ci('\rx')])).toBe(`name,checked_in_at\r\n"'\rx",${AT}`);
  });

  it('does not guard a formula character that is not first', () => {
    expect(exportCsv([ci('a=b')])).toBe(`name,checked_in_at\r\na=b,${AT}`);
  });

  it('quotes a name containing a comma', () => {
    expect(exportCsv([ci('Doe, Jane')])).toBe(`name,checked_in_at\r\n"Doe, Jane",${AT}`);
  });

  it('quotes a name containing a quote and doubles it', () => {
    expect(exportCsv([ci('Say "hi"')])).toBe(`name,checked_in_at\r\n"Say ""hi""",${AT}`);
  });

  it('quotes a name containing CR or LF', () => {
    expect(exportCsv([ci('a\rb')])).toBe(`name,checked_in_at\r\n"a\rb",${AT}`);
    expect(exportCsv([ci('a\nb')])).toBe(`name,checked_in_at\r\n"a\nb",${AT}`);
  });
});
