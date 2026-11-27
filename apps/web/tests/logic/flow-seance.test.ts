import { describe, it, expect } from 'vitest';
import { INITIAL_FLOW_STATE, flowReducer, type FlowState, type Screen } from '../../src/logic/flow';

const at = (screen: Screen, extra: Partial<FlowState> = {}): FlowState => ({
  ...INITIAL_FLOW_STATE,
  screen,
  mic: 'granted',
  ...extra,
});

describe('seance-host flow', () => {
  // Requirements 10.1, 10.2
  it.each(['awaken', 'speak'] as const)('opens the host screen from %s and remembers the origin', (origin) => {
    const s = flowReducer(at(origin, { notice: 'old', wakePending: true }), { type: 'openSeanceHost' });
    expect(s.screen).toBe('seance-host');
    expect(s.huntReturn).toBe(origin);
    expect(s.notice).toBeNull();
    expect(s.wakePending).toBe(false);
  });

  it.each(['awaken', 'speak'] as const)('closing returns to %s', (origin) => {
    const open = flowReducer(at(origin), { type: 'openSeanceHost' });
    const closed = flowReducer(open, { type: 'closeSeanceHost' });
    expect(closed.screen).toBe(origin);
    expect(closed.notice).toBeNull();
  });

  it.each([
    'screeching',
    'listen',
    'reveal',
    'garbled',
    'sealed',
    'hunt-setup',
    'hunt-reveal',
    'hunt-complete',
    'seance-host',
  ] as const)('ignores open from %s', (screen) => {
    const state = at(screen);
    expect(flowReducer(state, { type: 'openSeanceHost' })).toBe(state);
  });

  it('is blocked while transmitting', () => {
    const state = at('speak', { transmitting: true });
    expect(flowReducer(state, { type: 'openSeanceHost' })).toBe(state);
  });

  it('is blocked while listening', () => {
    const state = at('speak', { listening: true });
    expect(flowReducer(state, { type: 'openSeanceHost' })).toBe(state);
  });

  it('close does nothing outside the host screen', () => {
    for (const screen of ['awaken', 'speak', 'listen', 'hunt-setup'] as const) {
      const state = at(screen);
      expect(flowReducer(state, { type: 'closeSeanceHost' })).toBe(state);
    }
  });

  it('does not disturb the hunt setup return screen flow', () => {
    const s = flowReducer(at('speak'), { type: 'openSeanceHost' });
    expect(flowReducer(s, { type: 'closeHuntSetup' })).toBe(s);
  });
});
