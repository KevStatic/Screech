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

  describe('haunting sounds', () => {
    /** Drops block and line comments so prose such as "Hann windows" cannot trip a check. */
    function stripComments(source: string): string {
      return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
    }

    const HAUNT_NAME = /^(haunt-.*|sound-pref|sound-hint|useHaunt|useSoundHint|useSoundPref|SoundHint|SoundToggle)\.tsx?$/;
    const MOTION_NAME = /^(motion|useMotion|ExorciseToggle)\.tsx?$/;
    const PURE_NAME = /^(haunt-dsp|haunt-synth|haunt-check|haunt-rules|sound-pref|sound-hint)\.ts$/;

    const all = walk(SRC);
    const baseName = (file: string): string => file.slice(file.lastIndexOf('/') + 1);
    const hauntFiles = all.filter((f) => HAUNT_NAME.test(baseName(f)));
    const motionFiles = all.filter((f) => MOTION_NAME.test(baseName(f)));
    const pureFiles = all.filter(
      (f) => PURE_NAME.test(baseName(f)) && (isInside(f, LOGIC) || isInside(f, AUDIO)),
    );

    function importsOf(file: string, targets: readonly string[]): string[] {
      const hits: string[] = [];
      for (const spec of specifiers(stripComments(readFileSync(file, 'utf8')))) {
        if (!spec.startsWith('.')) continue;
        const target = resolveRelative(file, spec);
        if (target !== null && targets.includes(target)) hits.push(`${rel(file)} imports ${rel(target)}`);
      }
      return hits;
    }

    it('finds the haunt, motion and pure files it is meant to guard', () => {
      expect(hauntFiles.map(baseName)).toEqual(
        expect.arrayContaining([
          'haunt-dsp.ts', 'haunt-synth.ts', 'haunt-check.ts', 'haunt-rules.ts', 'haunt-player.ts',
          'sound-pref.ts', 'sound-hint.ts', 'useHaunt.ts', 'useSoundHint.ts', 'useSoundPref.ts',
          'SoundHint.tsx', 'SoundToggle.tsx',
        ]),
      );
      expect(motionFiles.map(baseName)).toEqual(
        expect.arrayContaining(['motion.ts', 'useMotion.ts', 'ExorciseToggle.tsx']),
      );
      expect(pureFiles).toHaveLength(6);
    });

    it('haunt files never import motion files, and motion files never import haunt files', () => {
      const offenders = [
        ...hauntFiles.flatMap((f) => importsOf(f, motionFiles)),
        ...motionFiles.flatMap((f) => importsOf(f, hauntFiles)),
      ];
      expect(offenders).toEqual([]);
    });

    it('pure haunt files use no Math.random, Date, performance, document or window', () => {
      const FORBIDDEN = /\bMath\.random\b|\bDate\b|\bperformance\b|\bdocument\b|\bwindow\b/;
      const offenders: string[] = [];
      for (const file of pureFiles) {
        const m = FORBIDDEN.exec(stripComments(readFileSync(file, 'utf8')));
        if (m !== null) offenders.push(`${rel(file)} uses "${m[0]}"`);
      }
      expect(offenders).toEqual([]);
    });

    it('haunt files use no `any` type', () => {
      const ANY = /:\s*any\b|\bas\s+any\b|<any\b|\bany\s*\[\]|,\s*any\s*[,>)]/;
      const offenders: string[] = [];
      for (const file of hauntFiles) {
        const m = ANY.exec(stripComments(readFileSync(file, 'utf8')));
        if (m !== null) offenders.push(`${rel(file)} contains "${m[0]}"`);
      }
      expect(offenders).toEqual([]);
    });

    it('src references no .mp3, .wav, .ogg or .m4a audio file', () => {
      const AUDIO_FILE = /\.(mp3|wav|ogg|m4a)(?=['"`?#\s])/i;
      const offenders: string[] = [];
      for (const file of all) {
        const source = stripComments(readFileSync(file, 'utf8'));
        const spec = specifiers(source).find((s) => AUDIO_FILE.test(s + ' '));
        if (spec !== undefined) offenders.push(`${rel(file)} imports "${spec}"`);
        else {
          const m = /['"`][^'"`\n]*\.(mp3|wav|ogg|m4a)['"`]/i.exec(source);
          if (m !== null) offenders.push(`${rel(file)} references ${m[0]}`);
        }
      }
      expect(offenders).toEqual([]);
    });
  });

  it('package.json pins ggwave to 0.4.0 and @screech/core to workspace:*', () => {
    const pkg = JSON.parse(readFileSync(join(WEB_ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.['ggwave']).toBe('0.4.0');
    expect(pkg.dependencies?.['@screech/core']).toBe('workspace:*');
  });
});
