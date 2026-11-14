import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { encode } from '../src/codec.js';
import type { Payload } from '../src/types.js';
import { anythingArb, stringWithLoneSurrogateArb } from './arbitraries.js';
import { NUM_RUNS } from './helpers.js';

// Feature: screech-protocol, Property 9: Invalid payloads are rejected without a packet
// **Validates: Requirements 3.3, 4.4, 7.4**

const TEXT_LIKE = ['text', 'contact', 'checkin', 'hunt-clue'] as const;
const textLikeTypeArb = fc.constantFrom(...TEXT_LIKE);

/** Takes a deep copy where possible; values structuredClone rejects (functions, symbols) are returned as is. */
function snapshot<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return value;
  }
}

/** Calls `encode` with a value the type system would reject. */
function encodeUnchecked(value: unknown) {
  return encode(value as Payload);
}

function expectRejected(value: unknown, field: string): void {
  const before = snapshot(value);
  const result = encodeUnchecked(value);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.code).toBe('invalid-payload');
    if (result.error.code === 'invalid-payload') expect(result.error.field).toBe(field);
  }
  // No packet is produced on the error branch.
  expect('value' in result).toBe(false);
  expect(value).toEqual(before);
}

/**
 * Independent oracle for the offending field of a value that is not a valid
 * Payload. Returns `null` when the shape is plausible (all required fields are
 * strings of a known type), so the generator can discard it.
 */
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

describe('Property 9: Invalid payloads are rejected without a packet (encode)', () => {
  it('rejects empty text for every text-like type, naming "text"', () => {
    fc.assert(
      fc.property(textLikeTypeArb, (type) => {
        expectRejected({ type, text: '' }, 'text');
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('rejects text containing a lone surrogate for every text-like type, naming "text"', () => {
    fc.assert(
      fc.property(textLikeTypeArb, stringWithLoneSurrogateArb, (type, text) => {
        expectRejected({ type, text }, 'text');
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('rejects arbitrary non-Payload values naming the offending field', () => {
    fc.assert(
      fc.property(
        anythingArb.filter((v) => expectedField(v) !== null),
        (value) => {
          const field = expectedField(value) as string;
          expectRejected(value, field);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('rejects known types with a non-string field, naming that field', () => {
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
    fc.assert(
      fc.property(arb, ({ value, field }) => {
        expectRejected(value, field);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('rejects unknown type values naming "type"', () => {
    const known = new Set<string>(['text', 'url', 'wifi', 'contact', 'checkin', 'hunt-clue']);
    fc.assert(
      fc.property(
        fc.oneof(fc.string(), fc.integer(), fc.constant(undefined)).filter((t) => typeof t !== 'string' || !known.has(t)),
        fc.string(),
        (type, text) => {
          expectRejected({ type, text }, 'type');
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('leaves examples unchanged (fixed cases)', () => {
    expectRejected({ type: 'text', text: '' }, 'text');
    expectRejected({ type: 'text', text: 'a\ud800b' }, 'text');
    expectRejected(null, 'payload');
    expectRejected({ type: 'nope' }, 'type');
  });
});
