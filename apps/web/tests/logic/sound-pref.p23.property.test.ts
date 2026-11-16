// Feature: haunting-sounds, Property 23: Settings are independent
// **Validates: Requirements 9.15, 10.6, 10.7**
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SOUND_KEY, parseSound, serializeSound } from '../../src/logic/sound-pref';
import { EXORCISE_KEY, parseExorcise, serializeExorcise } from '../../src/logic/motion';

const RUNS = { numRuns: 100 };

/** Minimal in-memory stand-in for localStorage. */
function fakeStorage(): Map<string, string> {
  return new Map<string, string>();
}

const rawValue = fc.option(
  fc.oneof(fc.constantFrom('0', '1', '', 'true', 'false'), fc.string()),
  { nil: null },
);

describe('Property 23: Settings are independent', () => {
  it('uses different storage keys', () => {
    expect(SOUND_KEY).not.toBe(EXORCISE_KEY);
  });

  it('writing one setting never changes the other stored value or parsed result', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (sound, exorcise, newSound, newExorcise) => {
          const store = fakeStorage();
          store.set(SOUND_KEY, serializeSound(sound));
          store.set(EXORCISE_KEY, serializeExorcise(exorcise));

          store.set(SOUND_KEY, serializeSound(newSound));
          expect(store.get(EXORCISE_KEY)).toBe(serializeExorcise(exorcise));
          expect(parseExorcise(store.get(EXORCISE_KEY))).toBe(exorcise);
          expect(parseSound(store.get(SOUND_KEY))).toBe(newSound);

          store.set(EXORCISE_KEY, serializeExorcise(newExorcise));
          expect(store.get(SOUND_KEY)).toBe(serializeSound(newSound));
          expect(parseSound(store.get(SOUND_KEY))).toBe(newSound);
          expect(parseExorcise(store.get(EXORCISE_KEY))).toBe(newExorcise);
        },
      ),
      RUNS,
    );
  });

  it('round-trips each setting for any pair of booleans', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (sound, exorcise) => {
        const store = fakeStorage();
        store.set(SOUND_KEY, serializeSound(sound));
        store.set(EXORCISE_KEY, serializeExorcise(exorcise));
        expect(parseSound(store.get(SOUND_KEY))).toBe(sound);
        expect(parseExorcise(store.get(EXORCISE_KEY))).toBe(exorcise);
      }),
      RUNS,
    );
  });

  it('any raw value for one key does not affect parsing of the other', () => {
    fc.assert(
      fc.property(rawValue, rawValue, (soundRaw, exorciseRaw) => {
        const store = fakeStorage();
        if (soundRaw !== null) store.set(SOUND_KEY, soundRaw);
        if (exorciseRaw !== null) store.set(EXORCISE_KEY, exorciseRaw);
        // Each parser depends only on its own raw value.
        expect(parseSound(store.get(SOUND_KEY))).toBe(parseSound(soundRaw));
        expect(parseExorcise(store.get(EXORCISE_KEY))).toBe(parseExorcise(exorciseRaw));
        expect(parseSound(soundRaw)).toBe(soundRaw !== '0');
        expect(parseExorcise(exorciseRaw)).toBe(exorciseRaw === '1');
      }),
      RUNS,
    );
  });

  it('neither source module imports the other', () => {
    const dir = resolve(__dirname, '../../src/logic');
    const soundSrc = readFileSync(resolve(dir, 'sound-pref.ts'), 'utf8');
    const motionSrc = readFileSync(resolve(dir, 'motion.ts'), 'utf8');
    expect(soundSrc).not.toMatch(/from\s+['"][^'"]*motion['"]/);
    expect(motionSrc).not.toMatch(/from\s+['"][^'"]*sound-pref['"]/);
  });
});
