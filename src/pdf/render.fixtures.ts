import { GRID_SIZE, type Grid, type Puzzle } from '../core/types';

const FILLER = 'QXZJKVBWPYGFMHDLCUSRNTOAIE';

/** Hand-made puzzle: words laid out on the E direction, one per row, rest is deterministic filler. */
export function makePuzzle(words: readonly string[], offset = 0): Puzzle {
  const sorted = words.toSorted();
  const grid: Grid = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    const row: string[] = [];
    for (let c = 0; c < GRID_SIZE; c++) {
      row.push(FILLER[(r * 7 + c * 3 + offset) % FILLER.length] ?? 'X');
    }
    grid.push(row);
  }
  const placements = words.slice(0, GRID_SIZE).map((word, r) => {
    const col = Math.min(r % 3, GRID_SIZE - word.length);
    for (let i = 0; i < word.length; i++) (grid[r] as string[])[col + i] = word[i] as string;
    return { word, row: r, col, dir: 'E' as const };
  });
  return { grid, words: sorted, placements };
}

export const REALISTIC_WORDS = [
  'PHOTOGRAPHER',
  'GARDEN',
  'FAMILY',
  'WINTER',
  'HOUSE',
  'KITCHEN',
  'MORNING',
  'WINDOW',
  'BLANKET',
  'SUNSHINE',
  'TRAVEL',
  'MUSIC',
];
export const WIDE_WORDS = [
  'WWWWWWWWWWWW',
  'MMMMMMMMMMMM',
  'GARDEN',
  'FAMILY',
  'WINTER',
  'HOUSE',
  'KITCHEN',
  'MORNING',
  'WINDOW',
  'BLANKET',
  'SUNSHINE',
  'TRAVEL',
];
export const SHORT_WORDS = [
  'WALK',
  'HOME',
  'TREE',
  'RAIN',
  'BOOK',
  'SONG',
  'LAMP',
  'FARM',
  'LEAF',
  'MILK',
  'DOOR',
  'SNOW',
];

export function fixturePuzzles(): Puzzle[] {
  return [makePuzzle(REALISTIC_WORDS, 0), makePuzzle(WIDE_WORDS, 5), makePuzzle(SHORT_WORDS, 11)];
}
