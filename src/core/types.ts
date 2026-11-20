export const GRID_SIZE = 12;
export const WORDS_PER_PUZZLE = 12;
export const MIN_WORD_LEN = 4;
export const MAX_WORD_LEN = 12;
export const MAX_PUZZLES = 50;

/** E = left→right, S = top→bottom, SE = diagonal top-left→bottom-right. No reversed directions. */
export type Direction = 'E' | 'S' | 'SE';
export const DIRECTIONS: readonly Direction[] = ['E', 'S', 'SE'];
export const DELTA: Record<Direction, { dr: number; dc: number }> = {
  E: { dr: 0, dc: 1 },
  S: { dr: 1, dc: 0 },
  SE: { dr: 1, dc: 1 },
};

export interface Placement {
  word: string;
  row: number;
  col: number;
  dir: Direction;
}

/** grid[row][col], each cell a single uppercase A–Z char. */
export type Grid = string[][];

export interface Puzzle {
  grid: Grid;
  /** Words as listed for the solver, sorted alphabetically. */
  words: string[];
  placements: Placement[];
}

/** Returns a float in [0, 1). */
export type Rng = () => number;
