export const FIELD_SEPARATOR = '\u001f';

export interface ContactFields {
  readonly name: string;
  readonly phone: string;
  readonly email: string;
}

export type ParsedContact =
  | { readonly ok: true; readonly fields: ContactFields }
  | { readonly ok: false };

/** Replaces each U+001F, LF and CR with one space. */
export function sanitizeField(value: string): string {
  return value.replace(/[\u001f\n\r]/g, ' ');
}

/** Sanitised fields joined by U+001F, with trailing empty fields omitted. */
export function buildContactText(fields: ContactFields): string {
  const parts = [fields.name, fields.phone, fields.email].map(sanitizeField);
  while (parts.length > 1 && parts[parts.length - 1] === '') parts.pop();
  return parts.join(FIELD_SEPARATOR);
}

/** Total: ok iff 1..3 parts and the name is not blank after trimming. */
export function parseContactText(text: string): ParsedContact {
  const parts = text.split(FIELD_SEPARATOR);
  const name = parts[0] ?? '';
  if (parts.length > 3 || name.trim() === '') return { ok: false };
  return { ok: true, fields: { name, phone: parts[1] ?? '', email: parts[2] ?? '' } };
}
