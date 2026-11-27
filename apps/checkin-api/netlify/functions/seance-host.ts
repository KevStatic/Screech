import type { Config, Context } from '@netlify/functions';
import { handleHost } from '../../src/seance-host.js';
import { createBlobsStore } from '../../src/seance-store.js';

export default async (req: Request, context: Context): Promise<Response> =>
  handleHost(req, context.params.id, { store: createBlobsStore({ now: () => Date.now() }), now: () => Date.now() });

export const config: Config = { path: '/api/seance/:id', method: 'GET' };
