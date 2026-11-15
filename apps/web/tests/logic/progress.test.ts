import { describe, expect, it } from 'vitest';
import { formatDuration, percent, progress, remainingSeconds } from '../../src/logic/progress';

describe('progress', () => {
  it('is 0 at elapsed 0', () => {
    expect(progress(0, 10)).toBe(0);
  });
  it('is 1 at exactly the duration and beyond', () => {
    expect(progress(10, 10)).toBe(1);
    expect(progress(25, 10)).toBe(1);
  });
  it('is fractional in between', () => {
    expect(progress(2.5, 10)).toBe(0.25);
  });
  it('treats negative and NaN elapsed as 0', () => {
    expect(progress(-3, 10)).toBe(0);
    expect(progress(Number.NaN, 10)).toBe(0);
    expect(progress(Number.NEGATIVE_INFINITY, 10)).toBe(0);
  });
  it('gives 0 for a zero, negative or NaN duration', () => {
    expect(progress(5, 0)).toBe(0);
    expect(progress(5, -1)).toBe(0);
    expect(progress(5, Number.NaN)).toBe(0);
  });
});

describe('percent', () => {
  it('floors and clamps to 0..100', () => {
    expect(percent(0)).toBe(0);
    expect(percent(0.255)).toBe(25);
    expect(percent(1)).toBe(100);
    expect(percent(2)).toBe(100);
    expect(percent(-1)).toBe(0);
    expect(percent(Number.NaN)).toBe(0);
  });
});

describe('remainingSeconds', () => {
  it('rounds up whole seconds', () => {
    expect(remainingSeconds(0, 10)).toBe(10);
    expect(remainingSeconds(0.1, 10)).toBe(10);
    expect(remainingSeconds(9.5, 10)).toBe(1);
  });
  it('is 0 at and after the duration', () => {
    expect(remainingSeconds(10, 10)).toBe(0);
    expect(remainingSeconds(12, 10)).toBe(0);
  });
  it('uses the full duration for negative or NaN elapsed', () => {
    expect(remainingSeconds(-4, 10)).toBe(10);
    expect(remainingSeconds(Number.NaN, 10)).toBe(10);
  });
  it('is 0 for a bad duration', () => {
    expect(remainingSeconds(1, 0)).toBe(0);
    expect(remainingSeconds(1, Number.NaN)).toBe(0);
  });
});

describe('formatDuration', () => {
  it('shows one decimal place', () => {
    expect(formatDuration(0)).toBe('0.0');
    expect(formatDuration(3)).toBe('3.0');
    expect(formatDuration(12.34)).toBe('12.3');
  });
  it('gives 0.0 for negative, NaN and infinite input', () => {
    expect(formatDuration(-1)).toBe('0.0');
    expect(formatDuration(Number.NaN)).toBe('0.0');
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('0.0');
  });
});
