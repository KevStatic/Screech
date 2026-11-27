import { describe, it, expect } from 'vitest';
import {
  SCREECH_STOPPED,
  screechStep,
  type ScreechEvent,
  type ScreechState,
} from '../../src/logic/screech-machine';

function run(state: ScreechState, ...events: ScreechEvent[]) {
  let s = state;
  const commands: Array<'screech' | null> = [];
  for (const e of events) {
    const out = screechStep(s, e);
    s = out.state;
    commands.push(out.command);
  }
  return { state: s, commands };
}

describe('screech-machine', () => {
  it('asks for the first screech at once after start', () => {
    const { state, commands } = run(
      SCREECH_STOPPED,
      { type: 'start', now: 1000 },
      { type: 'tick', now: 1000 },
    );
    expect(commands).toEqual([null, 'screech']);
    expect(state).toMatchObject({ kind: 'running', nextDueAt: 1000 });
  });

  it('delays the next screech while one is still playing past its due time', () => {
    const { commands, state } = run(
      SCREECH_STOPPED,
      { type: 'start', now: 0 },
      { type: 'screechStarted', now: 0, random: 0 }, // next due at 10000
      { type: 'tick', now: 10000 },
      { type: 'tick', now: 12000 },
      { type: 'visible', now: 12500 },
    );
    expect(commands).toEqual([null, null, null, null, null]);
    expect(state).toMatchObject({ kind: 'running', playing: true, nextDueAt: 10000 });
  });

  it('starts the delayed screech within 1 s of the previous one ending', () => {
    const { commands } = run(
      SCREECH_STOPPED,
      { type: 'start', now: 0 },
      { type: 'screechStarted', now: 0, random: 0 },
      { type: 'tick', now: 10500 },
      { type: 'screechEnded', now: 11000 },
      { type: 'tick', now: 11250 },
    );
    expect(commands).toEqual([null, null, null, null, 'screech']);
  });

  it('asks for the next screech as soon as it is due when nothing is playing', () => {
    const { commands } = run(
      SCREECH_STOPPED,
      { type: 'start', now: 0 },
      { type: 'screechStarted', now: 0, random: 0 },
      { type: 'screechEnded', now: 2000 },
      { type: 'tick', now: 9999 },
      { type: 'tick', now: 10000 },
    );
    expect(commands.slice(3)).toEqual([null, 'screech']);
  });

  it('schedules the next screech from the start of the current one', () => {
    const { state } = run(
      SCREECH_STOPPED,
      { type: 'start', now: 0 },
      { type: 'screechStarted', now: 20000, random: 0.5 },
    );
    expect(state).toMatchObject({ nextDueAt: 20000 + 12500 });
  });

  it('keeps looping after the audio context is blocked', () => {
    const { commands, state } = run(
      SCREECH_STOPPED,
      { type: 'start', now: 0 },
      { type: 'tick', now: 0 },
      { type: 'contextFailed' },
      { type: 'tick', now: 500 },
    );
    expect(commands).toEqual([null, 'screech', null, 'screech']);
    expect(state.kind).toBe('running');
  });

  it('clears playing on contextFailed so a retry is not blocked', () => {
    const { state } = run(
      SCREECH_STOPPED,
      { type: 'start', now: 0 },
      { type: 'screechStarted', now: 0, random: 0 },
      { type: 'contextFailed' },
    );
    expect(state).toMatchObject({ kind: 'running', playing: false });
  });

  it('reschedules after a skipped screech and keeps running', () => {
    const { state, commands } = run(
      SCREECH_STOPPED,
      { type: 'start', now: 0 },
      { type: 'screechSkipped', now: 0, random: 0 },
      { type: 'tick', now: 9999 },
      { type: 'tick', now: 10000 },
    );
    expect(state).toMatchObject({ kind: 'running', playing: false, nextDueAt: 10000 });
    expect(commands).toEqual([null, null, null, 'screech']);
  });

  it('ignores events while stopped and stops on request', () => {
    expect(run(SCREECH_STOPPED, { type: 'tick', now: 5 }, { type: 'contextFailed' }).commands).toEqual([
      null,
      null,
    ]);
    const { state } = run(SCREECH_STOPPED, { type: 'start', now: 0 }, { type: 'stop' });
    expect(state).toEqual(SCREECH_STOPPED);
  });
});
