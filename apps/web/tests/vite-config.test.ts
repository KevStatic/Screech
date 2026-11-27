import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Requirements 18.2, 18.3: the self-signed HTTPS plugin runs for plain `vite`
// and is left out under `netlify dev` (NETLIFY_DEV set).

const SSL_PLUGIN = 'vite:basic-ssl';

async function loadPluginNames(): Promise<string[]> {
  vi.resetModules();
  const mod = await import('../vite.config');
  const config = mod.default as { plugins?: unknown[] };
  const names: string[] = [];
  const visit = (p: unknown): void => {
    if (Array.isArray(p)) p.forEach(visit);
    else if (p && typeof p === 'object' && 'name' in p) names.push(String((p as { name: unknown }).name));
  };
  (config.plugins ?? []).forEach(visit);
  return names;
}

describe('vite.config NETLIFY_DEV handling', () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env.NETLIFY_DEV;
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.NETLIFY_DEV;
    else process.env.NETLIFY_DEV = saved;
    vi.resetModules();
  });

  it('includes the basicSsl plugin when NETLIFY_DEV is unset', async () => {
    delete process.env.NETLIFY_DEV;
    expect(await loadPluginNames()).toContain(SSL_PLUGIN);
  });

  it('omits the basicSsl plugin when NETLIFY_DEV is set', async () => {
    process.env.NETLIFY_DEV = 'true';
    const names = await loadPluginNames();
    expect(names).not.toContain(SSL_PLUGIN);
    expect(names.length).toBeGreaterThan(0);
  });
});
