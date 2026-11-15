import { describe, it, expect } from 'vitest';
import { micSupport, missingFeatures, type Env } from '../../src/logic/capabilities';

const FULL: Env = { hasWasm: true, hasWebAudio: true, isSecureContext: true, hasGetUserMedia: true };

describe('micSupport', () => {
  it('reports insecure context before a missing getUserMedia', () => {
    expect(micSupport({ ...FULL, isSecureContext: false, hasGetUserMedia: false })).toBe('insecure-context');
  });

  it('reports a missing getUserMedia in a secure context', () => {
    expect(micSupport({ ...FULL, hasGetUserMedia: false })).toBe('no-getusermedia');
  });

  it('is ok when both are present', () => {
    expect(micSupport(FULL)).toBe('ok');
  });
});

describe('missingFeatures', () => {
  it('is empty when everything is present', () => {
    expect(missingFeatures(FULL)).toEqual([]);
  });

  it('names WebAssembly', () => {
    expect(missingFeatures({ ...FULL, hasWasm: false })).toEqual(['WebAssembly']);
  });

  it('names Web Audio', () => {
    expect(missingFeatures({ ...FULL, hasWebAudio: false })).toEqual(['Web Audio']);
  });

  it('names the secure context', () => {
    expect(missingFeatures({ ...FULL, isSecureContext: false })).toEqual(['secure context (HTTPS)']);
  });

  it('lists every missing feature', () => {
    expect(
      missingFeatures({ hasWasm: false, hasWebAudio: false, isSecureContext: false, hasGetUserMedia: true }),
    ).toEqual(['WebAssembly', 'Web Audio', 'secure context (HTTPS)']);
  });
});
