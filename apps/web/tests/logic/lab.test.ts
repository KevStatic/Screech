import { describe, expect, it } from 'vitest';
import { LAB_DEFAULTS, LAB_PROTOCOLS, LAB_VOLUMES, isLabEnabled } from '../../src/logic/lab';
import { TRANSMIT_VOLUME } from '../../src/audio/constants';

describe('range lab', () => {
  it('is on only for ?lab=1', () => {
    expect(isLabEnabled('?lab=1')).toBe(true);
    expect(isLabEnabled('?x=2&lab=1')).toBe(true);
    for (const s of ['', '?', '?lab=0', '?lab=true', '?lab=', '?lab=11', '?laboratory=1']) {
      expect(isLabEnabled(s), s).toBe(false);
    }
  });
  it('defaults match the product defaults', () => {
    expect(LAB_DEFAULTS).toEqual({ volume: TRANSMIT_VOLUME, protocol: 'fast' });
    expect([...LAB_VOLUMES]).toEqual([50, 75, 100]);
    expect([...LAB_PROTOCOLS]).toEqual(['fast', 'normal']);
  });
});
