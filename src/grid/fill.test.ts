import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng';
import { GRID_SIZE } from '../core/types';
import type { Grid } from '../core/types';
import { fillAndValidate, fillGrid, validatePuzzle } from './fill';
import { placeWords } from './place';
import { findBlocklisted } from './scan';

const BLOCK = new Set(['DAMN', 'ASS', 'HELL', 'SEX', 'GOD']);

const SETS: string[][] = [
  [
    'GARDEN',
    'WINTER',
    'FAMILY',
    'HOUSE',
    'RIVER',
    'MORNING',
    'BLANKET',
    'KITCHEN',
    'PICTURE',
    'BRIDGE',
    'CANDLE',
    'FOREST',
  ],
  [
    'MOUNTAIN',
    'SUMMER',
    'DAUGHTER',
    'ORANGE',
    'LANTERN',
    'WINDOW',
    'TRAVEL',
    'PLANET',
    'SILVER',
    'MARKET',
    'COTTON',
    'BASKET',
  ],
  [
    'CELEBRATION',
    'NEIGHBOUR',
    'PUMPKIN',
    'THUNDER',
    'PILLOW',
    'SPRING',
    'CASTLE',
    'PEPPER',
    'TICKET',
    'VALLEY',
    'MIRROR',
    'FLOWER',
  ],
];

function blank(ch = ''): Grid {
  return Array.from({ length: GRID_SIZE }, () => Array.from({ length: GRID_SIZE }, () => ch));
}

/** Filler that can't create anything: a repeating pattern avoiding the test words' letters. */
function base(): Grid {
  const g = blank('Q');
  return g;
}

function put(grid: Grid, row: number, col: number, dr: number, dc: number, word: string): void {
  for (const [i, ch] of [...word].entries()) (grid[row + dr * i] as string[])[col + dc * i] = ch;
}

describe('validatePuzzle', () => {
  it('accepts a clean grid with each word exactly once', () => {
    const g = base();
    put(g, 0, 0, 0, 1, 'GARDEN');
    expect(validatePuzzle(g, ['GARDEN'], BLOCK)).toEqual({ ok: true });
  });

  it('fails when a word appears twice', () => {
    const g = base();
    put(g, 0, 0, 0, 1, 'GARDEN');
    put(g, 4, 3, 1, 1, 'GARDEN');
    const r = validatePuzzle(g, ['GARDEN'], BLOCK);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain('GARDEN');
  });

  it('fails when a word is missing, and does not count a reversed reading', () => {
    const g = base();
    put(g, 0, 11, 0, -1, 'GARDEN');
    const r = validatePuzzle(g, ['GARDEN'], BLOCK);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain('0 times');
  });

  it('fails on a blocklisted word reading forwards and backwards', () => {
    for (const [word, dr, dc] of [
      ['DAMN', 0, 1],
      ['NMAD', 0, 1],
      ['NMAD', 1, 0],
      ['DAMN', 1, 1],
    ] as const) {
      const g = base();
      put(g, 2, 2, dr, dc, word);
      const r = validatePuzzle(g, [], BLOCK);
      expect(r.ok).toBe(false);
      expect(!r.ok && r.reason).toContain('Blocklisted');
    }
  });

  it('fails on empty or non A-Z cells', () => {
    const g = base();
    (g[3] as string[])[3] = '';
    expect(validatePuzzle(g, [], BLOCK).ok).toBe(false);
    (g[3] as string[])[3] = 'a';
    expect(validatePuzzle(g, [], BLOCK).ok).toBe(false);
    (g[3] as string[])[3] = 'AB';
    expect(validatePuzzle(g, [], BLOCK).ok).toBe(false);
  });
});

describe('validatePuzzle: blocklist hits inside placed words', () => {
  it('ignores a hit wholly inside one placed word (CLASS contains ASS), in any direction', () => {
    for (const [dr, dc] of [
      [0, 1],
      [1, 0],
      [1, 1],
    ] as const) {
      const g = base();
      put(g, 2, 2, dr, dc, 'CLASS');
      expect(validatePuzzle(g, ['CLASS'], new Set(['ASS']))).toEqual({ ok: true });
    }
  });

  it('ignores a reversed hit inside one placed word', () => {
    const g = base();
    put(g, 1, 1, 0, 1, 'CLASS');
    expect(validatePuzzle(g, ['CLASS'], new Set(['SSA']))).toEqual({ ok: true });
  });

  it('fails when filler next to a word forms the hit', () => {
    const g = base();
    put(g, 5, 0, 0, 1, 'GARDEN');
    (g[5] as string[])[6] = 'A';
    (g[5] as string[])[7] = 'S';
    (g[5] as string[])[8] = 'S';
    // "ASS" in filler cells only.
    expect(validatePuzzle(g, ['GARDEN'], BLOCK).ok).toBe(false);
    // Hit straddling a word's last letter (A) and filler (SS).
    const h = base();
    put(h, 5, 0, 0, 1, 'PIZZA');
    (h[5] as string[])[5] = 'S';
    (h[5] as string[])[6] = 'S';
    const r = validatePuzzle(h, ['PIZZA'], BLOCK);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain('ASS');
  });

  it('fails when the hit is formed across two placed words', () => {
    const h = base();
    put(h, 3, 0, 0, 1, 'PIZZA'); // A at (3,4)
    put(h, 3, 5, 0, 1, 'SSIGN'); // S S at (3,5),(3,6): A+SS across both words
    const r = validatePuzzle(h, ['PIZZA', 'SSIGN'], BLOCK);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain('ASS');
  });
});

describe('fillGrid', () => {
  it('keeps placed letters, fills every empty cell, and does not mutate the input', () => {
    const partial = blank('');
    put(partial, 3, 1, 0, 1, 'HOUSE');
    const snapshot = structuredClone(partial);
    const out = fillGrid(partial, createRng(5));
    expect(partial).toEqual(snapshot);
    for (const [r, row] of out.entries()) {
      for (const [c, cell] of row.entries()) {
        expect(cell).toMatch(/^[A-Z]$/);
        const orig = (partial[r] as string[])[c] as string;
        if (orig !== '') expect(cell).toBe(orig);
      }
    }
  });

  it('is roughly uniform over A-Z (2-6% each over 100k cells)', () => {
    const rng = createRng(99);
    const counts = new Map<string, number>();
    let total = 0;
    for (let i = 0; i < 695; i++) {
      for (const row of fillGrid(blank(''), rng)) {
        for (const cell of row) {
          counts.set(cell, (counts.get(cell) ?? 0) + 1);
          total++;
        }
      }
    }
    expect(total).toBeGreaterThanOrEqual(100_000);
    expect(counts.size).toBe(26);
    for (const n of counts.values()) {
      expect(n / total).toBeGreaterThan(0.02);
      expect(n / total).toBeLessThan(0.06);
    }
  });
});

describe('fillAndValidate', () => {
  it('returns a valid grid for 200 seeds of placeWords output', () => {
    let nulls = 0;
    for (let seed = 0; seed < 200; seed++) {
      const rng = createRng(seed);
      const words = SETS[seed % SETS.length] as string[];
      const placed = placeWords(words, rng);
      expect(placed).not.toBeNull();
      const grid = fillAndValidate(placed!.grid, words, rng, BLOCK);
      if (grid === null) {
        // Only legitimate when the placed letters alone already spell a blocklisted string.
        expect(findBlocklisted(placed!.grid, BLOCK)).not.toBeNull();
        nulls++;
        continue;
      }
      expect(validatePuzzle(grid, words, BLOCK)).toEqual({ ok: true });
      // Placed words are untouched.
      for (const p of placed!.placements) {
        expect(findAt(grid, p)).toBe(p.word);
      }
    }
    expect(nulls).toBeLessThan(30);
  });

  it('is deterministic per seed', () => {
    const words = SETS[0] as string[];
    const run = (): Grid | null => {
      const rng = createRng(7);
      const placed = placeWords(words, rng)!;
      return fillAndValidate(placed.grid, words, rng, BLOCK);
    };
    expect(run()).toEqual(run());
  });

  it('returns null immediately when placed letters alone spell a blocklisted string', () => {
    const partial = blank('');
    put(partial, 0, 0, 0, 1, 'HELLO'); // contains HELL
    let calls = 0;
    const rng = () => {
      calls++;
      return 0.5;
    };
    expect(fillAndValidate(partial, [], rng, BLOCK)).toBeNull();
    expect(calls).toBe(0);
  });

  it('early-exits on a reversed placed hit too', () => {
    const partial = blank('');
    put(partial, 2, 0, 1, 0, 'NMAD');
    expect(fillAndValidate(partial, [], createRng(1), BLOCK)).toBeNull();
  });

  it('does not early-exit when a hit would need filler cells', () => {
    const partial = blank('');
    put(partial, 0, 0, 0, 1, 'DAM'); // N would be filler
    expect(fillAndValidate(partial, [], createRng(1), BLOCK)).not.toBeNull();
  });

  it('does not early-exit on a hit wholly inside one placed word', () => {
    const partial = blank('');
    put(partial, 4, 2, 0, 1, 'CLASS');
    const grid = fillAndValidate(partial, ['CLASS'], createRng(3), new Set(['ASS']));
    expect(grid).not.toBeNull();
  });

  it('early-exits on a hit formed across two placed words', () => {
    const partial = blank('');
    put(partial, 3, 0, 0, 1, 'PIZZA');
    put(partial, 3, 5, 0, 1, 'SSIGN');
    let calls = 0;
    const rng = () => {
      calls++;
      return 0.5;
    };
    expect(fillAndValidate(partial, ['PIZZA', 'SSIGN'], rng, BLOCK)).toBeNull();
    expect(calls).toBe(0);
  });

  it('returns null when maxFills is exhausted', () => {
    // Blocklist every single letter: no fill can ever be valid.
    const all = new Set('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    expect(fillAndValidate(blank(''), [], createRng(1), all, 3)).toBeNull();
  });
});

function findAt(grid: Grid, p: { word: string; row: number; col: number; dir: string }): string {
  const d = p.dir === 'E' ? [0, 1] : p.dir === 'S' ? [1, 0] : [1, 1];
  let s = '';
  for (let i = 0; i < p.word.length; i++) {
    s += (grid[p.row + (d[0] as number) * i] as string[])[p.col + (d[1] as number) * i];
  }
  return s;
}
