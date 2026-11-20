import { describe, expect, it } from 'vitest';
import { createRng } from '../../../core/rng';
import { DELTA, DIRECTIONS, GRID_SIZE, WORDS_PER_PUZZLE } from '../types';
import type { Direction } from '../types';
import { cellsOf, placeWords } from './place';

const SETS: string[][] = [
  // Near the 90-letter limit with a 12-letter word (89 letters).
  [
    'CONVERSATION',
    'BUTTERFLIES',
    'STRAWBERRY',
    'GARDEN',
    'WINTER',
    'FAMILY',
    'HOUSE',
    'RIVER',
    'MORNING',
    'BLANKET',
    'KITCHEN',
    'PICTURE',
  ],
  // 12-letter word, 88 letters.
  [
    'CHAMPIONSHIP',
    'PLACEHOLDER',
    'DAUGHTER',
    'MOUNTAIN',
    'SUMMER',
    'BRIDGE',
    'CANDLE',
    'FOREST',
    'ORANGE',
    'LANTERN',
    'WINDOW',
    'TRAVEL',
  ],
  [
    'CELEBRATION',
    'NEIGHBOUR',
    'CHOCOLATE',
    'SUNSHINE',
    'COTTAGE',
    'PLANET',
    'FLOWER',
    'BASKET',
    'SPRING',
    'HONEY',
    'CLOUD',
    'STORM',
  ],
  [
    'PERFORMANCE',
    'ADVENTURE',
    'BEAUTIFUL',
    'LIBRARY',
    'TEACHER',
    'BALANCE',
    'FRIEND',
    'SILVER',
    'MARKET',
    'GUITAR',
    'PIANO',
    'OCEAN',
  ],
  [
    'IMAGINATION',
    'WONDERFUL',
    'TELEPHONE',
    'DRAWING',
    'KINGDOM',
    'JOURNEY',
    'SPIRIT',
    'SEASON',
    'TICKET',
    'BREAD',
    'PLANT',
    'WATCH',
  ],
  [
    'GRANDMOTHER',
    'CHAMPION',
    'MIDNIGHT',
    'HOLIDAY',
    'RAINBOW',
    'SCHOOL',
    'MUSEUM',
    'ISLAND',
    'PEPPER',
    'LEMON',
    'TRAIN',
    'CLOCK',
  ],
  [
    'ARCHITECTURE',
    'COMFORTABLE',
    'SANDWICH',
    'PAINTING',
    'COUNTRY',
    'HARVEST',
    'LAUGHTER',
    'POCKET',
    'SILENCE',
    'GIANT',
    'WHEAT',
    'BROOK',
  ],
  [
    'CHILDHOOD',
    'DIAMOND',
    'EVENING',
    'FARMER',
    'GLOVES',
    'HAMMER',
    'ISLAND',
    'JACKET',
    'KETTLE',
    'LADDER',
    'MIRROR',
    'NEEDLE',
  ],
];

function checkSetRules(words: readonly string[]): string[] {
  const errors: string[] = [];
  if (words.length !== WORDS_PER_PUZZLE) errors.push('wrong count');
  if (new Set(words).size !== words.length) errors.push('duplicates');
  for (const a of words) {
    if (!/^[A-Z]{4,12}$/.test(a)) errors.push(`bad word ${a}`);
    for (const b of words) if (a !== b && b.includes(a)) errors.push(`${a} in ${b}`);
  }
  if (words.filter((w) => w.length >= 9).length > 3) errors.push('too many long words');
  if (words.filter((w) => w.length <= 6).length < 4) errors.push('too few short words');
  if (words.join('').length > 90) errors.push('too many letters');
  return errors;
}

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);

function run(seed: number) {
  const words = SETS[seed % SETS.length] as string[];
  return { words, result: placeWords(words, createRng(seed)) };
}

describe('placement fixtures', () => {
  it('obey the word-set rules', () => {
    for (const set of SETS) expect(checkSetRules(set)).toEqual([]);
    expect(SETS.some((s) => s.join('').length >= 85 && s.some((w) => w.length === 12))).toBe(true);
  });
});

describe('cellsOf', () => {
  it('lists cells along the direction', () => {
    expect(cellsOf({ word: 'ABC', row: 1, col: 2, dir: 'SE' })).toEqual([
      { row: 1, col: 2 },
      { row: 2, col: 3 },
      { row: 3, col: 4 },
    ]);
    expect(cellsOf({ word: 'AB', row: 0, col: 0, dir: 'S' })).toEqual([
      { row: 0, col: 0 },
      { row: 1, col: 0 },
    ]);
  });
});

describe('placeWords', () => {
  it('places every word, reads back correctly, in bounds, allowed directions only', () => {
    for (const seed of SEEDS) {
      const { words, result } = run(seed);
      expect(result, `seed ${seed}`).not.toBeNull();
      const { grid, placements } = result as NonNullable<typeof result>;
      expect(grid).toHaveLength(GRID_SIZE);
      expect(placements.map((p) => p.word).toSorted()).toEqual([...words].toSorted());
      for (const p of placements) {
        expect(DIRECTIONS).toContain(p.dir);
        const cells = cellsOf(p);
        expect(cells).toHaveLength(p.word.length);
        let read = '';
        for (const { row, col } of cells) {
          expect(row).toBeGreaterThanOrEqual(0);
          expect(row).toBeLessThan(GRID_SIZE);
          expect(col).toBeGreaterThanOrEqual(0);
          expect(col).toBeLessThan(GRID_SIZE);
          read += (grid[row] as string[])[col];
        }
        expect(read).toBe(p.word);
      }
    }
  });

  it('keeps overlapping cells consistent and leaves unused cells empty', () => {
    for (const seed of SEEDS) {
      const { result } = run(seed);
      const { grid, placements } = result as NonNullable<typeof result>;
      const owned = new Map<string, string>();
      for (const p of placements) {
        const { dr, dc } = DELTA[p.dir];
        for (let i = 0; i < p.word.length; i++) {
          const key = `${p.row + dr * i},${p.col + dc * i}`;
          const letter = p.word[i] as string;
          expect(owned.get(key) ?? letter).toBe(letter);
          owned.set(key, letter);
        }
      }
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          const cell = (grid[r] as string[])[c];
          expect(cell).toBe(owned.get(`${r},${c}`) ?? '');
        }
      }
    }
  });

  it('never nests one placement inside another', () => {
    for (const seed of SEEDS) {
      const { result } = run(seed);
      const sets = (result as NonNullable<typeof result>).placements.map(
        (p) => new Set(cellsOf(p).map((c) => c.row * GRID_SIZE + c.col)),
      );
      for (const [i, a] of sets.entries()) {
        for (const [j, b] of sets.entries()) {
          if (i !== j) expect([...a].every((k) => b.has(k))).toBe(false);
        }
      }
    }
  });

  it('uses each direction for at least 20% of placements across 200 puzzles', () => {
    const counts: Record<Direction, number> = { E: 0, S: 0, SE: 0 };
    let total = 0;
    for (const seed of SEEDS) {
      for (const p of (run(seed).result as NonNullable<ReturnType<typeof run>['result']>)
        .placements) {
        counts[p.dir]++;
        total++;
      }
    }
    for (const dir of DIRECTIONS) expect(counts[dir] / total).toBeGreaterThanOrEqual(0.2);
  });

  it('is deterministic per seed', () => {
    for (const seed of [1, 2, 3, 42, 99]) {
      expect(run(seed).result).toEqual(run(seed).result);
    }
    expect(run(1).result).not.toEqual(placeWords(SETS[1] as string[], createRng(777)));
  });

  it('returns null when words cannot fit', () => {
    const words = Array.from({ length: 13 }, () => 'ABCDEFGHIJKL');
    expect(placeWords(words, createRng(1), 3)).toBeNull();
  });
});
