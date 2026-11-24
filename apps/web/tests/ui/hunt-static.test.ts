// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** Ghost Hunt source files, relative to apps/web/src. */
const HUNT_FILES: readonly string[] = [
  'audio/wake-lock.ts',
  'logic/airtime.ts',
  'logic/beacon-machine.ts',
  'logic/beacon-schedule.ts',
  'logic/hunt-found.ts',
  'logic/hunt-id.ts',
  'logic/hunt-link.ts',
  'logic/hunt-note.ts',
  'logic/hunt-progress.ts',
  'logic/hunt-route.ts',
  'logic/hunt-setup.ts',
  'logic/qr-cards.ts',
  'logic/qr-layout.ts',
  'logic/riddle-packs.ts',
  'ui/components/AlreadyNote.tsx',
  'ui/components/ByteCounter.tsx',
  'ui/components/PackConfirm.tsx',
  'ui/components/QrCard.tsx',
  'ui/components/SetupQr.tsx',
  'ui/components/SpiritCounter.tsx',
  'ui/hooks/listen-handoff.ts',
  'ui/hooks/progress-store.ts',
  'ui/hooks/useBeacon.ts',
  'ui/hooks/useSpelling.ts',
  'ui/screens/Beacon.tsx',
  'ui/screens/BeaconError.tsx',
  'ui/screens/HuntComplete.tsx',
  'ui/screens/HuntReveal.tsx',
  'ui/screens/HuntSetup.tsx',
];

const srcUrl = (rel: string): URL => new URL(`../../src/${rel}`, import.meta.url);

/** Removes block and line comments and keeps line breaks. String contents stay. */
function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

const sources: ReadonlyArray<{ file: string; code: string }> = HUNT_FILES.map((file) => ({
  file,
  code: existsSync(fileURLToPath(srcUrl(file)))
    ? stripComments(readFileSync(fileURLToPath(srcUrl(file)), 'utf8'))
    : '',
}));

function offenders(pattern: RegExp, only?: (file: string) => boolean): string[] {
  return sources
    .filter(({ file }) => (only ? only(file) : true))
    .filter(({ code }) => pattern.test(code))
    .map(({ file }) => file);
}

describe('Ghost Hunt static checks', () => {
  it('every listed Ghost Hunt source file exists', () => {
    const missing = HUNT_FILES.filter((f) => !existsSync(fileURLToPath(srcUrl(f))));
    expect(missing).toEqual([]);
  });

  it('makes no network calls (fetch, XMLHttpRequest, sendBeacon)', () => {
    expect(offenders(/\bfetch\s*\(|\bXMLHttpRequest\b|\bsendBeacon\b/)).toEqual([]);
  });

  it('never uses the any type', () => {
    const anyType = /:\s*any\b|\bas\s+any\b|<\s*any\s*[,>]|\bany\s*\[\]|\bArray<any>|=\s*any\b/;
    expect(offenders(anyType)).toEqual([]);
  });

  it('imports qrcode only in SetupQr.tsx', () => {
    const qrImport = /from\s+['"]qrcode['"]|require\(\s*['"]qrcode['"]\s*\)|import\(\s*['"]qrcode['"]\s*\)/;
    const found = offenders(qrImport);
    expect(found).toEqual(['ui/components/SetupQr.tsx']);
  });

  it('hunt-progress.ts takes storage as a parameter and reads no global localStorage', () => {
    const entry = sources.find((s) => s.file === 'logic/hunt-progress.ts');
    expect(entry).toBeDefined();
    const code = entry?.code ?? '';
    expect(code).not.toMatch(/\blocalStorage\b|\bsessionStorage\b|\bwindow\b|\bglobalThis\b/);
    expect(code).toMatch(/createProgressStore\s*\(\s*\w+\s*:\s*StorageLike\s*\|\s*null/);
  });
});
