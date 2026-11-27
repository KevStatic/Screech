import type { CheckIn } from './checkin-log.js';

const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

function csvField(value: string): string {
  const guarded = FORMULA_START.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/**
 * Turns check-ins into RFC 4180 CSV text: header `name,checked_in_at`, CRLF
 * between lines, no trailing CRLF. Names starting with a formula character get
 * a leading `'` before quoting.
 */
export function exportCsv(checkIns: readonly CheckIn[]): string {
  const lines = ['name,checked_in_at'];
  for (const c of checkIns) lines.push(`${csvField(c.name)},${csvField(c.at)}`);
  return lines.join('\r\n');
}
