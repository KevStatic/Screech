import { describe, it, expect } from 'vitest';
import {
  INITIAL_FLOW_STATE,
  MAX_MIC_ATTEMPTS,
  NOTICE_LISTEN_BLOCKED,
  NOTICE_SEND_BLOCKED,
  flowReducer,
  type FlowEvent,
  type FlowState,
} from '../../src/logic/flow';

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
