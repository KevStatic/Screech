import { describe, expect, it } from 'vitest';
import { playWaveform } from '../../src/audio/transmit';

class FakeSource {
  buffer: unknown = null;
  started = 0;
  stopped = 0;
  disconnected = 0;
  startThrows = false;
  listeners = new Map<string, Set<() => void>>();
  connect(): void {}
  disconnect(): void {
    this.disconnected++;
  }
  start(): void {
    if (this.startThrows) throw new Error('nope');
    this.started++;
  }
  stop(): void {
    this.stopped++;
  }
  addEventListener(t: string, f: () => void): void {
    if (!this.listeners.has(t)) this.listeners.set(t, new Set());
    this.listeners.get(t)?.add(f);
  }
  removeEventListener(t: string, f: () => void): void {
    this.listeners.get(t)?.delete(f);
  }
  emit(t: string): void {
    for (const f of [...(this.listeners.get(t) ?? [])]) f();
  }
}

class FakeCtx {
  sampleRate = 1000;
  currentTime = 10;
  state = 'running';
  destination = {};
  source = new FakeSource();
  listeners = new Set<() => void>();
  createBuffer(_c: number, length: number): { copyToChannel(w: Float32Array, c: number): void; length: number } {
    return { length, copyToChannel: () => undefined };
  }
  createBufferSource(): FakeSource {
    return this.source;
  }
  addEventListener(_t: string, f: () => void): void {
    this.listeners.add(f);
  }
  removeEventListener(_t: string, f: () => void): void {
    this.listeners.delete(f);
  }
  changeState(s: string): void {
    this.state = s;
    for (const f of [...this.listeners]) f();
  }
}

function play(ctx: FakeCtx, samples = 2000) {
  return playWaveform(ctx as unknown as AudioContext, new Float32Array(samples));
}

describe('playWaveform', () => {
  it('computes duration from the context rate and starts the source', () => {
    const ctx = new FakeCtx();
    const h = play(ctx);
    expect(h.durationSec).toBe(2);
    expect(ctx.source.started).toBe(1);
  });

  it("resolves 'ended' on the source ended event and does not stop the source", async () => {
    const ctx = new FakeCtx();
    const h = play(ctx);
    ctx.source.emit('ended');
    expect(await h.finished).toBe('ended');
    expect(ctx.source.stopped).toBe(0);
    expect(ctx.source.disconnected).toBe(1);
    expect(ctx.listeners.size).toBe(0);
  });

  it("resolves 'stopped' on stop() and stops the source", async () => {
    const ctx = new FakeCtx();
    const h = play(ctx);
    h.stop();
    expect(await h.finished).toBe('stopped');
    expect(ctx.source.stopped).toBe(1);
  });

  it("resolves 'failed' when start throws", async () => {
    const ctx = new FakeCtx();
    ctx.source.startThrows = true;
    const h = play(ctx);
    expect(await h.finished).toBe('failed');
  });

  it("resolves 'failed' when the context leaves running", async () => {
    const ctx = new FakeCtx();
    const h = play(ctx);
    ctx.changeState('suspended');
    expect(await h.finished).toBe('failed');
    expect(ctx.source.stopped).toBe(1);
  });

  it("ignores statechange events while still running", async () => {
    const ctx = new FakeCtx();
    const h = play(ctx);
    ctx.changeState('running');
    ctx.source.emit('ended');
    expect(await h.finished).toBe('ended');
  });

  it('clamps elapsedSec between 0 and the duration', () => {
    const ctx = new FakeCtx();
    const h = play(ctx);
    ctx.currentTime = 5;
    expect(h.elapsedSec()).toBe(0);
    ctx.currentTime = 11;
    expect(h.elapsedSec()).toBe(1);
    ctx.currentTime = 100;
    expect(h.elapsedSec()).toBe(2);
  });

  it('finishes once: first outcome wins and later events do nothing', async () => {
    const ctx = new FakeCtx();
    const h = play(ctx);
    h.stop();
    h.stop();
    ctx.source.emit('ended');
    ctx.changeState('closed');
    expect(await h.finished).toBe('stopped');
    expect(ctx.source.stopped).toBe(1);
    expect(ctx.source.disconnected).toBe(1);
  });
});
