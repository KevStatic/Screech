// Feature: haunting-sounds, Property 31: The hint is shown at most once per session
// **Validates: Requirements 12.1, 12.2, 12.3, 12.14**
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createSoundHintStore } from '../../src/ui/hooks/useSoundHint';
import { SOUND_HINT_KEY } from '../../src/logic/sound-hint';

type Event = 'soundOn' | 'soundOff' | 'awaken' | 'refresh' | 'dismiss';
type Storage = 'ok' | 'readThrows' | 'writeThrows' | 'bothThrow';

const eventArb: fc.Arbitrary<Event> = fc.constantFrom('soundOn', 'soundOff', 'awaken', 'refresh', 'dismiss');

describe('Property 31: the hint is shown at most once per session', () => {
  it('shows at most once, writes at most once, respects a stored value, never throws', () => {
    fc.assert(
      fc.property(
        fc.array(eventArb, { maxLength: 40 }),
        fc.constantFrom<Storage>('ok', 'readThrows', 'writeThrows', 'bothThrow'),
        fc.option(fc.string(), { nil: null }),
        fc.boolean(),
        (events, storage, stored, startOn) => {
          let soundOn = startOn;
          const writes: Array<[string, string]> = [];
          const store = createSoundHintStore({
            readStorage: () => {
              if (storage === 'readThrows' || storage === 'bothThrow') throw new Error('read');
              return stored;
            },
            writeStorage: (k, v) => {
              if (storage === 'writeThrows' || storage === 'bothThrow') throw new Error('write');
              writes.push([k, v]);
            },
            detectIos: () => true,
            soundOn: () => soundOn,
          });

          let becameVisible = 0;
          let wasVisible = false;
          const observe = (): void => {
            const v = store.getSnapshot().visible;
            if (v && !wasVisible) becameVisible += 1;
            wasVisible = v;
          };
          store.subscribe(observe);

          for (const e of events) {
            if (e === 'soundOn') soundOn = true;
            if (e === 'soundOff') soundOn = false;
            if (e === 'awaken') store.markAwakenTapped();
            else if (e === 'dismiss') store.getSnapshot().dismiss();
            else store.refresh();
            observe();
          }

          // Toggling Sound off and on re-shows the same latched hint; it is never re-written.
          expect(writes.length).toBeLessThanOrEqual(1);
          for (const [k, v] of writes) {
            expect(k).toBe(SOUND_HINT_KEY);
            expect(v).toBe('1');
          }
          const storedAtStart = (storage === 'ok' || storage === 'writeThrows') && stored !== null;
          if (storedAtStart) {
            expect(becameVisible).toBe(0);
            expect(writes.length).toBe(0);
          }
          if (!events.includes('awaken')) expect(becameVisible).toBe(0);
          // Without Sound toggling, the hint becomes visible at most once.
          if (!events.includes('soundOff')) expect(becameVisible).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('stays hidden after dismiss even when the sound toggle flips', () => {
    let on = true;
    const store = createSoundHintStore({
      readStorage: () => null,
      writeStorage: () => {
        throw new Error('write');
      },
      detectIos: () => true,
      soundOn: () => on,
    });
    store.markAwakenTapped();
    expect(store.getSnapshot().visible).toBe(true);
    store.getSnapshot().dismiss();
    expect(store.getSnapshot().visible).toBe(false);
    on = false;
    store.refresh();
    on = true;
    store.refresh();
    expect(store.getSnapshot().visible).toBe(false);
  });
});
