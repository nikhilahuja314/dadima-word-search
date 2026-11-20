import { describe, expect, it } from 'vitest';
import { MAX_PUZZLES, WORDS_PER_PUZZLE } from './types';
import { generatePuzzles } from './generate';
import blocklistData from './grid/blocklist.json';
import { validatePuzzle } from './grid/fill';

const BLOCKLIST: ReadonlySet<string> = new Set(blocklistData as string[]);

describe('generatePuzzles', () => {
  it('makes 50 valid puzzles with no repeated words', () => {
    const puzzles = generatePuzzles({ count: MAX_PUZZLES, seed: 1 });
    expect(puzzles).toHaveLength(50);
    const seen = new Set<string>();
    for (const p of puzzles) {
      expect(p.words).toHaveLength(WORDS_PER_PUZZLE);
      expect(p.words).toEqual(p.words.toSorted());
      expect(p.placements).toHaveLength(WORDS_PER_PUZZLE);
      for (const w of p.words) {
        expect(seen.has(w)).toBe(false);
        seen.add(w);
      }
      expect(validatePuzzle(p.grid, p.words, BLOCKLIST)).toEqual({ ok: true });
    }
    expect(seen.size).toBe(600);
  });

  it('is deterministic per seed and differs across seeds', () => {
    expect(generatePuzzles({ count: 5, seed: 42 })).toEqual(
      generatePuzzles({ count: 5, seed: 42 }),
    );
    expect(generatePuzzles({ count: 5, seed: 42 })).not.toEqual(
      generatePuzzles({ count: 5, seed: 43 }),
    );
  });

  it('generates 50 puzzles in under 2 seconds', () => {
    const start = performance.now();
    generatePuzzles({ count: MAX_PUZZLES, seed: 7 });
    expect(performance.now() - start).toBeLessThan(2000);
  });

  it('rejects counts outside 1..50', () => {
    expect(() => generatePuzzles({ count: 0 })).toThrow(/1 to 50/);
    expect(() => generatePuzzles({ count: 51 })).toThrow(/1 to 50/);
  });

  it('throws a descriptive error when the bank is too small', () => {
    expect(() => generatePuzzles({ count: 1, seed: 1, bank: ['HOUSE', 'GARDEN'] })).toThrow();
  });
});
