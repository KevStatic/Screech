import { describe, it, expect } from 'vitest';
import type { DecodedPacket, Result } from '@screech/core';
import { screenState } from '../../src/logic/screen-state';

const flags = { sealed: false, compressed: false, multipart: false };

function fail(code: string): Result<DecodedPacket> {
  return { ok: false, error: { code, message: 'x' } } as unknown as Result<DecodedPacket>;
}

describe('screenState', () => {
  it('reveals a non-multipart success', () => {
    const value = { multipart: false, type: 'text', flags, payload: { type: 'text', text: 'hi' } };
    const result = { ok: true, value } as unknown as Result<DecodedPacket>;
    const state = screenState(result);
    expect(state.kind).toBe('reveal');
    if (state.kind === 'reveal') expect(state.packet).toBe(value);
  });

  it('maps invalid-body to garbled', () => {
    expect(screenState(fail('invalid-body')).kind).toBe('garbled');
  });

  it('maps key-required to pact-required', () => {
    expect(screenState(fail('key-required')).kind).toBe('pact-required');
  });

  it('ignores a multipart success', () => {
    const value = { multipart: true, type: 'text', flags: { ...flags, multipart: true }, body: new Uint8Array(2) };
    const result = { ok: true, value } as unknown as Result<DecodedPacket>;
    expect(screenState(result).kind).toBe('ignore');
  });

  it.each(['bad-magic', 'unsupported-version', 'truncated', 'unknown-type', 'reserved-flags'])(
    'ignores room noise code %s',
    (code) => {
      expect(screenState(fail(code)).kind).toBe('ignore');
    },
  );
});
