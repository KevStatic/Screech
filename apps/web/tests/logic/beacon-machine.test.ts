import { describe, it, expect } from 'vitest';
import {
  BEACON_STOPPED,
  beaconStep,
  type BeaconEvent,
  type BeaconState,
} from '../../src/logic/beacon-machine';

function run(state: BeaconState, ...events: BeaconEvent[]) {
  let s = state;
  const commands: Array<'screech' | null> = [];
  for (const e of events) {
    const out = beaconStep(s, e);
    s = out.state;
    commands.push(out.command);
  }
  return { state: s, commands };
}

describe('beacon-machine', () => {
  it('sends the first screech at once after start', () => {
    const { state, commands } = run(
      BEACON_STOPPED,
      { type: 'start', now: 1000 },
      { type: 'tick', now: 1000 },
    );
    expect(commands).toEqual([null, 'screech']);
    expect(state).toMatchObject({ kind: 'running', nextDueAt: 1000 });
  });

  it('waits while a screech is still playing at the due time', () => {
    const { commands, state } = run(
      BEACON_STOPPED,
      { type: 'start', now: 0 },
      { type: 'screechStarted', now: 0, random: 0 },
      { type: 'tick', now: 15000 },
      { type: 'tick', now: 16000 },
      { type: 'screechEnded', now: 16000 },
      { type: 'tick', now: 16250 },
    );
    expect(commands).toEqual([null, null, null, null, null, 'screech']);
    expect(state).toMatchObject({ kind: 'running', playing: false });
  });

  it('sends exactly one screech after the page was hidden for 10 minutes', () => {
    const { commands } = run(
      BEACON_STOPPED,
      { type: 'start', now: 0 },
      { type: 'screechStarted', now: 0, random: 0 },
      { type: 'screechEnded', now: 5000 },
      { type: 'visible', now: 600_000 },
      { type: 'screechStarted', now: 600_000, random: 0 },
      { type: 'screechEnded', now: 605_000 },
      { type: 'tick', now: 600_250 },
      { type: 'visible', now: 601_000 },
    );
    expect(commands.filter((c) => c === 'screech')).toEqual(['screech']);
    expect(commands[3]).toBe('screech');
  });

  it('stop cancels everything until the next start', () => {
    const { commands, state } = run(
      BEACON_STOPPED,
      { type: 'start', now: 0 },
      { type: 'stop' },
      { type: 'tick', now: 99_000 },
      { type: 'visible', now: 99_000 },
      { type: 'wakeSucceeded', now: 99_000 },
    );
    expect(commands).toEqual([null, null, null, null, null]);
    expect(state).toEqual(BEACON_STOPPED);
  });

  it('a builder skip keeps the schedule: the next try is one interval later', () => {
    const { state, commands } = run(
      BEACON_STOPPED,
      { type: 'start', now: 0 },
      { type: 'screechSkipped', now: 0, random: 0.5 },
      { type: 'tick', now: 17499 },
      { type: 'tick', now: 17500 },
    );
    expect(state).toMatchObject({ nextDueAt: 17500, playing: false });
    expect(commands).toEqual([null, null, null, 'screech']);
  });

  it('wakeSucceeded screeches only from quiet', () => {
    const base = run(BEACON_STOPPED, { type: 'start', now: 0 }).state;
    expect(beaconStep(base, { type: 'wakeSucceeded', now: 1 }).command).toBeNull();
    const quiet = beaconStep(base, { type: 'contextFailed' }).state;
    expect(beaconStep(quiet, { type: 'tick', now: 5 }).command).toBeNull();
    const woke = beaconStep(quiet, { type: 'wakeSucceeded', now: 5 });
    expect(woke.command).toBe('screech');
    expect(woke.state).toMatchObject({ quiet: false });
  });
});
