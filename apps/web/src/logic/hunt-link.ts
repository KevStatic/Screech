import { validateClueFields } from '@screech/core';
import type { ClueFields, ClueFieldsInput, CodecError } from '@screech/core';

export type LinkError = {
  readonly param: 'url' | 'hunt' | 'spirit' | 'total' | 'name' | 'clue' | 'fragment';
  readonly message: string;
};

export type EncodeLinkResult =
  | { readonly ok: true; readonly link: string }
  | { readonly ok: false; readonly error: CodecError | LinkError };

export type DecodeFragmentResult =
  | { readonly kind: 'none' }
  | { readonly kind: 'fields'; readonly fields: ClueFields }
  | { readonly kind: 'error'; readonly error: LinkError };

export const MAX_FRAGMENT_LENGTH = 2048;

const KEYS = ['hunt', 'spirit', 'total', 'name', 'clue'] as const;
type Key = (typeof KEYS)[number];

const UNRESERVED = /[A-Za-z0-9\-._~]/;
const HEX = '0123456789ABCDEF';

/** Percent-encodes every UTF-8 byte except A-Za-z0-9-._~ (encodeURIComponent leaves ! ' ( ) * alone). */
function percentEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let out = '';
  for (const b of bytes) {
    const ch = String.fromCharCode(b);
    out += b < 128 && UNRESERVED.test(ch) ? ch : `%${HEX[b >> 4]}${HEX[b & 15]}`;
  }
  return out;
}

function isHttpBase(base: string): boolean {
  if (typeof base !== 'string' || base.length === 0) return false;
  try {
    const url = new URL(base);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function encodeSetupLink(baseUrl: string, fields: ClueFieldsInput): EncodeLinkResult {
  const checked = validateClueFields(fields);
  if (!checked.ok) return { ok: false, error: checked.error };
  const f = checked.value;
  if (typeof baseUrl !== 'string') {
    return { ok: false, error: { param: 'url', message: 'The base URL is invalid. Use a full http or https address.' } };
  }
  const hash = baseUrl.indexOf('#');
  const base = hash === -1 ? baseUrl : baseUrl.slice(0, hash);
  if (!isHttpBase(base)) {
    return { ok: false, error: { param: 'url', message: 'The base URL is invalid. Use a full http or https address.' } };
  }
  const link =
    `${base}#hunt=${f.huntId}&spirit=${f.index}&total=${f.total}` +
    `&name=${percentEncode(f.name)}&clue=${percentEncode(f.clue)}`;
  return { ok: true, link };
}

function linkError(param: LinkError['param'], message: string): DecodeFragmentResult {
  return { kind: 'error', error: { param, message } };
}

const FIELD_PARAM: Readonly<Record<string, LinkError['param']>> = {
  huntId: 'hunt',
  index: 'spirit',
  total: 'total',
  name: 'name',
  clue: 'clue',
};

export function decodeSetupFragment(fragment: string): DecodeFragmentResult {
  try {
    if (typeof fragment !== 'string') return { kind: 'none' };
    const text = fragment.startsWith('#') ? fragment.slice(1) : fragment;
    if (text.length > MAX_FRAGMENT_LENGTH) {
      return linkError(
        'fragment',
        `This link is too long to read (${text.length}/${MAX_FRAGMENT_LENGTH} characters)`,
      );
    }

    const values = new Map<Key, string>();
    for (const part of text.split('&')) {
      const eq = part.indexOf('=');
      const key = eq === -1 ? part : part.slice(0, eq);
      const value = eq === -1 ? '' : part.slice(eq + 1);
      if (!(KEYS as readonly string[]).includes(key)) continue;
      if (values.has(key as Key)) {
        return linkError(key as Key, `The ${key} part appears more than once in this link`);
      }
      values.set(key as Key, value);
    }
    if (values.size === 0) return { kind: 'none' };
    for (const key of KEYS) {
      if (!values.has(key)) return linkError(key, `The ${key} part is missing from this link`);
    }

    const huntId = values.get('hunt') as string;
    const spirit = values.get('spirit') as string;
    const total = values.get('total') as string;
    if (!/^[0-9]+$/.test(spirit)) {
      return linkError('spirit', 'The spirit part must be a whole number made of digits only');
    }
    if (!/^[0-9]+$/.test(total)) {
      return linkError('total', 'The total part must be a whole number made of digits only');
    }

    let name: string;
    let clue: string;
    try {
      name = decodeURIComponent(values.get('name') as string);
    } catch {
      return linkError('name', 'The name part is not valid percent-encoded text');
    }
    try {
      clue = decodeURIComponent(values.get('clue') as string);
    } catch {
      return linkError('clue', 'The clue part is not valid percent-encoded text');
    }

    const checked = validateClueFields({
      huntId,
      index: Number(spirit),
      total: Number(total),
      name,
      clue,
    });
    if (!checked.ok) {
      const err = checked.error;
      const field = err.code === 'invalid-payload' ? err.field : 'huntId';
      return linkError(FIELD_PARAM[field] ?? 'hunt', err.message);
    }
    return { kind: 'fields', fields: checked.value };
  } catch {
    return linkError('fragment', 'This link could not be read');
  }
}
