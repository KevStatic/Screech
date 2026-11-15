import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(WEB_ROOT, 'src');
const LOGIC = join(SRC, 'logic');
const AUDIO = join(SRC, 'audio');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(full);
  }
  return out;
}

function rel(path: string): string {
  return relative(WEB_ROOT, path);
}

const IMPORT_RE =
  /(?:\bimport|\bexport)\s+(?:type\s+)?(?:[^'"`;]*?\sfrom\s+)?['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

function specifiers(source: string): string[] {
  const found: string[] = [];
  for (const m of source.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2];
    if (spec !== undefined) found.push(spec);
  }
  return found;
}

function resolveRelative(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

const BAD_PACKAGE = /^(react|react-dom|ggwave)(\/|$)/;
const BROWSER_AUDIO_API =
  /\b(AudioContext|webkitAudioContext|AudioWorklet\w*|AnalyserNode|MediaStream\w*)\b|navigator\.mediaDevices/;

function isInside(path: string, dir: string): boolean {
  return path === dir || path.startsWith(dir + '/');
}

/** Returns "module -> reason" for every violation reachable from the logic modules. */
function logicViolations(): string[] {
  const violations: string[] = [];
  const seen = new Set<string>();
  const queue = walk(LOGIC);
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    const api = BROWSER_AUDIO_API.exec(source);
    if (api !== null) violations.push(`${rel(file)} mentions browser audio API "${api[0]}"`);
    for (const spec of specifiers(source)) {
      if (spec.startsWith('.')) {
        const target = resolveRelative(file, spec);
        if (target === null) continue;
        if (isInside(target, AUDIO)) violations.push(`${rel(file)} imports src/audio (${spec})`);
        else queue.push(target);
      } else if (BAD_PACKAGE.test(spec)) {
        violations.push(`${rel(file)} imports "${spec}"`);
      }
    }
  }
  return violations;
}

describe('architecture', () => {
  it('src/logic never reaches react, react-dom, ggwave, src/audio or a browser audio API', () => {
    expect(walk(LOGIC).length).toBeGreaterThan(0);
    expect(logicViolations()).toEqual([]);
  });

  it('src/audio imports no React', () => {
    const offenders: string[] = [];
    for (const file of walk(AUDIO)) {
      for (const spec of specifiers(readFileSync(file, 'utf8'))) {
        if (/^react(-dom)?(\/|$)/.test(spec)) offenders.push(`${rel(file)} imports "${spec}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('src has no 44100 or 48000 literal', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      if (/\b(44100|48000|44_100|48_000)\b/.test(readFileSync(file, 'utf8'))) offenders.push(rel(file));
    }
    expect(offenders).toEqual([]);
  });

  it('TRANSMIT_VOLUME and its value 50 are defined once', () => {
    const declarations: string[] = [];
    const fifties: string[] = [];
    for (const file of walk(SRC)) {
      const source = readFileSync(file, 'utf8');
      for (const m of source.matchAll(/\b(?:const|let|var)\s+TRANSMIT_VOLUME\b/g)) {
        declarations.push(`${rel(file)}@${m.index}`);
      }
      for (const m of source.matchAll(/\bdefineTransmitVolume\(\s*50\s*\)/g)) {
        fifties.push(`${rel(file)}@${m.index}`);
      }
    }
    expect(declarations).toHaveLength(1);
    expect(fifties).toHaveLength(1);
    expect(declarations[0]?.startsWith(rel(join(AUDIO, 'constants.ts')))).toBe(true);
  });

  it('src has no `: any`, `as any` or `<any>`', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const m = /:\s*any\b|\bas\s+any\b|<any>/.exec(readFileSync(file, 'utf8'));
      if (m !== null) offenders.push(`${rel(file)} contains "${m[0]}"`);
    }
    expect(offenders).toEqual([]);
  });

  it('package.json pins ggwave to 0.4.0 and @screech/core to workspace:*', () => {
    const pkg = JSON.parse(readFileSync(join(WEB_ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.['ggwave']).toBe('0.4.0');
    expect(pkg.dependencies?.['@screech/core']).toBe('workspace:*');
  });
});
