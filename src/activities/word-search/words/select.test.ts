import { describe, expect, it } from 'vitest';
import { createRng, randInt } from '../../../core/rng';
import { MAX_WORD_LEN, MIN_WORD_LEN, WORDS_PER_PUZZLE } from '../types';
import { createWordPool, wordsNeeded } from './select';

/** Length weights for 4..12, skewed towards 5-8 letters. */
const LENGTH_WEIGHTS = [10, 20, 22, 18, 12, 8, 5, 3, 2];
const ALPHABET = 'ABCDEFGHIJKLMNOPRSTUVWY';

function makeFixture(count: number, seed = 1234): string[] {
  const rng = createRng(seed);
  const total = LENGTH_WEIGHTS.reduce((a, b) => a + b, 0);
  const words = new Set<string>();
  while (words.size < count) {
    let r = randInt(rng, total);
    let len = MIN_WORD_LEN;
    for (const w of LENGTH_WEIGHTS) {
      if (r < w) break;
      r -= w;
      len++;
    }
    let word = '';
    for (let i = 0; i < len; i++) word += ALPHABET[randInt(rng, ALPHABET.length)];
    words.add(word);
  }
  return [...words];
}

function checkSet(set: readonly string[]): void {
  expect(set).toHaveLength(WORDS_PER_PUZZLE);
  expect(new Set(set).size).toBe(WORDS_PER_PUZZLE);
  for (const a of set) {
    for (const b of set) {
      if (a !== b) expect(b.includes(a)).toBe(false);
    }
  }
  expect(set.filter((w) => w.length >= 9).length).toBeLessThanOrEqual(3);
  expect(set.filter((w) => w.length <= 6).length).toBeGreaterThanOrEqual(4);
  expect(set.reduce((n, w) => n + w.length, 0)).toBeLessThanOrEqual(90);
}

describe('fixture', () => {
  it('has 1,500 words of valid lengths', () => {
    const f = makeFixture(1500);
    expect(f).toHaveLength(1500);
    for (const w of f) {
      expect(w.length).toBeGreaterThanOrEqual(MIN_WORD_LEN);
      expect(w.length).toBeLessThanOrEqual(MAX_WORD_LEN);
    }
  });
});

describe('wordsNeeded', () => {
  it('multiplies by words per puzzle', () => {
    expect(wordsNeeded(50)).toBe(600);
  });
});

describe('createWordPool', () => {
  it('50 consecutive draws give 600 distinct words, all sets obey rules 1-4', () => {
    const pool = createWordPool(makeFixture(1500));
    const rng = createRng(7);
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const set = pool.drawSet(rng);
      checkSet(set);
      for (const w of set) {
        expect(seen.has(w)).toBe(false);
        seen.add(w);
      }
    }
    expect(seen.size).toBe(600);
    expect(pool.remaining()).toBe(900);
  });

  it('is deterministic for a given seed', () => {
    const fixture = makeFixture(1500);
    const run = (seed: number) => {
      const pool = createWordPool(fixture);
      const rng = createRng(seed);
      return Array.from({ length: 10 }, () => pool.drawSet(rng));
    };
    expect(run(42)).toEqual(run(42));
    expect(run(42)).not.toEqual(run(43));
  });

  it('never yields a word and one containing it in the same set', () => {
    const fixture = [...makeFixture(200), 'HEART', 'HEARTH'];
    for (let seed = 0; seed < 100; seed++) {
      const pool = createWordPool(fixture);
      const set = pool.drawSet(createRng(seed));
      checkSet(set);
      expect(set.includes('HEART') && set.includes('HEARTH')).toBe(false);
    }
  });

  it('throws a clear error when the pool cannot satisfy a draw', () => {
    // Too few words.
    expect(() => createWordPool(makeFixture(5)).drawSet(createRng(1))).toThrow(
      'Word pool exhausted',
    );
    // Enough words, but all long: rule 3 can never be met.
    const longOnly = makeFixture(300).map((w) => w.padEnd(10, 'Q').slice(0, 10) + w.length);
    const letters = longOnly.map((w) => w.replace(/\d/g, 'Z'));
    expect(() => createWordPool(letters).drawSet(createRng(1))).toThrow('Word pool exhausted');
    // Pool runs dry after enough draws.
    const pool = createWordPool(makeFixture(40));
    const rng = createRng(3);
    expect(() => {
      for (let i = 0; i < 10; i++) pool.drawSet(rng);
    }).toThrow('Word pool exhausted');
  });

  it('release makes words drawable again', () => {
    const fixture = makeFixture(1500);
    const pool = createWordPool(fixture);
    const rng = createRng(5);
    const set = pool.drawSet(rng);
    expect(pool.remaining()).toBe(1500 - WORDS_PER_PUZZLE);
    pool.release(set);
    expect(pool.remaining()).toBe(1500);
    // Releasing twice or releasing unknown words doesn't inflate the pool.
    pool.release(set);
    pool.release(['NOTINBANK']);
    expect(pool.remaining()).toBe(1500);

    // Fully drain a tiny-but-sufficient pool, release, and draw again.
    const small = makeFixture(60, 99);
    const smallPool = createWordPool(small);
    const first = smallPool.drawSet(rng);
    smallPool.release(first);
    const again = new Set<string>();
    for (const w of smallPool.drawSet(createRng(11))) again.add(w);
    expect(again.size).toBe(WORDS_PER_PUZZLE);
  });

  it('draws are fast enough for a 50x20 batch against a 2,000 word bank', () => {
    const fixture = makeFixture(2000);
    const rng = createRng(9);
    const start = performance.now();
    for (let i = 0; i < 50; i++) {
      const pool = createWordPool(fixture);
      for (let j = 0; j < 20; j++) checkSet(pool.drawSet(rng));
    }
    expect(performance.now() - start).toBeLessThan(2000);
  });
});
