import type { Config, Context } from '@netlify/functions';
import { handleCreate } from '../../src/seance-create.js';
import { createBlobsStore } from '../../src/seance-store.js';

export default async (req: Request, _context: Context): Promise<Response> =>
  handleCreate(req, { store: createBlobsStore({ now: () => Date.now() }), now: () => Date.now() });

export const config: Config = { path: '/api/seance', method: 'POST' };
