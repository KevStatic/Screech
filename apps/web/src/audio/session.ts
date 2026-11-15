export type UnlockFailure = 'context-unavailable' | 'resume-rejected' | 'not-running';
export type UnlockOutcome =
  | { readonly ok: true; readonly ctx: AudioContext; readonly sampleRate: number }
  | { readonly ok: false; readonly reason: UnlockFailure };

type AudioContextCtor = new () => AudioContext;

interface AudioGlobals {
  readonly AudioContext?: AudioContextCtor;
  readonly webkitAudioContext?: AudioContextCtor;
}

let ctx: AudioContext | null = null;

/** The current context, or null when none has been created. Never creates one. */
export function currentContext(): AudioContext | null {
  return ctx;
}

/** Creates the context (with the webkit fallback), replacing a closed one. Sync. */
export function getOrCreateContext(): AudioContext {
  if (ctx !== null && ctx.state !== 'closed') return ctx;
  const g = globalThis as unknown as AudioGlobals;
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  if (Ctor === undefined) throw new Error('Web Audio is not available');
  ctx = new Ctor();
  return ctx;
}

/** Call only from inside a click, keydown, pointerup or touchend handler. Not async on purpose. */
export function unlockAudio(): Promise<UnlockOutcome> {
  let c: AudioContext;
  let resumed: Promise<void>;
  try {
    c = getOrCreateContext();
    resumed = c.state === 'running' ? Promise.resolve() : c.resume();
  } catch {
    return Promise.resolve({ ok: false, reason: 'context-unavailable' });
  }
  return settle(c, resumed);
}

async function settle(c: AudioContext, resumed: Promise<void>): Promise<UnlockOutcome> {
  try {
    await resumed;
  } catch {
    return { ok: false, reason: 'resume-rejected' };
  }
  if (c.state !== 'running') return { ok: false, reason: 'not-running' };
  return { ok: true, ctx: c, sampleRate: c.sampleRate };
}

/** Keep-alive for gesture handlers. Resumes an existing, non-running context. */
export function ensureRunning(): Promise<void> {
  const c = currentContext();
  if (c === null || c.state === 'running' || c.state === 'closed') return Promise.resolve();
  return c.resume().catch(() => undefined);
}

/** Synchronous, gesture-free check. Never resumes or creates. */
export function isRunning(): boolean {
  return ctx?.state === 'running';
}

/** Test helper: forgets the cached context. */
export function __resetSessionForTests(): void {
  ctx = null;
}
