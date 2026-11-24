import { describe, it, expect } from 'vitest';
import { RIDDLE_PACKS } from '../../src/logic/riddle-packs';

describe('RIDDLE_PACKS', () => {
  it('has exactly the office, home and classroom packs', () => {
    expect(Object.keys(RIDDLE_PACKS).sort()).toEqual(['classroom', 'home', 'office']);
  });

  it.each(['office', 'home', 'classroom'] as const)(
    '%s has one opening, 7 entries and one finale',
    (id) => {
      const pack = RIDDLE_PACKS[id];
      expect(pack.entries).toHaveLength(7);
      expect(typeof pack.opening).toBe('string');
      expect(pack.opening.length).toBeGreaterThan(0);
      expect(typeof pack.finale).toBe('string');
      expect(pack.finale.length).toBeGreaterThan(0);
    },
  );

  it.each(['office', 'home', 'classroom'] as const)(
    '%s finale says the Hunt is over and the last Spirit repeats it',
    (id) => {
      const pack = RIDDLE_PACKS[id];
      expect(pack.finale.toLowerCase()).toContain('hunt is over');
      expect(pack.entries[6]!.clue).toBe(pack.finale);
    },
  );

  it('office chain: the first hide spot is the printer and the second is the water cooler', () => {
    const pack = RIDDLE_PACKS.office;
    expect(pack.entries[0]!.hideAt).toBe('On top of the printer');
    expect(pack.entries[1]!.hideAt.toLowerCase()).toContain('water cooler');
  });
  it.each(['office', 'home', 'classroom'] as const)(
    '%s riddles do not name the place they lead to',
    (id) => {
      const pack = RIDDLE_PACKS[id];
      const answer = (hideAt: string): string => hideAt.trim().split(/\s+/).pop()!.toLowerCase();
      const names = (text: string, word: string): boolean =>
        new RegExp(`\\b${word}\\b`).test(text.toLowerCase());
      expect(names(pack.opening, answer(pack.entries[0]!.hideAt))).toBe(false);
      for (let k = 0; k < 6; k += 1) {
        expect(names(pack.entries[k]!.clue, answer(pack.entries[k + 1]!.hideAt))).toBe(false);
      }
    },
  );
});
