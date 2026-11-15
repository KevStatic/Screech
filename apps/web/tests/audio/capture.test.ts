import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startCapture } from '../../src/audio/capture';
import { CAPTURE_PROCESSOR_NAME } from '../../src/audio/capture-worklet-source';

class FakeNode {
  connections: unknown[] = [];
  disconnected = 0;
  gain = { value: 1 };
  fftSize = 0;
  onaudioprocess: ((e: unknown) => void) | null = null;
  connect(n: unknown): void {
    this.connections.push(n);
  }
  disconnect(): void {
    this.disconnected++;
  }
}

class FakeWorkletNode extends FakeNode {
  static last: FakeWorkletNode | null = null;
  args: unknown[];
  port = {
    onmessage: null as ((e: { data: Float32Array }) => void) | null,
    closed: 0,
    close(): void {
      this.closed++;
    },
  };
  constructor(...args: unknown[]) {
    super();
    this.args = args;
    FakeWorkletNode.last = this;
  }
}

class FakeTrack {
  stopped = 0;
  listeners = new Set<() => void>();
  stop(): void {
    this.stopped++;
  }
  addEventListener(_t: string, f: () => void): void {
    this.listeners.add(f);
  }
  removeEventListener(_t: string, f: () => void): void {
    this.listeners.delete(f);
  }
  end(): void {
    for (const f of [...this.listeners]) f();
  }
}

function makeCtx(withWorklet: boolean) {
  const nodes = { source: new FakeNode(), analyser: new FakeNode(), gain: new FakeNode(), script: new FakeNode() };
  const addModule = vi.fn(async () => undefined);
  const ctx = {
    destination: { id: 'dest' },
    createMediaStreamSource: () => nodes.source,
    createAnalyser: () => nodes.analyser,
    createGain: () => nodes.gain,
    createScriptProcessor: vi.fn(() => nodes.script),
    ...(withWorklet ? { audioWorklet: { addModule } } : {}),
  };
  return { ctx: ctx as unknown as AudioContext, nodes, addModule, raw: ctx };
}

function makeStream() {
  const tracks = [new FakeTrack(), new FakeTrack()];
  return { stream: { getTracks: () => tracks } as unknown as MediaStream, tracks };
}

const chunkOf = (n: number, v = 0.1): Float32Array => new Float32Array(n).fill(v);

describe('startCapture', () => {
  let revoke: ReturnType<typeof vi.fn>;
  let create: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    revoke = vi.fn();
    create = vi.fn(() => 'blob:fake');
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
    vi.stubGlobal('AudioWorkletNode', FakeWorkletNode);
    FakeWorkletNode.last = null;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('worklet path', () => {
    it('loads the module, builds the processor and decodes 4096-sample chunks', async () => {
      const { ctx, nodes, addModule } = makeCtx(true);
      const { stream } = makeStream();
      const decode = vi.fn((s: Float32Array) => (s[0] > 0.5 ? new Uint8Array([1, 2]) : null));
      const onPacketBytes = vi.fn();
      const r = await startCapture(ctx, stream, decode, { onPacketBytes, onMicLost: vi.fn() });
      expect(r.ok).toBe(true);
      expect(addModule).toHaveBeenCalledWith('blob:fake');
      const node = FakeWorkletNode.last as FakeWorkletNode;
      expect(node.args[1]).toBe(CAPTURE_PROCESSOR_NAME);
      expect(nodes.source.connections).toContain(nodes.analyser);
      expect(nodes.source.connections).toContain(node);
      expect(node.connections).toContain(nodes.gain);
      expect(nodes.gain.gain.value).toBe(0);
      expect(nodes.gain.connections).toHaveLength(1);

      node.port.onmessage?.({ data: chunkOf(1000) });
      node.port.onmessage?.({ data: chunkOf(3096) });
      expect(decode).toHaveBeenCalledTimes(1);
      expect(decode.mock.calls[0][0]).toHaveLength(4096);
      expect(onPacketBytes).not.toHaveBeenCalled();

      node.port.onmessage?.({ data: chunkOf(4096, 0.9) });
      expect(onPacketBytes).toHaveBeenCalledWith(new Uint8Array([1, 2]));
      expect((r.ok && r.handle.lastBlockAt()) || 0).toBeGreaterThan(0);
    });

    it('stop() disconnects every node, stops tracks, revokes the URL, and is idempotent', async () => {
      const { ctx, nodes } = makeCtx(true);
      const { stream, tracks } = makeStream();
      const r = await startCapture(ctx, stream, () => null, { onPacketBytes: vi.fn(), onMicLost: vi.fn() });
      if (!r.ok) throw new Error('capture failed');
      const node = FakeWorkletNode.last as FakeWorkletNode;
      r.handle.stop();
      r.handle.stop();
      expect(nodes.source.disconnected).toBe(1);
      expect(nodes.analyser.disconnected).toBe(1);
      expect(nodes.gain.disconnected).toBe(1);
      expect(node.disconnected).toBe(1);
      expect(node.port.closed).toBe(1);
      expect(node.port.onmessage).toBeNull();
      expect(revoke).toHaveBeenCalledTimes(1);
      expect(revoke).toHaveBeenCalledWith('blob:fake');
      for (const t of tracks) expect(t.stopped).toBe(1);
    });

    it('ignores blocks after stop()', async () => {
      const { ctx } = makeCtx(true);
      const { stream } = makeStream();
      const decode = vi.fn(() => null);
      const r = await startCapture(ctx, stream, decode, { onPacketBytes: vi.fn(), onMicLost: vi.fn() });
      if (!r.ok) throw new Error('capture failed');
      const node = FakeWorkletNode.last as FakeWorkletNode;
      const handler = node.port.onmessage;
      r.handle.stop();
      handler?.({ data: chunkOf(4096) });
      expect(decode).not.toHaveBeenCalled();
    });

    it('fails with a plain message and cleans up when addModule rejects', async () => {
      const { ctx, nodes, addModule } = makeCtx(true);
      addModule.mockRejectedValueOnce(new Error('bad'));
      const { stream, tracks } = makeStream();
      const r = await startCapture(ctx, stream, () => null, { onPacketBytes: vi.fn(), onMicLost: vi.fn() });
      expect(r).toEqual({
        ok: false,
        message: 'The listening circuit would not start. Reload the page and try again.',
      });
      expect(nodes.source.disconnected).toBe(1);
      expect(revoke).toHaveBeenCalledTimes(1);
      for (const t of tracks) expect(t.stopped).toBe(1);
    });
  });

  describe('script processor path', () => {
    it('uses a 4096 ScriptProcessor, copies blocks and decodes', async () => {
      const { ctx, nodes, raw } = makeCtx(false);
      const { stream } = makeStream();
      const decode = vi.fn(() => new Uint8Array([9]));
      const onPacketBytes = vi.fn();
      const r = await startCapture(ctx, stream, decode, { onPacketBytes, onMicLost: vi.fn() });
      expect(r.ok).toBe(true);
      expect(raw.createScriptProcessor).toHaveBeenCalledWith(4096, 1, 1);
      expect(create).not.toHaveBeenCalled();
      expect(nodes.script.connections).toContain(nodes.gain);
      const data = chunkOf(4096, 0.3);
      nodes.script.onaudioprocess?.({ inputBuffer: { getChannelData: () => data } });
      expect(decode).toHaveBeenCalledTimes(1);
      expect(decode.mock.calls[0]).toHaveLength(1);
      expect(onPacketBytes).toHaveBeenCalledWith(new Uint8Array([9]));
    });

    it('stop() tears everything down once', async () => {
      const { ctx, nodes } = makeCtx(false);
      const { stream, tracks } = makeStream();
      const r = await startCapture(ctx, stream, () => null, { onPacketBytes: vi.fn(), onMicLost: vi.fn() });
      if (!r.ok) throw new Error('capture failed');
      r.handle.stop();
      r.handle.stop();
      expect(nodes.script.disconnected).toBe(1);
      expect(nodes.script.onaudioprocess).toBeNull();
      expect(nodes.source.disconnected).toBe(1);
      expect(nodes.analyser.disconnected).toBe(1);
      expect(nodes.gain.disconnected).toBe(1);
      for (const t of tracks) expect(t.stopped).toBe(1);
    });
  });

  it('calls onMicLost when a track ends, but not after stop()', async () => {
    const { ctx } = makeCtx(false);
    const { stream, tracks } = makeStream();
    const onMicLost = vi.fn();
    const r = await startCapture(ctx, stream, () => null, { onPacketBytes: vi.fn(), onMicLost });
    if (!r.ok) throw new Error('capture failed');
    tracks[0].end();
    expect(onMicLost).toHaveBeenCalledTimes(1);
    r.handle.stop();
    tracks[1].end();
    expect(onMicLost).toHaveBeenCalledTimes(1);
  });

  it('does not let a throwing decode break capture', async () => {
    const { ctx, nodes } = makeCtx(false);
    const { stream } = makeStream();
    const onPacketBytes = vi.fn();
    await startCapture(ctx, stream, () => { throw new Error('x'); }, { onPacketBytes, onMicLost: vi.fn() });
    nodes.script.onaudioprocess?.({ inputBuffer: { getChannelData: () => chunkOf(4096) } });
    expect(onPacketBytes).not.toHaveBeenCalled();
  });
});
