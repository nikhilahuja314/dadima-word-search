import { createRng } from '../../core/rng';
import { MAX_PUZZLES } from './types';
import type { Puzzle } from './types';
import blocklistData from './grid/blocklist.json';
import { fillAndValidate } from './grid/fill';
import { placeWords } from './grid/place';
import { WORD_BANK } from './words/bank';
import { createWordPool } from './words/select';

export interface GenerateOptions {
  count: number;
  seed?: number;
  bank?: readonly string[];
}

const BLOCKLIST: ReadonlySet<string> = new Set(blocklistData as string[]);
const MAX_TRIES_PER_PUZZLE = 20;

/** Optional hook so stress tests can count redraws without changing the public result. */
export interface GenerateStats {
  redraws: number;
}

export function generatePuzzles(opts: GenerateOptions, stats?: GenerateStats): Puzzle[] {
  const { count } = opts;
  if (!Number.isInteger(count) || count < 1 || count > MAX_PUZZLES) {
    throw new Error(`Puzzle count must be an integer from 1 to ${MAX_PUZZLES}, got ${count}`);
  }
  const seed = opts.seed ?? Date.now() >>> 0;
  const rng = createRng(seed);
  const pool = createWordPool(opts.bank ?? WORD_BANK);
  const puzzles: Puzzle[] = [];

  for (let n = 0; n < count; n++) {
    let puzzle: Puzzle | null = null;
    let lastFailure = '';
    for (let attempt = 0; attempt < MAX_TRIES_PER_PUZZLE && puzzle === null; attempt++) {
      const words = pool.drawSet(rng);
      const placed = placeWords(words, rng);
      const grid = placed ? fillAndValidate(placed.grid, words, rng, BLOCKLIST) : null;
      if (placed && grid) {
        puzzle = { grid, words: words.toSorted(), placements: placed.placements };
      } else {
        lastFailure = placed ? 'filler could not be made valid' : 'words could not be placed';
        pool.release(words);
        if (stats) stats.redraws++;
      }
    }
    if (puzzle === null) {
      throw new Error(
        `Could not generate puzzle ${n + 1} of ${count} after ${MAX_TRIES_PER_PUZZLE} tries ` +
          `(seed ${seed}; last failure: ${lastFailure})`,
      );
    }
    puzzles.push(puzzle);
  }
  return puzzles;
}
