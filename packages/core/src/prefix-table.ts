/**
 * The Packet_V1 URL prefix table. This is the only definition. Entries may be
 * appended but never changed or reused. Codes 0x11 to 0x7F are undefined.
 */
export const PREFIX_TABLE = [
  { code: 0x01, prefix: 'www.' },
  { code: 0x02, prefix: 'github.com/' },
  { code: 0x03, prefix: 'www.youtube.com/' },
  { code: 0x04, prefix: 'youtu.be/' },
  { code: 0x05, prefix: 'docs.google.com/' },
  { code: 0x06, prefix: 'drive.google.com/' },
  { code: 0x07, prefix: 'meet.google.com/' },
  { code: 0x08, prefix: 'zoom.us/' },
  { code: 0x09, prefix: 'discord.gg/' },
  { code: 0x0a, prefix: 'linkedin.com/in/' },
  { code: 0x0b, prefix: 'www.linkedin.com/in/' },
  { code: 0x0c, prefix: 'twitter.com/' },
  { code: 0x0d, prefix: 'x.com/' },
  { code: 0x0e, prefix: 'bit.ly/' },
  { code: 0x0f, prefix: 'en.wikipedia.org/wiki/' },
  { code: 0x10, prefix: 'forms.gle/' },
] as const;

export interface CompressedUrl {
  /** Table code, or 0x00 when no prefix matched. */
  readonly code: number;
  /** The input with the matched prefix removed. */
  readonly remainder: string;
}

/**
 * Replaces the longest case-sensitive table prefix at the start of `rest`
 * (a URL with its scheme already removed) with its code.
 */
export function compressUrl(rest: string): CompressedUrl {
  let best: (typeof PREFIX_TABLE)[number] | undefined;
  for (const entry of PREFIX_TABLE) {
    if (rest.startsWith(entry.prefix) && (best === undefined || entry.prefix.length > best.prefix.length)) {
      best = entry;
    }
  }
  if (best === undefined) return { code: 0, remainder: rest };
  return { code: best.code, remainder: rest.slice(best.prefix.length) };
}

/**
 * Returns the prefix for a code: '' for 0x00, undefined for a code not in the table.
 */
export function expandUrl(code: number): string | undefined {
  if (code === 0) return '';
  for (const entry of PREFIX_TABLE) {
    if (entry.code === code) return entry.prefix;
  }
  return undefined;
}
