import { describe, expect, it } from 'vitest';
import { capitalise, clampCount, localDateStamp } from './util';

describe('clampCount', () => {
  it('clamps to 1..max and rounds', () => {
    expect(clampCount(0, 50, 10)).toBe(1);
    expect(clampCount(51, 50, 10)).toBe(50);
    expect(clampCount(3.6, 50, 10)).toBe(4);
  });
  it('falls back on NaN', () => {
    expect(clampCount(Number.NaN, 50, 10)).toBe(10);
  });
});

describe('localDateStamp', () => {
  it('formats local date with zero padding', () => {
    expect(localDateStamp(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('capitalise', () => {
  it('uppercases the first letter', () => {
    expect(capitalise('puzzles')).toBe('Puzzles');
  });
});
