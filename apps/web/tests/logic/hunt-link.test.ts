import { describe, it, expect } from 'vitest';
import {
  decodeSetupFragment,
  encodeSetupLink,
  MAX_FRAGMENT_LENGTH,
} from '../../src/logic/hunt-link';

const fields = { huntId: 'ABC234', index: 2, total: 3, name: 'Mara', clue: 'Look under the stairs' };
const good = 'hunt=ABC234&spirit=2&total=3&name=Mara&clue=Look%20under%20the%20stairs';

describe('decodeSetupFragment', () => {
  it('returns none for an empty fragment and for only #', () => {
    expect(decodeSetupFragment('')).toEqual({ kind: 'none' });
    expect(decodeSetupFragment('#')).toEqual({ kind: 'none' });
  });

  it('decodes a valid fragment with and without #', () => {
    const expected = { kind: 'fields', fields };
    expect(decodeSetupFragment(good)).toEqual(expected);
    expect(decodeSetupFragment(`#${good}`)).toEqual(expected);
  });

  it('names a missing parameter', () => {
    const r = decodeSetupFragment('hunt=ABC234&spirit=2&total=3&name=Mara');
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.error.param).toBe('clue');
  });

  it('names a duplicated parameter', () => {
    const r = decodeSetupFragment(`${good}&total=4`);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.error.param).toBe('total');
  });

  it('reports malformed percent-encoding', () => {
    const r = decodeSetupFragment('hunt=ABC234&spirit=2&total=3&name=Ma%ZZ&clue=x');
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.error.param).toBe('name');
  });

  it('accepts the five parameters in another order', () => {
    const r = decodeSetupFragment('clue=Look%20under%20the%20stairs&name=Mara&total=3&spirit=2&hunt=ABC234');
    expect(r).toEqual({ kind: 'fields', fields });
  });

  it('rejects a fragment over 2048 characters', () => {
    const r = decodeSetupFragment(`${good}&x=${'a'.repeat(MAX_FRAGMENT_LENGTH)}`);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.error.param).toBe('fragment');
  });

  it('rejects non-digit spirit and total', () => {
    expect(decodeSetupFragment(good.replace('spirit=2', 'spirit=%2B2')).kind).toBe('error');
    expect(decodeSetupFragment(good.replace('total=3', 'total=3.0')).kind).toBe('error');
  });
});

describe('encodeSetupLink', () => {
  it('builds the link in fixed order and strips the base fragment', () => {
    const r = encodeSetupLink('https://example.com/play?x=1#old', fields);
    expect(r).toEqual({
      ok: true,
      link: 'https://example.com/play?x=1#hunt=ABC234&spirit=2&total=3&name=Mara&clue=Look%20under%20the%20stairs',
    });
  });

  it('rejects a base that is not absolute http or https', () => {
    for (const base of ['', 'example.com', 'ftp://x.com/', 'javascript:alert(1)']) {
      const r = encodeSetupLink(base, fields);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatchObject({ param: 'url' });
    }
  });

  it('returns field errors from validation', () => {
    const r = encodeSetupLink('https://example.com/', { ...fields, total: 2 });
    expect(r.ok).toBe(false);
  });

  it.each(['&', '=', '#', '%', '+', 'a&b=c#d%e+f'])('round-trips %s in name and clue', (s) => {
    const f = { ...fields, name: `n${s}`, clue: `c${s}c` };
    const r = encodeSetupLink('https://example.com/', f);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = decodeSetupFragment(r.link.slice(r.link.indexOf('#')));
    expect(d).toEqual({ kind: 'fields', fields: f });
  });
});
