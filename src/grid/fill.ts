import { randInt } from '../core/rng';
import type { Grid, Rng } from '../core/types';
import { findBlocklisted, findOccurrences } from './scan';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DEFAULT_MAX_FILLS = 50;

/** Replaces '' cells with uniform random A–Z; returns a new grid. */
export function fillGrid(partial: Grid, rng: Rng): Grid {
  return partial.map((row) =>
    row.map((cell) => (cell === '' ? (ALPHABET[randInt(rng, 26)] as string) : cell)),
  );
}

export function validatePuzzle(
  grid: Grid,
  words: readonly string[],
  blocklist: ReadonlySet<string>,
): { ok: true } | { ok: false; reason: string } {
  for (const [r, row] of grid.entries()) {
    for (const [c, cell] of row.entries()) {
      if (!/^[A-Z]$/.test(cell)) {
        return { ok: false, reason: `Invalid cell at (${r}, ${c}): ${JSON.stringify(cell)}` };
      }
    }
  }
  for (const word of words) {
    const n = findOccurrences(grid, word).length;
    if (n !== 1) return { ok: false, reason: `Word ${word} occurs ${n} times (expected 1)` };
  }
  // Each word occurs exactly once here, so these are the real placements. Hits wholly inside one
  // word (CLASS containing ASS) are fine; only hits involving filler or 2+ words count.
  const placements = words.flatMap((w) => findOccurrences(grid, w));
  const hit = findBlocklisted(grid, blocklist, placements);
  if (hit !== null) return { ok: false, reason: `Blocklisted string ${hit} is readable` };
  return { ok: true };
}

/**
 * Fill + validate, retrying the fill up to maxFills times. Returns null if never valid, or
 * immediately if the placed letters alone already spell a blocklisted string across words (hits wholly inside one placed word are ignored; refilling can't
 * help, so the caller should redraw words).
 */
export function fillAndValidate(
  partial: Grid,
  words: readonly string[],
  rng: Rng,
  blocklist: ReadonlySet<string>,
  maxFills: number = DEFAULT_MAX_FILLS,
): Grid | null {
  const placements = words.flatMap((w) => findOccurrences(partial, w));
  if (findBlocklisted(partial, blocklist, placements) !== null) return null;
  for (let i = 0; i < maxFills; i++) {
    const grid = fillGrid(partial, rng);
    if (validatePuzzle(grid, words, blocklist).ok) return grid;
  }
  return null;
}
