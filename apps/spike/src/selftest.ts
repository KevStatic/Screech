import { nextSenderState, open, seal } from '@screech/core';

export interface CheckResult {
  readonly name: string;
  readonly pass: boolean;
  readonly detail: string;
}

// Generated once with the node:crypto helper (tests/helpers.ts referenceSealedPacket)
// for the inputs below, which are the ones in packages/core/tests/seal.test.ts.
const KAT_KEY = Uint8Array.from({ length: 16 }, (_, i) => i + 1);
const KAT_SENDER_ID = Uint8Array.from([0xde, 0xad, 0xbe, 0xef]);
const KAT_COUNTER = 0x0102;
const KAT_MESSAGE = 'Hello, Screech!';
const KAT_EXPECTED_HEX = 'c10001deadbeef01021d86bac24d5ba5e2eccac27fdf387b33688984348d9469';

const toHex = (b: Uint8Array): string =>
  Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

async function checkRoundTrip(): Promise<CheckResult> {
  const name = 'seal + open round trip';
  const key = crypto.getRandomValues(new Uint8Array(16));
  const state = nextSenderState();
  if (!state.ok) return { name, pass: false, detail: `nextSenderState: ${state.error.code}` };
  const text = 'Screech self-test';
  const sealed = await seal({ type: 'text', text }, key, state.value.senderId, state.value.counter);
  if (!sealed.ok) return { name, pass: false, detail: `seal: ${sealed.error.code}` };
  const opened = await open(sealed.value, key);
  if (!opened.ok) return { name, pass: false, detail: `open: ${opened.error.code}` };
  const p = opened.value;
  const match = !p.multipart && p.payload.type === 'text' && p.payload.text === text;
  return { name, pass: match, detail: match ? 'text matches' : 'decoded text differs' };
}

async function checkTamper(): Promise<CheckResult> {
  const name = 'flipped bit is rejected';
  const key = crypto.getRandomValues(new Uint8Array(16));
  const state = nextSenderState();
  if (!state.ok) return { name, pass: false, detail: `nextSenderState: ${state.error.code}` };
  const sealed = await seal(
    { type: 'text', text: 'tamper me' },
    key,
    state.value.senderId,
    state.value.counter,
  );
  if (!sealed.ok) return { name, pass: false, detail: `seal: ${sealed.error.code}` };
  const bad = sealed.value.slice();
  const last = bad.length - 1;
  bad[last] = (bad[last] ?? 0) ^ 0x01;
  const opened = await open(bad, key);
  return opened.ok
    ? { name, pass: false, detail: 'open accepted a tampered packet' }
    : { name, pass: true, detail: `error: ${opened.error.code}` };
}

async function checkKnownAnswer(): Promise<CheckResult> {
  const name = 'known answer (fixed key)';
  const sealed = await seal(
    { type: 'text', text: KAT_MESSAGE },
    KAT_KEY,
    KAT_SENDER_ID,
    KAT_COUNTER,
  );
  if (!sealed.ok) return { name, pass: false, detail: `seal: ${sealed.error.code}` };
  const hex = toHex(sealed.value);
  const pass = hex === KAT_EXPECTED_HEX;
  return { name, pass, detail: pass ? 'bytes match' : `got ${hex}` };
}

export async function runSelfTest(): Promise<CheckResult[]> {
  const secure: CheckResult = {
    name: 'isSecureContext',
    pass: window.isSecureContext,
    detail: window.isSecureContext ? 'true' : 'false (HTTPS or localhost needed)',
  };
  const results: CheckResult[] = [secure];
  for (const run of [checkRoundTrip, checkTamper, checkKnownAnswer]) {
    try {
      results.push(await run());
    } catch (e) {
      results.push({ name: run.name, pass: false, detail: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}
