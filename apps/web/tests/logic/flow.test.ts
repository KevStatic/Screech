import { describe, it, expect } from 'vitest';
import {
  INITIAL_FLOW_STATE,
  MAX_MIC_ATTEMPTS,
  NOTICE_LISTEN_BLOCKED,
  NOTICE_SEND_BLOCKED,
  canListen,
  flowReducer,
  listenUnavailableReason,
  micStatusForFailure,
  type FlowEvent,
  type FlowState,
} from '../../src/logic/flow';
import type { HuntNavIntake } from '../../src/logic/hunt-route';
import { MIC_BLOCKED_MESSAGE } from '../../src/audio/mic';

describe('blocked mic status', () => {
  it('maps mic failure reasons to flow statuses', () => {
    expect(micStatusForFailure('blocked')).toBe('blocked');
    expect(micStatusForFailure('denied')).toBe('denied');
    expect(micStatusForFailure('unavailable')).toBe('denied');
  });

  it('stores blocked on the awaken screen and stays there', () => {
    const s = flowReducer(INITIAL_FLOW_STATE, { type: 'micResult', status: 'blocked' });
    expect(s.mic).toBe('blocked');
    expect(s.screen).toBe('awaken');
  });

  it('blocked can continue to Speak as skipped', () => {
    const s = run(INITIAL_FLOW_STATE, { type: 'micResult', status: 'blocked' }, { type: 'continueWithoutListening' });
    expect(s.screen).toBe('speak');
    expect(s.mic).toBe('skipped');
  });

  it('Listen-unavailable reason is MIC_BLOCKED_MESSAGE for blocked only', () => {
    const blockedState: FlowState = { ...INITIAL_FLOW_STATE, screen: 'speak', mic: 'blocked' };
    expect(canListen(blockedState)).toBe(false);
    expect(listenUnavailableReason(blockedState)).toBe(MIC_BLOCKED_MESSAGE);
    expect(listenUnavailableReason({ ...blockedState, mic: 'denied' })).toBeNull();
    expect(listenUnavailableReason({ ...blockedState, mic: 'granted' })).toBeNull();
  });
});

const speak: FlowState = { ...INITIAL_FLOW_STATE, screen: 'speak', mic: 'granted' };

function run(state: FlowState, ...events: FlowEvent[]): FlowState {
  return events.reduce(flowReducer, state);
}

describe('flow notices', () => {
  it('blocks listening while transmitting', () => {
    const s = run(speak, { type: 'startTransmit' }, { type: 'openListen' });
    expect(s.notice).toBe('Listening is unavailable until the transmission ends.');
    expect(s.notice).toBe(NOTICE_LISTEN_BLOCKED);
    expect(s.listening).toBe(false);
  });

  it('blocks sending while listening', () => {
    const s = run(speak, { type: 'openListen' }, { type: 'startTransmit' });
    expect(s.notice).toBe('Sending is unavailable while listening.');
    expect(s.notice).toBe(NOTICE_SEND_BLOCKED);
    expect(s.transmitting).toBe(false);
  });
});

describe('mic retry cap', () => {
  it('stops counting after 3 retries', () => {
    const denied: FlowState = { ...INITIAL_FLOW_STATE, mic: 'denied' };
    let s = denied;
    for (let i = 0; i < 5; i++) s = run(s, { type: 'retryMic' }, { type: 'micResult', status: 'denied' });
    expect(s.micAttempts).toBe(MAX_MIC_ATTEMPTS);
    expect(MAX_MIC_ATTEMPTS).toBe(3);
    expect(s.mic).toBe('denied');
  });
});

describe('wake flow', () => {
  it('holdFired(false) sets wakePending without changing screen or transmitting', () => {
    const s = run(speak, { type: 'holdFired', contextRunning: false });
    expect(s.wakePending).toBe(true);
    expect(s.screen).toBe('speak');
    expect(s.transmitting).toBe(false);
  });

  it('holdFired(true) starts transmit with wakePending false', () => {
    const s = run(speak, { type: 'holdFired', contextRunning: true });
    expect(s.screen).toBe('screeching');
    expect(s.transmitting).toBe(true);
    expect(s.wakePending).toBe(false);
  });

  it('wakeTapped after holdFired(false) starts transmit and clears wakePending', () => {
    const s = run(speak, { type: 'holdFired', contextRunning: false }, { type: 'wakeTapped' });
    expect(s.screen).toBe('screeching');
    expect(s.transmitting).toBe(true);
    expect(s.wakePending).toBe(false);
  });

  it.each<FlowEvent>([{ type: 'inputEdited' }, { type: 'cardSelected' }, { type: 'openListen' }])(
    '$type clears wakePending',
    (event) => {
      const s = run(speak, { type: 'holdFired', contextRunning: false }, event);
      expect(s.wakePending).toBe(false);
    },
  );
});

describe('ghost hunt flow', () => {
  const fields = { huntId: 'ABCDEF', total: 3, index: 1, name: 'Ghost', clue: 'Look up' };
  const open = { huntId: 'ABCDEF', total: 3, found: [{ index: 1, name: 'Ghost' }], firstFoundAt: 1, completedAt: null };
  const done = { ...open, found: [1, 2, 3].map((index) => ({ index, name: 'Ghost' })), completedAt: 9 };
  const newIntake = (state: typeof open): HuntNavIntake => ({
    kind: 'new',
    fields,
    before: { ...open, found: [], firstFoundAt: null },
    state,
    persisted: true,
  });

  it('openHuntSetup works from awaken without a granted mic', () => {
    const s = run(INITIAL_FLOW_STATE, { type: 'openHuntSetup' });
    expect(s.screen).toBe('hunt-setup');
    expect(s.huntReturn).toBe('awaken');
    expect(s.mic).toBe('unprobed');
  });

  it('openHuntSetup works from speak without a granted mic and closeHuntSetup returns', () => {
    const noMic: FlowState = { ...INITIAL_FLOW_STATE, screen: 'speak', mic: 'skipped' };
    const s = run(noMic, { type: 'openHuntSetup' });
    expect(s.screen).toBe('hunt-setup');
    expect(s.huntReturn).toBe('speak');
    expect(run(s, { type: 'closeHuntSetup' }).screen).toBe('speak');
  });

  it('openHuntSetup is ignored while transmitting', () => {
    const t = run(speak, { type: 'startTransmit' });
    expect(flowReducer(t, { type: 'openHuntSetup' })).toBe(t);
  });

  it('openHuntSetup is ignored while listening', () => {
    const l = run(speak, { type: 'openListen' });
    expect(flowReducer(l, { type: 'openHuntSetup' })).toBe(l);
  });

  it('huntReceived routes new to hunt-reveal and stops listening', () => {
    const l = run(speak, { type: 'openListen' });
    const s = run(l, { type: 'huntReceived', intake: newIntake(open) });
    expect(s.screen).toBe('hunt-reveal');
    expect(s.listening).toBe(false);
    expect(s.hunt?.kind).toBe('new');
  });

  it('huntReceived routes complete to hunt-complete', () => {
    const s = run(speak, { type: 'huntReceived', intake: { kind: 'complete', fields, state: done } });
    expect(s.screen).toBe('hunt-complete');
  });

  it('huntRevealDone stays on hunt-reveal until the last Spirit', () => {
    const mid = run(speak, { type: 'huntReceived', intake: newIntake(open) });
    expect(run(mid, { type: 'huntRevealDone' }).screen).toBe('hunt-reveal');
    const last = run(speak, { type: 'huntReceived', intake: newIntake(done) });
    expect(run(last, { type: 'huntRevealDone' }).screen).toBe('hunt-complete');
  });

  it('huntBack and huntRestart leave the hunt screens', () => {
    const s = run(speak, { type: 'huntReceived', intake: { kind: 'complete', fields, state: done } });
    expect(run(s, { type: 'huntBack', target: 'speak' })).toMatchObject({ screen: 'speak', hunt: null });
    expect(run(s, { type: 'huntBack', target: 'listen' })).toMatchObject({ screen: 'listen', listening: true });
    expect(run(s, { type: 'huntRestart' })).toMatchObject({ screen: 'listen', hunt: null });
  });
});
