import { describe, expect, it } from 'vitest';
import { HOLD_DURATION_MS, holdProgress, holdStep, type HoldEvent, type HoldState } from '../../src/logic/hold-machine';

const IDLE: HoldState = { kind: 'idle' };
const run = (events: HoldEvent[], start: HoldState = IDLE): HoldState => events.reduce(holdStep, start);

describe('holdStep', () => {
  it('hold duration is 300 ms', () => {
    expect(HOLD_DURATION_MS).toBe(300);
  });

  it('press from idle starts holding at 0 ms', () => {
    expect(run([{ kind: 'press' }])).toEqual({ kind: 'holding', elapsedMs: 0 });
  });

  it('ignores release, cancel and tick while idle', () => {
    expect(run([{ kind: 'release' }, { kind: 'cancel' }, { kind: 'tick', elapsedMs: 500 }])).toEqual(IDLE);
  });

  it('keeps holding on key auto-repeat presses', () => {
    const s = run([{ kind: 'press' }, { kind: 'tick', elapsedMs: 120 }, { kind: 'press' }, { kind: 'press' }]);
    expect(s).toEqual({ kind: 'holding', elapsedMs: 120 });
  });

  it('tick at 0 and 299 ms stays holding', () => {
    expect(run([{ kind: 'press' }, { kind: 'tick', elapsedMs: 0 }])).toEqual({ kind: 'holding', elapsedMs: 0 });
    expect(run([{ kind: 'press' }, { kind: 'tick', elapsedMs: 299 }])).toEqual({ kind: 'holding', elapsedMs: 299 });
  });

  it('tick at exactly 300 ms fires', () => {
    expect(run([{ kind: 'press' }, { kind: 'tick', elapsedMs: 300 }])).toEqual({ kind: 'fired' });
  });

  it('tick past 300 ms fires', () => {
    expect(run([{ kind: 'press' }, { kind: 'tick', elapsedMs: 1000 }])).toEqual({ kind: 'fired' });
  });

  it('release before the duration returns to idle without firing', () => {
    expect(run([{ kind: 'press' }, { kind: 'tick', elapsedMs: 299 }, { kind: 'release' }])).toEqual(IDLE);
  });

  it('cancel returns to idle', () => {
    expect(run([{ kind: 'press' }, { kind: 'tick', elapsedMs: 100 }, { kind: 'cancel' }])).toEqual(IDLE);
  });

  it('a late tick after cancel does not fire', () => {
    expect(run([{ kind: 'press' }, { kind: 'cancel' }, { kind: 'tick', elapsedMs: 400 }])).toEqual(IDLE);
  });

  it('elapsed time never goes backwards', () => {
    const s = run([{ kind: 'press' }, { kind: 'tick', elapsedMs: 200 }, { kind: 'tick', elapsedMs: 50 }]);
    expect(s).toEqual({ kind: 'holding', elapsedMs: 200 });
  });

  it('after fired, press, tick and repeats stay fired', () => {
    const fired: HoldState = { kind: 'fired' };
    expect(run([{ kind: 'press' }, { kind: 'tick', elapsedMs: 350 }, { kind: 'tick', elapsedMs: 400 }], IDLE)).toEqual(fired);
    expect(run([{ kind: 'press' }], fired)).toEqual(fired);
  });

  it('release or cancel after fired returns to idle', () => {
    expect(run([{ kind: 'release' }], { kind: 'fired' })).toEqual(IDLE);
    expect(run([{ kind: 'cancel' }], { kind: 'fired' })).toEqual(IDLE);
  });

  it('can fire again after a full release', () => {
    const s = run([
      { kind: 'press' }, { kind: 'tick', elapsedMs: 300 }, { kind: 'release' },
      { kind: 'press' }, { kind: 'tick', elapsedMs: 300 },
    ]);
    expect(s).toEqual({ kind: 'fired' });
  });
});

describe('holdProgress', () => {
  it('is 0 idle, fractional while holding, 1 when fired', () => {
    expect(holdProgress(IDLE)).toBe(0);
    expect(holdProgress({ kind: 'holding', elapsedMs: 0 })).toBe(0);
    expect(holdProgress({ kind: 'holding', elapsedMs: 150 })).toBe(0.5);
    expect(holdProgress({ kind: 'holding', elapsedMs: 299 })).toBeCloseTo(299 / 300);
    expect(holdProgress({ kind: 'fired' })).toBe(1);
  });
});
