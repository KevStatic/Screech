import type { Config, Context } from '@netlify/functions';
import { handleEnd } from '../../src/seance-end.js';
import { createBlobsStore } from '../../src/seance-store.js';

export default async (req: Request, context: Context): Promise<Response> =>
  handleEnd(req, context.params.id, { store: createBlobsStore({ now: () => Date.now() }), now: () => Date.now() });

export const config: Config = { path: '/api/seance/:id/end', method: 'POST' };
