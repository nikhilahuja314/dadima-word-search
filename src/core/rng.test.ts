import { describe, expect, test } from 'vitest';
import { createRng, pick, randInt, shuffle } from './rng';

function sequence(seed: number, n: number): number[] {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => rng());
}

describe('createRng', () => {
  test('same seed gives identical sequence', () => {
    expect(sequence(42, 1000)).toEqual(sequence(42, 1000));
  });

  test('different seeds give different sequences', () => {
    expect(sequence(1, 1000)).not.toEqual(sequence(2, 1000));
  });

  test('all values are in [0, 1)', () => {
    for (const v of sequence(7, 10000)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('randInt', () => {
  test('always in [0, n) and covers every value for n=12', () => {
    const rng = createRng(123);
    const seen = new Set<number>();
    for (let i = 0; i < 10000; i++) {
      const v = randInt(rng, 12);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(12);
      seen.add(v);
    }
    expect(seen.size).toBe(12);
  });
});

describe('shuffle', () => {
  const items = Array.from({ length: 30 }, (_, i) => i);

  test('returns a permutation of the input', () => {
    const out = shuffle(createRng(5), items);
    expect(out).toHaveLength(items.length);
    expect(out.toSorted((a, b) => a - b)).toEqual(items);
  });

  test('does not mutate the input', () => {
    const copy = [...items];
    shuffle(createRng(5), copy);
    expect(copy).toEqual(items);
  });

  test('is deterministic per seed', () => {
    expect(shuffle(createRng(9), items)).toEqual(shuffle(createRng(9), items));
    expect(shuffle(createRng(9), items)).not.toEqual(shuffle(createRng(10), items));
  });
});

describe('pick', () => {
  test('returns an element of the array, deterministically', () => {
    const items = ['a', 'b', 'c', 'd'];
    const v = pick(createRng(3), items);
    expect(items).toContain(v);
    expect(pick(createRng(3), items)).toBe(v);
  });

  test('throws on an empty array', () => {
    expect(() => pick(createRng(1), [])).toThrow();
  });
});
