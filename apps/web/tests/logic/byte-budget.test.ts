import { describe, it, expect } from 'vitest';
import { SIZE_CAP } from '@screech/core';
import type { Result } from '@screech/core';
import { budget, describeEncodeError } from '../../src/logic/byte-budget';

const okOf = (n: number): Result<Uint8Array> => ({ ok: true, value: new Uint8Array(n) });

describe('byte budget', () => {
  it('uses a 140 byte cap', () => {
    expect(SIZE_CAP).toBe(140);
  });

  it.each([
    [0, 0],
    [139, 139 / 140],
    [140, 1],
  ])('size %i is ok with fill %f', (size, fill) => {
    expect(budget(okOf(size))).toEqual({ status: 'ok', size, fill, message: null });
  });

  it('treats a synthetic 141 byte result as too large', () => {
    expect(budget(okOf(141))).toEqual({
      status: 'too-large',
      size: 141,
      fill: 1,
      message: 'Too heavy to cross over (141/140 bytes)',
    });
  });

  it('maps a too-large error to the plain-words message', () => {
    const b = budget({ ok: false, error: { code: 'too-large', length: 148, message: 'x' } });
    expect(b).toEqual({
      status: 'too-large',
      size: 148,
      fill: 1,
      message: 'Too heavy to cross over (148/140 bytes)',
    });
  });

  it('maps invalid-payload to invalid with fill 0 and null size', () => {
    const b = budget({
      ok: false,
      error: { code: 'invalid-payload', field: 'ssid', message: 'too long' },
    });
    expect(b.status).toBe('invalid');
    expect(b.size).toBeNull();
    expect(b.fill).toBe(0);
    expect(b.message).toBe('Network names must be 1 to 32 bytes.');
  });

  it.each([
    ['url', 'Portals must start with http:// or https://.'],
    ['ssid', 'Network names must be 1 to 32 bytes.'],
    ['password', 'WPA and WEP passwords must be 1 to 63 bytes.'],
    ['security', 'Choose open, WPA or WEP.'],
    ['text', "This message holds a character the box can't carry. Try removing pasted symbols."],
    ['whatever', "This message holds a character the box can't carry. Try removing pasted symbols."],
  ])('invalid-payload field %s has exact copy', (field, text) => {
    const b = budget({ ok: false, error: { code: 'invalid-payload', field, message: 'x' } });
    expect(b.message).toBe(text);
  });

  it('maps invalid-wifi to the open-network copy', () => {
    const b = budget({ ok: false, error: { code: 'invalid-wifi', message: 'nope' } });
    expect(b).toEqual({
      status: 'invalid',
      size: null,
      fill: 0,
      message: "Open networks don't use a password.",
    });
  });

  it('maps any other error code to the generic copy', () => {
    const b = budget({ ok: false, error: { code: 'bad-magic', message: 'nope' } });
    expect(b).toEqual({
      status: 'invalid',
      size: null,
      fill: 0,
      message: "The box couldn't prepare this message.",
    });
  });

  it('describeEncodeError matches the budget message', () => {
    expect(describeEncodeError({ code: 'too-large', length: 200, message: '' })).toBe(
      'Too heavy to cross over (200/140 bytes)',
    );
  });
});
