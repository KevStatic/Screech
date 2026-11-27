import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ALLOWED as CHECKIN_ALLOWED } from '../src/seance-checkin.js';
import { ALLOWED as CREATE_ALLOWED } from '../src/seance-create.js';
import { ALLOWED as END_ALLOWED } from '../src/seance-end.js';
import { ALLOWED as HOST_ALLOWED } from '../src/seance-host.js';
import { ALLOWED as PUBLIC_ALLOWED } from '../src/seance-public.js';

// Validates: Requirements 17.6, 17.11, 18.1, 18.6

interface EntryConfig {
  readonly path?: string;
  readonly method?: string | readonly string[];
  readonly schedule?: string;
}

const FUNCTIONS_DIR = fileURLToPath(new URL('../netlify/functions/', import.meta.url));

const fetchSpy = vi.fn(() => {
  throw new Error('network access at import time');
});

const configs: Record<string, EntryConfig> = {};

beforeAll(async () => {
  vi.stubGlobal('fetch', fetchSpy);
  // Only the `config` export of each entry is read; no default export is ever called.
  configs.create = (await import('../netlify/functions/seance-create.js')).config as EntryConfig;
  configs.public = (await import('../netlify/functions/seance-public.js')).config as EntryConfig;
  configs.host = (await import('../netlify/functions/seance-host.js')).config as EntryConfig;
  configs.checkin = (await import('../netlify/functions/seance-checkin.js')).config as EntryConfig;
  configs.end = (await import('../netlify/functions/seance-end.js')).config as EntryConfig;
  configs.cleanup = (await import('../netlify/functions/seance-cleanup.js')).config as EntryConfig;
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('netlify entry config', () => {
  it('does not touch the network while importing the entry modules', () => {
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['create', '/api/seance', 'POST', CREATE_ALLOWED],
    ['public', '/api/seance/:id/public', 'GET', PUBLIC_ALLOWED],
    ['host', '/api/seance/:id', 'GET', HOST_ALLOWED],
    ['checkin', '/api/seance/:id/checkin', 'POST', CHECKIN_ALLOWED],
    ['end', '/api/seance/:id/end', 'POST', END_ALLOWED],
  ] as const)('%s routes %s with %s', (name, path, method, allowed) => {
    const config = configs[name];
    expect(config?.path).toBe(path);
    expect(config?.method).toBe(method);
    expect(allowed).toEqual([config?.method]);
  });

  it('runs cleanup hourly with no HTTP route', () => {
    expect(configs.cleanup?.schedule).toBe('@hourly');
    expect(configs.cleanup?.path).toBeUndefined();
  });

  it('holds exactly the six entry files', () => {
    expect(readdirSync(FUNCTIONS_DIR).sort()).toEqual([
      'seance-checkin.ts',
      'seance-cleanup.ts',
      'seance-create.ts',
      'seance-end.ts',
      'seance-host.ts',
      'seance-public.ts',
    ]);
  });
});
