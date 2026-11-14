import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import * as core from '../src/index.js';

describe('@screech/core public API', () => {
  it('exports the documented runtime values', () => {
    const names = [
      'encode',
      'decode',
      'seal',
      'open',
      'deriveNonce',
      'nextSenderState',
      'buildFrame',
      'parseFrame',
      'PREFIX_TABLE',
      'SIZE_CAP',
      'VERSION',
    ] as const;
    for (const name of names) expect(core[name]).toBeDefined();
  });

  it('round-trips a text payload through the public API', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 40 }), (text) => {
        const encoded = core.encode({ type: 'text', text });
        if (!encoded.ok) return true; // lone surrogates are rejected
        const decoded = core.decode(encoded.value);
        return decoded.ok && !decoded.value.multipart && decoded.value.payload.type === 'text'
          ? decoded.value.payload.text === text
          : false;
      }),
    );
  });
});
