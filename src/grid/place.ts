import { DELTA, DIRECTIONS, GRID_SIZE } from '../core/types';
import type { Direction, Grid, Placement, Rng } from '../core/types';
import { shuffle } from '../core/rng';

const DEFAULT_MAX_ATTEMPTS = 200;

/** Every grid cell covered by a placement, in reading order. */
export function cellsOf(p: Placement): Array<{ row: number; col: number }> {
  const { dr, dc } = DELTA[p.dir];
  const cells: Array<{ row: number; col: number }> = [];
  for (let i = 0; i < p.word.length; i++) cells.push({ row: p.row + dr * i, col: p.col + dc * i });
  return cells;
}

interface Candidate {
  row: number;
  col: number;
  dir: Direction;
}

function emptyGrid(): Grid {
  return Array.from({ length: GRID_SIZE }, () => Array.from({ length: GRID_SIZE }, () => ''));
}

function isSubset(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  if (a.size > b.size) return false;
  for (const k of a) if (!b.has(k)) return false;
  return true;
}

/** All in-bounds positions where `word` fits on empty cells or cells with the same letter. */
function candidatesFor(grid: Grid, word: string): Candidate[] {
  const out: Candidate[] = [];
  const len = word.length;
  for (const dir of DIRECTIONS) {
    const { dr, dc } = DELTA[dir];
    const maxRow = GRID_SIZE - 1 - dr * (len - 1);
    const maxCol = GRID_SIZE - 1 - dc * (len - 1);
    for (let row = 0; row <= maxRow; row++) {
      for (let col = 0; col <= maxCol; col++) {
        let ok = true;
        for (let i = 0; i < len; i++) {
          const cell = (grid[row + dr * i] as string[])[col + dc * i] as string;
          if (cell !== '' && cell !== word[i]) {
            ok = false;
            break;
          }
        }
        if (ok) out.push({ row, col, dir });
      }
    }
  }
  return out;
}

function cellKeys(word: string, c: Candidate): Set<number> {
  const { dr, dc } = DELTA[c.dir];
  const keys = new Set<number>();
  for (let i = 0; i < word.length; i++) {
    keys.add((c.row + dr * i) * GRID_SIZE + (c.col + dc * i));
  }
  return keys;
}

function attempt(
  words: readonly string[],
  rng: Rng,
): { grid: Grid; placements: Placement[] } | null {
  const grid = emptyGrid();
  const placements: Placement[] = [];
  const cellSets: Array<Set<number>> = [];
  const usage: Record<Direction, number> = { E: 0, S: 0, SE: 0 };

  // Shuffle first so the (stable) length sort breaks ties randomly.
  const ordered = shuffle(rng, words).toSorted((a, b) => b.length - a.length);

  for (const word of ordered) {
    const candidates = shuffle(rng, candidatesFor(grid, word)).toSorted(
      (a, b) => usage[a.dir] - usage[b.dir],
    );

    let chosen: Candidate | null = null;
    let chosenKeys: Set<number> | null = null;
    for (const c of candidates) {
      const keys = cellKeys(word, c);
      if (cellSets.some((other) => isSubset(keys, other) || isSubset(other, keys))) continue;
      chosen = c;
      chosenKeys = keys;
      break;
    }
    if (chosen === null || chosenKeys === null) return null;

    const { dr, dc } = DELTA[chosen.dir];
    for (let i = 0; i < word.length; i++) {
      (grid[chosen.row + dr * i] as string[])[chosen.col + dc * i] = word[i] as string;
    }
    placements.push({ word, row: chosen.row, col: chosen.col, dir: chosen.dir });
    cellSets.push(chosenKeys);
    usage[chosen.dir]++;
  }
  return { grid, placements };
}

/** Cells are '' when empty. Returns null if it can't place all words within maxAttempts. */
export function placeWords(
  words: readonly string[],
  rng: Rng,
  maxAttempts: number = DEFAULT_MAX_ATTEMPTS,
): { grid: Grid; placements: Placement[] } | null {
  for (let i = 0; i < maxAttempts; i++) {
    const result = attempt(words, rng);
    if (result) return result;
  }
  return null;
}
