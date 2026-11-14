import { describe, it } from 'vitest';
import * as fc from 'fast-check';

// Placeholder test to verify vitest + fast-check are wired up.
describe('@screech/core', () => {
  it('fast-check is available', () => {
    fc.assert(fc.property(fc.integer(), (n) => typeof n === 'number'));
  });
});
