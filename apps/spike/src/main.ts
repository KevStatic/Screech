import factory from 'ggwave';
import type { GGWaveModule } from 'ggwave';
import { runSelfTest } from './selftest';

const CHUNK = 4096;

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};
const textInput = $<HTMLInputElement>('text');
const sendBtn = $<HTMLButtonElement>('send');
const listenBtn = $<HTMLButtonElement>('listen');
const rateEl = $<HTMLSpanElement>('rate');
const levelEl = $<HTMLMeterElement>('level');
const statusEl = $<HTMLParagraphElement>('status');
const logEl = $<HTMLUListElement>('log');

let ctx: AudioContext | null = null;
let ggwave: GGWaveModule | null = null;
let instance = 0;
let listening = false;

async function ensureAudio(): Promise<{ ctx: AudioContext; gg: GGWaveModule }> {
  // Must happen inside the tap handler (iOS Safari).
  if (!ctx) ctx = new AudioContext();
  if (ctx.state !== 'running') await ctx.resume();
  if (!ggwave) {
    ggwave = await factory();
    const p = ggwave.getDefaultParameters();
    p.sampleRateInp = ctx.sampleRate;
    p.sampleRateOut = ctx.sampleRate;
    p.sampleFormatInp = ggwave.SampleFormat.GGWAVE_SAMPLE_FORMAT_F32;
    p.sampleFormatOut = ggwave.SampleFormat.GGWAVE_SAMPLE_FORMAT_F32;
    instance = ggwave.init(p);
  }
  rateEl.textContent = `${ctx.sampleRate} Hz`;
  return { ctx, gg: ggwave };
}

function report(e: unknown): void {
  statusEl.textContent = e instanceof Error ? e.message : String(e);
}

sendBtn.addEventListener('click', () => {
  const p = ensureAudio();
  p.then(({ ctx, gg }) => {
    const bytes = gg.encode(
      instance,
      textInput.value,
      gg.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_FAST,
      10,
    ).slice();
    const wave = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
    const buf = ctx.createBuffer(1, wave.length, ctx.sampleRate);
    buf.copyToChannel(wave, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start();
    statusEl.textContent = `Sent "${textInput.value}"`;
  }).catch(report);
});

listenBtn.addEventListener('click', () => {
  if (listening) return;
  ensureAudio().then(async ({ ctx, gg }) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    listening = true;
    listenBtn.disabled = true;
    statusEl.textContent = 'Listening...';

    const source = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    const acc = new Float32Array(CHUNK);
    let filled = 0;
    const decoder = new TextDecoder();

    proc.onaudioprocess = (ev) => {
      const input = ev.inputBuffer.getChannelData(0);
      let peak = 0;
      for (let i = 0; i < input.length; i++) peak = Math.max(peak, Math.abs(input[i]));
      levelEl.value = Math.min(1, peak);

      let pos = 0;
      while (pos < input.length) {
        const n = Math.min(CHUNK - filled, input.length - pos);
        acc.set(input.subarray(pos, pos + n), filled);
        filled += n;
        pos += n;
        if (filled === CHUNK) {
          const res = gg.decode(
            instance,
            new Int8Array(acc.buffer, acc.byteOffset, acc.byteLength),
          );
          if (res && res.length > 0) {
            const li = document.createElement('li');
            li.textContent = `${new Date().toLocaleTimeString()} ${decoder.decode(res)}`;
            logEl.prepend(li);
          }
          filled = 0;
        }
      }
    };

    source.connect(proc);
    proc.connect(ctx.destination); // required for the node to run; output is silent
  }).catch((e) => {
    listenBtn.disabled = false;
    listening = false;
    report(e);
  });
});

const selfTestBtn = $<HTMLButtonElement>('selftest');
const selfTestOut = $<HTMLUListElement>('selftest-results');
selfTestBtn.addEventListener('click', () => {
  selfTestBtn.disabled = true;
  selfTestOut.textContent = '';
  void runSelfTest().then((results) => {
    for (const r of results) {
      const li = document.createElement('li');
      li.textContent = `${r.pass ? 'PASS' : 'FAIL'} ${r.name}: ${r.detail}`;
      selfTestOut.append(li);
    }
    selfTestBtn.disabled = false;
  });
});
