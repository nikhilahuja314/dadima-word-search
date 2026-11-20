import { describe, expect, it } from 'vitest';
import { GRID_SIZE } from '../core/types';
import type { Placement } from '../core/types';
import type { Grid } from '../core/types';
import { findBlocklisted, findOccurrences, readableStrings } from './scan';

function blank(ch = ''): Grid {
  return Array.from({ length: GRID_SIZE }, () => Array.from({ length: GRID_SIZE }, () => ch));
}

function put(grid: Grid, row: number, col: number, dr: number, dc: number, word: string): void {
  for (const [i, ch] of [...word].entries()) (grid[row + dr * i] as string[])[col + dc * i] = ch;
}

describe('findOccurrences', () => {
  it('finds E, S and SE occurrences with positions', () => {
    const g = blank('Z');
    put(g, 1, 2, 0, 1, 'HOUSE');
    put(g, 3, 0, 1, 0, 'HOUSE');
    put(g, 5, 5, 1, 1, 'HOUSE');
    expect(findOccurrences(g, 'HOUSE')).toEqual(
      expect.arrayContaining([
        { word: 'HOUSE', row: 1, col: 2, dir: 'E' },
        { word: 'HOUSE', row: 3, col: 0, dir: 'S' },
        { word: 'HOUSE', row: 5, col: 5, dir: 'SE' },
      ]),
    );
    expect(findOccurrences(g, 'HOUSE')).toHaveLength(3);
  });

  it('ignores reversed readings (W, N, NW, NE, SW)', () => {
    const g = blank('Z');
    put(g, 2, 8, 0, -1, 'HOUSE'); // W
    put(g, 9, 0, -1, 0, 'HOUSE'); // N
    put(g, 9, 9, -1, -1, 'HOUSE'); // NW
    expect(findOccurrences(g, 'HOUSE')).toHaveLength(0);
  });

  it('handles words ending exactly at the grid edge', () => {
    const g = blank('Z');
    put(g, 11, 6, 0, 1, 'HOUSES');
    put(g, 6, 6, 1, 1, 'HOUSES');
    expect(findOccurrences(g, 'HOUSES')).toHaveLength(2);
  });
});

describe('readableStrings', () => {
  it('yields strings of the requested lengths in E/S/SE only', () => {
    const g = blank('A');
    put(g, 0, 0, 0, 1, 'ABCDEFGHIJKL');
    const all = [...readableStrings(g, 4, 5)];
    expect(all).toContain('ABCD');
    expect(all).toContain('ABCDE');
    expect(all).not.toContain('ABC');
    expect(all).not.toContain('ABCDEF');
    expect(all).not.toContain('DCBA');
  });

  it('count matches the line arithmetic for a full grid with len 3', () => {
    // rows 12*10 + cols 12*10 + diagonals sum over lengths 3..12 of (len-2) twice-ish
    const n = GRID_SIZE;
    let diag = 0;
    for (let d = -(n - 1); d < n; d++) diag += Math.max(0, n - Math.abs(d) - 2);
    expect([...readableStrings(blank('A'), 3, 3)]).toHaveLength(2 * n * (n - 2) + diag);
  });
});

describe('findBlocklisted', () => {
  const list = new Set(['DAMN', 'ASS']);

  it('finds forward and reversed entries in every direction', () => {
    for (const [dr, dc] of [
      [0, 1],
      [1, 0],
      [1, 1],
      [0, -1],
      [-1, 0],
      [-1, -1],
    ] as const) {
      const g = blank('Q');
      put(g, dr < 0 ? 6 : 4, dc < 0 ? 6 : 4, dr, dc, 'DAMN');
      expect(findBlocklisted(g, list)).toMatch(/^(DAMN|NMAD)$/);
    }
  });

  it('finds anti-diagonal readings (NE / SW), forward and reversed', () => {
    for (const [r, c, dr, dc] of [
      [8, 2, -1, 1], // NE
      [2, 8, 1, -1], // SW
    ] as const) {
      const g = blank('Q');
      put(g, r, c, dr, dc, 'DAMN');
      expect(findBlocklisted(g, list)).toMatch(/^(DAMN|NMAD)$/);
    }
  });

  it('finds anti-diagonal hits at the corners', () => {
    const g = blank('Q');
    put(g, 11, 0, -1, 1, 'ASS');
    expect(findBlocklisted(g, list)).toMatch(/^(ASS|SSA)$/);
    const h = blank('Q');
    put(h, 0, 11, 1, -1, 'ASS');
    expect(findBlocklisted(h, list)).toMatch(/^(ASS|SSA)$/);
  });

  it('returns null for a clean grid and for an empty blocklist', () => {
    expect(findBlocklisted(blank('Q'), list)).toBeNull();
    const g = blank('Q');
    put(g, 0, 0, 0, 1, 'DAMN');
    expect(findBlocklisted(g, new Set())).toBeNull();
  });

  it('works on partial grids and does not read across empty cells', () => {
    const g = blank('');
    (g[0] as string[])[0] = 'A';
    (g[0] as string[])[2] = 'S';
    (g[0] as string[])[3] = 'S';
    expect(findBlocklisted(g, list)).toBeNull();
    (g[0] as string[])[1] = 'S';
    expect(findBlocklisted(g, list)).toBe('ASS');
  });

  it('matches entries at the grid edge, with mixed entry lengths', () => {
    const g = blank('Q');
    put(g, 11, 8, 0, 1, 'NMAD');
    expect(findBlocklisted(g, list)).toBe('NMAD');
    const h = blank('Q');
    put(h, 5, 0, 1, 1, 'ASS');
    expect(findBlocklisted(h, new Set(['ASS', 'LONGERENTRY']))).toBe('ASS');
  });
});

describe('findBlocklisted with placements', () => {
  const list = new Set(['ASS']);

  it('skips hits inside one placement but not hits spanning other cells', () => {
    const g = blank('Q');
    put(g, 3, 3, 0, 1, 'CLASS');
    const classWord: Placement = { word: 'CLASS', row: 3, col: 3, dir: 'E' };
    expect(findBlocklisted(g, list)).toBe('ASS');
    expect(findBlocklisted(g, list, [classWord])).toBeNull();
    // A hit spanning a word's last letter and filler still counts.
    const h = blank('Q');
    put(h, 3, 3, 0, 1, 'PIZZA');
    put(h, 3, 8, 0, 1, 'SS');
    const pizza: Placement = { word: 'PIZZA', row: 3, col: 3, dir: 'E' };
    expect(findBlocklisted(h, list, [pizza])).toBe('ASS');
  });
});
