import { describe, expect, it, vi } from 'vitest';
import type { Store } from '@netlify/blobs';
import { createBlobsStore } from '../src/seance-store.js';
import { CHECKIN_STORE_NAME, SEANCE_STORE_NAME } from '../src/seance.js';

describe('createBlobsStore', () => {
  it('opens both Blobs stores with strong consistency', () => {
    const getStore = vi.fn((_options: { name: string; consistency: 'strong' }) => ({}) as Store);
    createBlobsStore({ now: () => 0, getStore });
    expect(getStore).toHaveBeenCalledTimes(2);
    expect(getStore).toHaveBeenCalledWith({ name: SEANCE_STORE_NAME, consistency: 'strong' });
    expect(getStore).toHaveBeenCalledWith({ name: CHECKIN_STORE_NAME, consistency: 'strong' });
  });
});
