import type { Config } from '@netlify/functions';
import { runCleanup } from '../../src/seance-cleanup.js';
import { createBlobsStore } from '../../src/seance-store.js';

export default async (): Promise<void> => {
  await runCleanup({ store: createBlobsStore({ now: () => Date.now() }), now: () => Date.now() });
};

export const config: Config = { schedule: '@hourly' };
