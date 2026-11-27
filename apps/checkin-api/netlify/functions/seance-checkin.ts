import type { Config, Context } from '@netlify/functions';
import { handleCheckin } from '../../src/seance-checkin.js';
import { createBlobsStore } from '../../src/seance-store.js';

export default async (req: Request, context: Context): Promise<Response> =>
  handleCheckin(req, context.params.id, { store: createBlobsStore({ now: () => Date.now() }), now: () => Date.now() });

export const config: Config = { path: '/api/seance/:id/checkin', method: 'POST' };
