import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { seal } from '../src/seal.js';
import type { Payload } from '../src/types.js';
import {
  anythingArb,
  counterArb,
  keyArb,
  senderIdArb,
  stringWithLoneSurrogateArb,
  wifiOpenWithPasswordArb,
} from './arbitraries.js';
import { NUM_RUNS } from './helpers.js';

const TEXT_LIKE = ['text', 'contact', 'checkin', 'hunt-clue'] as const;
const textLikeTypeArb = fc.constantFrom(...TEXT_LIKE);

/** Takes a deep copy where possible; values structuredClone rejects are returned as is. */
function snapshot<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return value;
  }
}

/** Calls `seal` with a value the type system would reject. */
function sealUnchecked(value: unknown, key: Uint8Array, senderId: Uint8Array, counter: number) {
  return seal(value as Payload, key, senderId, counter);
}

async function expectRejected(
  value: unknown,
  field: string,
  key: Uint8Array,
  senderId: Uint8Array,
  counter: number,
): Promise<void> {
  const before = snapshot(value);
  const result = await sealUnchecked(value, key, senderId, counter);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.code).toBe('invalid-payload');
    if (result.error.code === 'invalid-payload') expect(result.error.field).toBe(field);
  }
  // No packet is produced on the error branch.
  expect('value' in result).toBe(false);
  expect(value).toEqual(before);
}

/** Independent oracle for the offending field; null when the shape is plausible. */
function expectedField(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return 'payload';
  const rec = value as Record<string, unknown>;
  const type = rec['type'];
  if (type === 'text' || type === 'contact' || type === 'checkin' || type === 'hunt-clue') {
    return typeof rec['text'] === 'string' ? null : 'text';
  }
  if (type === 'url') return typeof rec['url'] === 'string' ? null : 'url';
  if (type === 'wifi') {
    for (const key of ['ssid', 'password', 'security']) {
      if (typeof rec[key] !== 'string') return key;
    }
    return null;
  }
  return 'type';
}

// Feature: screech-protocol, Property 7: Wi-Fi encoding rules
// **Validates: Requirements 6.8, 12.1**
describe('Property 7: Wi-Fi encoding rules (seal)', () => {
  it('resolves to invalid-wifi for open security with a non-empty password', async () => {
    await fc.assert(
      fc.asyncProperty(wifiOpenWithPasswordArb, keyArb, senderIdArb, counterArb, async (payload, key, senderId, counter) => {
        const before = snapshot(payload);
        const result = await seal(payload, key, senderId, counter);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe('invalid-wifi');
        expect('value' in result).toBe(false);
        expect(payload).toEqual(before);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// Feature: screech-protocol, Property 9: Invalid payloads are rejected without a packet
// **Validates: Requirements 3.3, 12.1**
describe('Property 9: Invalid payloads are rejected without a packet (seal)', () => {
  it('rejects empty text for every text-like type, naming "text"', async () => {
    await fc.assert(
      fc.asyncProperty(textLikeTypeArb, keyArb, senderIdArb, counterArb, async (type, key, senderId, counter) => {
        await expectRejected({ type, text: '' }, 'text', key, senderId, counter);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('rejects text with a lone surrogate for every text-like type, naming "text"', async () => {
    await fc.assert(
      fc.asyncProperty(
        textLikeTypeArb,
        stringWithLoneSurrogateArb,
        keyArb,
        senderIdArb,
        counterArb,
        async (type, text, key, senderId, counter) => {
          await expectRejected({ type, text }, 'text', key, senderId, counter);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('rejects arbitrary non-Payload values naming the offending field', async () => {
    await fc.assert(
      fc.asyncProperty(
        anythingArb.filter((v) => expectedField(v) !== null),
        keyArb,
        senderIdArb,
        counterArb,
        async (value, key, senderId, counter) => {
          await expectRejected(value, expectedField(value) as string, key, senderId, counter);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('rejects known types with a non-string field, naming that field', async () => {
    const nonString = fc.oneof(fc.integer(), fc.boolean(), fc.constant(null), fc.constant(undefined), fc.array(fc.string(), { maxLength: 3 }));
    const arb = fc.oneof(
      fc.tuple(textLikeTypeArb, nonString).map(([type, text]) => ({ value: { type, text }, field: 'text' })),
      nonString.map((url) => ({ value: { type: 'url', url }, field: 'url' })),
      fc
        .tuple(nonString, fc.string(), fc.string())
        .map(([ssid, password, security]) => ({ value: { type: 'wifi', ssid, password, security }, field: 'ssid' })),
      fc
        .tuple(fc.string(), nonString, fc.string())
        .map(([ssid, password, security]) => ({ value: { type: 'wifi', ssid, password, security }, field: 'password' })),
      fc
        .tuple(fc.string(), fc.string(), nonString)
        .map(([ssid, password, security]) => ({ value: { type: 'wifi', ssid, password, security }, field: 'security' })),
    );
    await fc.assert(
      fc.asyncProperty(arb, keyArb, senderIdArb, counterArb, async ({ value, field }, key, senderId, counter) => {
        await expectRejected(value, field, key, senderId, counter);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('rejects unknown type values naming "type"', async () => {
    const known = new Set<string>(['text', 'url', 'wifi', 'contact', 'checkin', 'hunt-clue']);
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(fc.string(), fc.integer(), fc.constant(undefined)).filter((t) => typeof t !== 'string' || !known.has(t)),
        fc.string(),
        keyArb,
        senderIdArb,
        counterArb,
        async (type, text, key, senderId, counter) => {
          await expectRejected({ type, text }, 'type', key, senderId, counter);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
