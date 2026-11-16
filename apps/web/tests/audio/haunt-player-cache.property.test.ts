// Feature: haunting-sounds, Property 28: Buffer cache keys are unique per sound, rate and seed
// **Validates: Requirements 6.6, 8.5**
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createHauntPlayer } from '../../src/audio/haunt-player';
import { bufferKey } from '../../src/logic/haunt-rules';
import {
  FIXED_SEEDS,
  generateSound,
  scrapeSeed,
  type OneShotName,
  type SoundName,
} from '../../src/logic/haunt-synth';

const RATES = [22050, 44100, 48000] as const;
const ONE_SHOTS: readonly OneShotName[] = [
  'awaken',
  'card-flip',
  'candle-crackle',
  'planchette-scrape',
  'whisper',
  'broken-crackle',
  'sealed-thud',
];
/** Past the 30 ms dedupe window and the 400 ms crackle limit. */
const STEP_MS = 1000;

interface FakeBuffer {
  readonly length: number;
  readonly duration: number;
  copyToChannel(samples: Float32Array, channel: number): void;
}

/** Real sounds, computed once per triple so 100+ cases stay fast. */
const soundMemo = new Map<string, Float32Array>();
function realSound(name: SoundName, rate: number, seed: number): Float32Array {
  const key = bufferKey(name, rate, seed);
  let samples = soundMemo.get(key);
  if (samples === undefined) {
    samples = generateSound(name, rate, seed);
    soundMemo.set(key, samples);
  }
  return samples;
}

function fakeNode(): Record<string, unknown> {
  return {
    connect: () => undefined,
    disconnect: () => undefined,
    start: () => undefined,
    stop: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    gain: {
      value: 0,
      cancelScheduledValues: () => undefined,
      setValueAtTime: () => undefined,
      linearRampToValueAtTime: () => undefined,
    },
  };
}

interface FakeContext {
  readonly ctx: AudioContext;
  readonly created: FakeBuffer[];
}

function fakeContext(sampleRate: number): FakeContext {
  const created: FakeBuffer[] = [];
  const ctx = {
    sampleRate,
    currentTime: 0,
    state: 'running',
    destination: {},
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    createBuffer: (_channels: number, length: number, rate: number): FakeBuffer => {
      const buffer: FakeBuffer = {
        length,
        duration: length / rate,
        copyToChannel: () => undefined,
      };
      created.push(buffer);
      return buffer;
    },
    createBufferSource: () => fakeNode(),
    createGain: () => fakeNode(),
  } as unknown as AudioContext;
  return { ctx, created };
}

interface Step {
  readonly name: OneShotName;
  readonly rateIndex: number;
  readonly seedIndex: number;
}

const stepArb: fc.Arbitrary<Step> = fc.record({
  name: fc.constantFrom(...ONE_SHOTS),
  rateIndex: fc.integer({ min: 0, max: RATES.length - 1 }),
  seedIndex: fc.integer({ min: 0, max: 3 }),
});

function seedOf(step: Step): number {
  return step.name === 'planchette-scrape' ? scrapeSeed(step.seedIndex) : FIXED_SEEDS[step.name];
}

describe('Property 28 (player): one AudioBuffer per sound, rate and seed', () => {
  it('creates exactly one buffer per distinct triple and one per generator call', () => {
    fc.assert(
      fc.property(fc.array(stepArb, { minLength: 1, maxLength: 24 }), (steps) => {
        const contexts = RATES.map((rate) => fakeContext(rate));
        let current = 0;
        let clock = 0;
        let timerId = 0;
        const generated: string[] = [];
        const player = createHauntPlayer({
          getContext: () => contexts[current]?.ctx ?? null,
          isRunning: () => true,
          now: () => clock,
          setTimer: () => (timerId += 1),
          clearTimer: () => undefined,
          generate: (name, rate, seed) => {
            generated.push(bufferKey(name, rate, seed));
            return realSound(name, rate, seed);
          },
          onFailure: () => undefined,
        });
        player.update({ quiet: false, soundOn: true });

        const expected = new Set<string>();
        // The awaken tap plays the awaken sound on the first context.
        current = 0;
        player.noteAwakenTap({ ok: true, ctx: contexts[0]!.ctx, sampleRate: RATES[0] });
        expected.add(bufferKey('awaken', RATES[0], FIXED_SEEDS.awaken));

        for (const step of steps) {
          clock += STEP_MS;
          current = step.rateIndex;
          const result = player.play(step.name, { seed: seedOf(step) });
          expect(result).toEqual({ started: true });
          expected.add(bufferKey(step.name, RATES[step.rateIndex]!, seedOf(step)));
        }

        const totalBuffers = contexts.reduce((n, c) => n + c.created.length, 0);
        expect(totalBuffers).toBe(expected.size);
        expect(generated.length).toBe(expected.size);
        expect(new Set(generated)).toEqual(expected);
        // Each context holds distinct buffer objects, one per triple at its rate.
        for (const c of contexts) expect(new Set(c.created).size).toBe(c.created.length);
      }),
      { numRuns: 150 },
    );
  });

  it('plays one triple many times with a single generator call and createBuffer call', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ONE_SHOTS),
        fc.constantFrom(...RATES),
        fc.integer({ min: 0, max: 50 }),
        fc.integer({ min: 2, max: 12 }),
        (name, rate, seedIndex, times) => {
          const fake = fakeContext(rate);
          let clock = 0;
          let generateCalls = 0;
          const player = createHauntPlayer({
            getContext: () => fake.ctx,
            isRunning: () => true,
            now: () => clock,
            setTimer: () => 1,
            clearTimer: () => undefined,
            generate: (n, r, s) => {
              generateCalls += 1;
              return realSound(n, r, s);
            },
            onFailure: () => undefined,
          });
          player.update({ quiet: false, soundOn: true });
          player.noteAwakenTap({ ok: true, ctx: fake.ctx, sampleRate: rate });
          const baseline = name === 'awaken' ? 1 : 2; // the tap made the awaken buffer
          const seed = name === 'planchette-scrape' ? scrapeSeed(seedIndex) : FIXED_SEEDS[name];
          for (let i = 0; i < times; i++) {
            clock += STEP_MS;
            expect(player.play(name, { seed })).toEqual({ started: true });
          }
          expect(fake.created.length).toBe(baseline);
          expect(generateCalls).toBe(baseline);
        },
      ),
      { numRuns: 100 },
    );
  });
});
