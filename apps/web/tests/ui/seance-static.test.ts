// @vitest-environment node
// Feature: seance, task 11.9: static source scans (Requirements 18.3, 19.4)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcUrl = (rel: string): URL => new URL(`../../src/${rel}`, import.meta.url);

/** Drops block and line comments so prose in a comment cannot trip a scan. */
function code(rel: string): string {
  const text = readFileSync(fileURLToPath(srcUrl(rel)), 'utf8');
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

const SEANCE_UI_FILES: readonly string[] = [
  'ui/screens/Join.tsx',
  'ui/screens/Lit.tsx',
  'ui/screens/SeanceHost.tsx',
  'ui/components/CandleCircle.tsx',
  'ui/components/SeanceControl.tsx',
  'ui/hooks/useJoin.ts',
  'ui/hooks/useSeanceHost.ts',
];

describe('seance UI renders Title and names as text only (19.4)', () => {
  for (const rel of SEANCE_UI_FILES) {
    it(`${rel} has no dangerouslySetInnerHTML, innerHTML, outerHTML or insertAdjacentHTML`, () => {
      const text = code(rel);
      expect(text).not.toMatch(/dangerouslySetInnerHTML/);
      expect(text).not.toMatch(/\.(inner|outer)HTML\b/);
      expect(text).not.toMatch(/insertAdjacentHTML/);
      expect(text).not.toMatch(/document\.write/);
    });
  }
});

describe('Checkin_API URLs are relative (18.3)', () => {
  const text = code('logic/checkin-client.ts');

  it('checkin-client.ts has no http://, https://, protocol-relative or localhost host', () => {
    expect(text).not.toMatch(/https?:\/\//i);
    expect(text).not.toMatch(/['"`]\/\/[a-z0-9]/i);
    expect(text).not.toMatch(/localhost/i);
    expect(text).not.toMatch(/127\.0\.0\.1/);
  });

  it('every API path literal starts with /api/', () => {
    const paths = [...text.matchAll(/path:\s*([`'"])([^`'"]*)\1/g)].map((m) => m[2] ?? '');
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) expect(p.startsWith('/api/') || p.startsWith('${base(')).toBe(true);
    expect(text).toMatch(/`\/api\/seance\/\$\{encodeURIComponent\(id\)\}`/);
  });

  it('the seance hooks and screens add no host of their own', () => {
    for (const rel of SEANCE_UI_FILES) {
      expect(code(rel), rel).not.toMatch(/https?:\/\/|localhost/i);
    }
  });
});

describe('Join and Lit make no sound (13.11)', () => {
  const SILENT: readonly string[] = [
    'ui/screens/Join.tsx',
    'ui/screens/Lit.tsx',
    'ui/hooks/useJoin.ts',
  ];
  for (const rel of SILENT) {
    it(`${rel} imports no audio, haunt or sound module and builds no audio object`, () => {
      const text = code(rel);
      expect(text).not.toMatch(/from\s+['"][^'"]*(\/audio\/|haunt|useSound|sound-pref|transmit)/);
      expect(text).not.toMatch(/\bAudioContext\b|\bnew Audio\b|\bOscillator|\bhauntPlayer\b|\buseHaunt\b/);
    });
  }
});
