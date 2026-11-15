import type { ContactFields } from './contact';

/** RFC 6350 text escaping; CRLF, CR and LF all become the two characters `\n`. */
export function escapeVCardText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** vCard 3.0 with CRLF-terminated lines; TEL and EMAIL only when non-empty. */
export function buildVCard(fields: ContactFields): string {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${escapeVCardText(fields.name)}`];
  if (fields.phone !== '') lines.push(`TEL:${escapeVCardText(fields.phone)}`);
  if (fields.email !== '') lines.push(`EMAIL:${escapeVCardText(fields.email)}`);
  lines.push('END:VCARD');
  return lines.map((l) => `${l}\r\n`).join('');
}
