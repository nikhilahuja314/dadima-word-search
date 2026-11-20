import { DELTA, DIRECTIONS, GRID_SIZE } from '../types';
import type { Grid, Placement } from '../types';

/** Cell text used to break runs where the grid has an empty ('') cell. */
const GAP = ' ';

/** All occurrences of `word` reading in the allowed directions (E, S, SE) only. */
export function findOccurrences(grid: Grid, word: string): Placement[] {
  const out: Placement[] = [];
  const len = word.length;
  if (len === 0) return out;
  const rows = grid.length;
  for (const dir of DIRECTIONS) {
    const { dr, dc } = DELTA[dir];
    for (let row = 0; row < rows; row++) {
      const cols = (grid[row] as string[]).length;
      if (row + dr * (len - 1) >= rows) continue;
      for (let col = 0; col + dc * (len - 1) < cols; col++) {
        let ok = true;
        for (let i = 0; i < len; i++) {
          if ((grid[row + dr * i] as string[])[col + dc * i] !== word[i]) {
            ok = false;
            break;
          }
        }
        if (ok) out.push({ word, row, col, dir });
      }
    }
  }
  return out;
}

/**
 * Lines of the grid as strings: rows, columns, SE diagonals, and (if includeAnti) anti-diagonals.
 * Each is read in one direction only; reverses are handled by the caller.
 */
function lines(grid: Grid, includeAnti = false): string[] {
  const n = GRID_SIZE;
  const cell = (r: number, c: number): string => (grid[r] as string[])[c] || GAP;
  const out: string[] = [];
  for (let r = 0; r < n; r++) {
    let s = '';
    for (let c = 0; c < n; c++) s += cell(r, c);
    out.push(s);
  }
  for (let c = 0; c < n; c++) {
    let s = '';
    for (let r = 0; r < n; r++) s += cell(r, c);
    out.push(s);
  }
  // SE diagonals, starting from the top row and left column.
  for (let start = -(n - 1); start < n; start++) {
    let s = '';
    for (let r = Math.max(0, -start); r < n && r + start < n; r++) s += cell(r, r + start);
    out.push(s);
  }
  if (includeAnti) {
    // SW-NE anti-diagonals (r + c = k), read top-right to bottom-left.
    for (let k = 0; k <= 2 * (n - 1); k++) {
      let s = '';
      for (let r = Math.max(0, k - (n - 1)); r < n && r <= k; r++) s += cell(r, k - r);
      out.push(s);
    }
  }
  return out;
}

/** Every string of length minLen..maxLen readable in allowed directions. Used for the blocklist check. */
export function* readableStrings(grid: Grid, minLen: number, maxLen: number): Generator<string> {
  for (const line of lines(grid)) {
    for (let i = 0; i < line.length; i++) {
      const max = Math.min(maxLen, line.length - i);
      for (let len = minLen; len <= max; len++) {
        const s = line.slice(i, i + len);
        if (!s.includes(GAP)) yield s;
      }
    }
  }
}

function reverse(s: string): string {
  let out = '';
  for (let i = s.length - 1; i >= 0; i--) out += s[i];
  return out;
}

interface BlocklistIndex {
  /** Entries plus their reverses. */
  both: Set<string>;
  lengths: number[];
}

const indexCache = new WeakMap<ReadonlySet<string>, BlocklistIndex>();

function indexOf(blocklist: ReadonlySet<string>): BlocklistIndex {
  let idx = indexCache.get(blocklist);
  if (!idx) {
    const both = new Set<string>();
    const lengths = new Set<number>();
    for (const w of blocklist) {
      both.add(w);
      both.add(reverse(w));
      lengths.add(w.length);
    }
    idx = { both, lengths: [...lengths].toSorted((a, b) => a - b) };
    indexCache.set(blocklist, idx);
  }
  return idx;
}

interface LineSpec {
  /** Text of the line, with GAP for empty cells. */
  text: string;
  row: number;
  col: number;
  dr: number;
  dc: number;
}

/** Lines of the grid in all 4 axes (rows, columns, SE diagonals, SW-NE anti-diagonals) with origin and step. */
function lineSpecs(grid: Grid): LineSpec[] {
  const n = GRID_SIZE;
  const cell = (r: number, c: number): string => (grid[r] as string[])[c] || GAP;
  const out: LineSpec[] = [];
  for (let r = 0; r < n; r++) {
    let text = '';
    for (let c = 0; c < n; c++) text += cell(r, c);
    out.push({ text, row: r, col: 0, dr: 0, dc: 1 });
  }
  for (let c = 0; c < n; c++) {
    let text = '';
    for (let r = 0; r < n; r++) text += cell(r, c);
    out.push({ text, row: 0, col: c, dr: 1, dc: 0 });
  }
  for (let start = -(n - 1); start < n; start++) {
    let text = '';
    const r0 = Math.max(0, -start);
    for (let r = r0; r < n && r + start < n; r++) text += cell(r, r + start);
    out.push({ text, row: r0, col: r0 + start, dr: 1, dc: 1 });
  }
  for (let k = 0; k <= 2 * (n - 1); k++) {
    let text = '';
    const r0 = Math.max(0, k - (n - 1));
    for (let r = r0; r < n && r <= k; r++) text += cell(r, k - r);
    out.push({ text, row: r0, col: k - r0, dr: 1, dc: -1 });
  }
  return out;
}

function cellKeysOf(p: Placement): Set<number> {
  const { dr, dc } = DELTA[p.dir];
  const keys = new Set<number>();
  for (let i = 0; i < p.word.length; i++) keys.add((p.row + dr * i) * GRID_SIZE + p.col + dc * i);
  return keys;
}

/**
 * First blocklisted string readable in any of the 8 compass directions (rows, columns, both
 * diagonals, forwards or reversed), or null. Empty ('') cells break runs, so this also works on partial grids.
 *
 * If `placements` is given, hits whose cells all lie inside a single placement's cells (e.g. ASS
 * inside a placed CLASS, in any direction) are ignored; only hits involving other cells count.
 */
export function findBlocklisted(
  grid: Grid,
  blocklist: ReadonlySet<string>,
  placements: readonly Placement[] = [],
): string | null {
  const { both, lengths } = indexOf(blocklist);
  if (lengths.length === 0) return null;
  let placementCells: Set<number>[] | null = null;
  for (const { text, row, col, dr, dc } of lineSpecs(grid)) {
    for (let i = 0; i < text.length; i++) {
      for (const len of lengths) {
        if (i + len > text.length) break;
        const s = text.slice(i, i + len);
        if (!both.has(s) || s.includes(GAP)) continue;
        if (placements.length > 0) {
          placementCells ??= placements.map(cellKeysOf);
          const keys: number[] = [];
          for (let k = 0; k < len; k++)
            keys.push((row + dr * (i + k)) * GRID_SIZE + col + dc * (i + k));
          if (placementCells.some((pc) => keys.every((key) => pc.has(key)))) continue;
        }
        return s;
      }
    }
  }
  return null;
}
