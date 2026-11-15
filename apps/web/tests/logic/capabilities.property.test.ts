import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { missingFeatures, micSupport, type Env, type MissingFeature } from '../../src/logic/capabilities';

const envArb: fc.Arbitrary<Env> = fc.record({
  hasWasm: fc.boolean(),
  hasWebAudio: fc.boolean(),
  isSecureContext: fc.boolean(),
  hasGetUserMedia: fc.boolean(),
});

// Feature: spirit-box-app, Property 26: Missing-feature report
// **Validates: Requirements 16.7**
describe('Property 26: Missing-feature report', () => {
  it('missingFeatures lists exactly the features whose flag is false', () => {
    fc.assert(
      fc.property(envArb, (env) => {
        const expected: MissingFeature[] = [];
        if (!env.hasWasm) expected.push('WebAssembly');
        if (!env.hasWebAudio) expected.push('Web Audio');
        if (!env.isSecureContext) expected.push('secure context (HTTPS)');

        const got = missingFeatures(env);
        expect(new Set(got).size).toBe(got.length);
        expect([...got].sort()).toEqual([...expected].sort());
        const allPresent = env.hasWasm && env.hasWebAudio && env.isSecureContext;
        expect(got.length === 0).toBe(allPresent);
      }),
      { numRuns: 100 },
    );
  });

  it('micSupport reports the blocking cause', () => {
    fc.assert(
      fc.property(envArb, (env) => {
        const got = micSupport(env);
        if (!env.isSecureContext) expect(got).toBe('insecure-context');
        else if (!env.hasGetUserMedia) expect(got).toBe('no-getusermedia');
        else expect(got).toBe('ok');
      }),
      { numRuns: 100 },
    );
  });
});
