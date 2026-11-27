import type { Config, Context } from '@netlify/functions';
import { handlePublic } from '../../src/seance-public.js';
import { createBlobsStore } from '../../src/seance-store.js';

export default async (req: Request, context: Context): Promise<Response> =>
  handlePublic(req, context.params.id, { store: createBlobsStore({ now: () => Date.now() }), now: () => Date.now() });

export const config: Config = { path: '/api/seance/:id/public', method: 'GET' };
