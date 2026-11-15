import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  INITIAL_FLOW_STATE,
  MAX_MIC_ATTEMPTS,
  NOTICE_LISTEN_BLOCKED,
  NOTICE_SEND_BLOCKED,
  canListen,
  canTransmit,
  flowReducer,
  type FlowEvent,
  type MicStatus,
} from '../../src/logic/flow';

const micStatus: fc.Arbitrary<MicStatus> = fc.constantFrom(
  'unprobed',
  'granted',
  'blocked',
  'denied',
  'insecure-context',
  'no-getusermedia',
  'skipped',
);

const flowEvent: fc.Arbitrary<FlowEvent> = fc.oneof(
  // Weight toward the events that move between screens.
  { weight: 3, arbitrary: fc.constant<FlowEvent>({ type: 'openListen' }) },
  { weight: 3, arbitrary: fc.constant<FlowEvent>({ type: 'startTransmit' }) },
  { weight: 3, arbitrary: micStatus.map((status): FlowEvent => ({ type: 'micResult', status })) },
  { weight: 2, arbitrary: fc.boolean().map((contextRunning): FlowEvent => ({ type: 'holdFired', contextRunning })) },
  { weight: 2, arbitrary: fc.constant<FlowEvent>({ type: 'retryMic' }) },
  { weight: 2, arbitrary: fc.constant<FlowEvent>({ type: 'transmitEnded' }) },
  { weight: 1, arbitrary: fc.constant<FlowEvent>({ type: 'unlocked' }) },
  { weight: 1, arbitrary: fc.constant<FlowEvent>({ type: 'continueWithoutListening' }) },
  { weight: 1, arbitrary: fc.constant<FlowEvent>({ type: 'leaveListen' }) },
  { weight: 1, arbitrary: fc.constant<FlowEvent>({ type: 'wakeTapped' }) },
  { weight: 1, arbitrary: fc.constantFrom<'speak' | 'listen'>('speak', 'listen').map((target): FlowEvent => ({ type: 'back', target })) },
  { weight: 1, arbitrary: fc.constant<FlowEvent>({ type: 'inputEdited' }) },
  { weight: 1, arbitrary: fc.constant<FlowEvent>({ type: 'cardSelected' }) },
  { weight: 1, arbitrary: fc.constant<FlowEvent>({ type: 'received', state: { kind: 'ignore' } }) },
  { weight: 1, arbitrary: fc.constant<FlowEvent>({ type: 'received', state: { kind: 'garbled' } as never }) },
);

describe('flow reducer properties', () => {
  // Feature: spirit-box-app, Property 25: Sending and listening never overlap
  // **Validates: Requirements 15.5, 15.6, 15.7, 15.8**
  it('never transmits and listens at once, and blocks the other side with a notice', () => {
    fc.assert(
      fc.property(fc.array(flowEvent, { maxLength: 60 }), (events) => {
        let state = INITIAL_FLOW_STATE;
        for (const event of events) {
          const prev = state;
          state = flowReducer(prev, event);

          expect(state.transmitting && state.listening).toBe(false);
          expect(canTransmit(state)).toBe(!state.listening && !state.transmitting);
          expect(canListen(state)).toBe(state.mic === 'granted' && !state.transmitting);
          if (state.listening) expect(canTransmit(state)).toBe(false);
          expect(state.micAttempts).toBeLessThanOrEqual(MAX_MIC_ATTEMPTS);

          if (event.type === 'openListen' && prev.transmitting) {
            expect(state.transmitting).toBe(prev.transmitting);
            expect(state.listening).toBe(prev.listening);
            expect(state.notice).toBe(NOTICE_LISTEN_BLOCKED);
          }
          if (event.type === 'startTransmit' && prev.listening) {
            expect(state.transmitting).toBe(prev.transmitting);
            expect(state.listening).toBe(prev.listening);
            expect(state.notice).toBe(NOTICE_SEND_BLOCKED);
          }
        }
      }),
      { numRuns: 300 },
    );
  });
});
