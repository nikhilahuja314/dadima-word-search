/**
 * Independent verification harness (PLAN.md S10). Run with `pnpm verify`.
 * Deliberately does NOT use validatePuzzle / findOccurrences: all scanning is re-implemented here.
 * Phase 1: time generation + PDF render for a 50-puzzle batch and write docs/verification/verify-50.pdf.
 * Phase 2: SEEDS x 50 puzzles re-checked from scratch against the spec rules.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import blocklistData from '../src/activities/word-search/grid/blocklist.json';
import { generatePuzzles } from '../src/activities/word-search/generate';
import { LAYOUT, computeLayout, renderPdf } from '../src/activities/word-search/pdf/render';
import type { Puzzle } from '../src/activities/word-search/types';

const SEEDS = 20;
const PER_BATCH = 50;
const N = 12;
const BLOCK = (blocklistData as string[]).map((b) => b.toUpperCase());
const DIRS3: Array<[string, number, number]> = [
  ['E', 0, 1],
  ['S', 1, 0],
  ['SE', 1, 1],
];

type Cell = [number, number];
const key = (r: number, c: number) => r * N + c;

/** All lines of the grid in 4 orientations as lists of cell coordinates (each read forward only). */
function allLines(): Cell[][] {
  const lines: Cell[][] = [];
  for (const [, dr, dc] of [...DIRS3, ['SW', 1, -1] as [string, number, number]]) {
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const pr = r - dr;
        const pc = c - dc;
        if (pr >= 0 && pr < N && pc >= 0 && pc < N) continue; // not a line start
        const line: Cell[] = [];
        for (let rr = r, cc = c; rr >= 0 && rr < N && cc >= 0 && cc < N; rr += dr, cc += dc) {
          line.push([rr, cc]);
        }
        lines.push(line);
      }
    }
  }
  return lines;
}
const LINES = allLines();

function occurrences3(
  grid: string[][],
  word: string,
): Array<{ dir: string; r: number; c: number }> {
  const out: Array<{ dir: string; r: number; c: number }> = [];
  for (const [name, dr, dc] of DIRS3) {
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const er = r + dr * (word.length - 1);
        const ec = c + dc * (word.length - 1);
        if (er >= N || ec >= N) continue;
        let ok = true;
        for (let i = 0; i < word.length && ok; i++) {
          ok = grid[r + dr * i]![c + dc * i] === word[i];
        }
        if (ok) out.push({ dir: name as string, r, c });
      }
    }
  }
  return out;
}

function checkBatch(
  puzzles: Puzzle[],
  seed: number,
  errors: string[],
  dirTotals: Record<string, number>,
) {
  const fail = (i: number, m: string) => errors.push(`seed ${seed} puzzle ${i}: ${m}`);
  const seen = new Map<string, number>();
  puzzles.forEach((p, i) => {
    // shape
    if (p.grid.length !== N) fail(i, `grid has ${p.grid.length} rows`);
    for (const row of p.grid) {
      if (row.length !== N) fail(i, `row length ${row.length}`);
      for (const ch of row) if (!/^[A-Z]$/.test(ch)) fail(i, `bad cell ${JSON.stringify(ch)}`);
    }
    // word list
    if (p.words.length !== 12) fail(i, `${p.words.length} words`);
    if (new Set(p.words).size !== p.words.length) fail(i, 'duplicate word in puzzle');
    const sorted = p.words.toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    if (sorted.join() !== p.words.join()) fail(i, 'word list not alphabetical');
    for (const w of p.words) {
      if (!/^[A-Z]{4,12}$/.test(w)) fail(i, `bad word ${w}`);
      const prev = seen.get(w);
      if (prev !== undefined) fail(i, `${w} repeats puzzle ${prev}`);
      seen.set(w, i);
    }
    // containment
    for (const a of p.words)
      for (const b of p.words) {
        if (a !== b && b.includes(a)) fail(i, `${a} contained in ${b}`);
      }
    // exactly once, E/S/SE
    const dirs = new Set<string>();
    const cellSets: Array<Set<number>> = [];
    for (const w of p.words) {
      const occ = occurrences3(p.grid, w);
      if (occ.length !== 1) {
        fail(i, `${w} found ${occ.length} times`);
        continue;
      }
      const o = occ[0]!;
      dirs.add(o.dir);
      dirTotals[o.dir] = (dirTotals[o.dir] ?? 0) + 1;
      const [, dr, dc] = DIRS3.find((d) => d[0] === o.dir)!;
      const s = new Set<number>();
      for (let k = 0; k < w.length; k++) s.add(key(o.r + dr * k, o.c + dc * k));
      cellSets.push(s);
    }
    if (dirs.size < 2) fail(i, `only direction(s) ${[...dirs].join(',')}`);
    // blocklist, all 8 directions
    for (const line of LINES) {
      const str = line.map(([r, c]) => p.grid[r]![c]).join('');
      for (const b of BLOCK) {
        for (const pat of new Set([b, b.split('').toReversed().join('')])) {
          for (let at = str.indexOf(pat); at !== -1; at = str.indexOf(pat, at + 1)) {
            const cells = line.slice(at, at + pat.length).map(([r, c]) => key(r, c));
            const inside = cellSets.some((s) => cells.every((k) => s.has(k)));
            if (!inside) fail(i, `blocklisted ${b} (as ${pat}) readable outside a single word`);
          }
        }
      }
    }
  });
}

/** Self-test (VERIFY_MUTATE=1): corrupt puzzles so we can see the checker actually fails. */
function mutate(puzzles: Puzzle[]): void {
  const [a, b, c, d] = puzzles as [Puzzle, Puzzle, Puzzle, Puzzle];
  a.grid[0]![0] = a.grid[0]![0] === 'Q' ? 'Z' : 'Q'; // may or may not break; plus below
  b.words = b.words.toReversed(); // not alphabetical
  c.words = [c.words[0]!, ...c.words.slice(0, 11)]; // duplicate word
  const w = d.words[0]!;
  const p = d.placements.find((x) => x.word === w)!;
  d.grid[p.row]![p.col] = '#'; // bad cell + word missing
  // plant a blocklisted string in filler-ish spot: overwrite the last row with FUCK
  for (const [i, ch] of [...'FUCK'].entries()) a.grid[11]![i] = ch;
}

async function main() {
  mkdirSync('docs/verification', { recursive: true });

  // Phase 1: timing (3 runs, different seeds; the first includes JIT warm-up like a real first click).
  const timings: string[] = [];
  let worst = 0;
  for (const seed of [20261120, 7, 99991]) {
    const t0 = performance.now();
    const puzzles = generatePuzzles({ count: 50, seed });
    const t1 = performance.now();
    const bytes = await renderPdf(puzzles);
    const t2 = performance.now();
    const total = t2 - t0;
    worst = Math.max(worst, total);
    timings.push(
      `seed ${seed}: generate ${(t1 - t0).toFixed(0)} ms, render ${(t2 - t1).toFixed(0)} ms, ` +
        `total ${total.toFixed(0)} ms, ${bytes.length} bytes`,
    );
    if (seed === 20261120) {
      writeFileSync('docs/verification/verify-50.pdf', bytes);
      const doc = await PDFDocument.load(bytes);
      if (doc.getPageCount() !== 50) throw new Error(`PDF has ${doc.getPageCount()} pages`);
    }
  }
  console.log(timings.join('\n'));
  console.log(
    `worst total ${worst.toFixed(0)} ms (budget 5000 ms): ${worst < 5000 ? 'PASS' : 'FAIL'}`,
  );

  // Phase 2: independent re-verification.
  const errors: string[] = [];
  const dirTotals: Record<string, number> = {};
  let puzzleCount = 0;
  const t0 = performance.now();
  for (let seed = 1; seed <= SEEDS; seed++) {
    const puzzles = generatePuzzles({ count: PER_BATCH, seed });
    puzzleCount += puzzles.length;
    if (process.env.VERIFY_MUTATE) mutate(puzzles);
    checkBatch(puzzles, seed, errors, dirTotals);
  }
  // Phase 3: longest-word column check. Width of checkbox + gap + widest word (measured with real
  // Helvetica metrics, computed here independently of fitFontSize) must fit the column at the
  // font size the renderer would choose; report the smallest list font any puzzle needs.
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const g = computeLayout();
    let minSize = Infinity;
    let worstWord = '';
    for (let seed = 1; seed <= 3; seed++) {
      for (const p of generatePuzzles({ count: 50, seed })) {
        for (let col = 0; col < 2; col++) {
          const ws = p.words.slice(col * 6, col * 6 + 6);
          const widest = Math.max(...ws.map((w) => font.widthOfTextAtSize(w, 1)));
          const size = Math.min(
            LAYOUT.listFontSize,
            g.columnWidth / (LAYOUT.checkboxSize + LAYOUT.checkboxGap + widest),
          );
          if (size < minSize) {
            minSize = size;
            worstWord = ws.find((w) => font.widthOfTextAtSize(w, 1) === widest) ?? '';
          }
        }
      }
    }
    console.log(
      `list font: nominal ${LAYOUT.listFontSize}pt, smallest needed over 150 puzzles ${minSize.toFixed(1)}pt (${worstWord}); ` +
        `last list baseline ${g.listBottom.toFixed(1)}pt vs bottom margin ${g.bottomMargin}pt`,
    );
    if (g.listBottom < g.bottomMargin) errors.push('word list below bottom margin');
  }
  const placed = Object.values(dirTotals).reduce((a, b) => a + b, 0);
  console.log(
    `checked ${puzzleCount} puzzles (${SEEDS} seeds x ${PER_BATCH}) in ${(performance.now() - t0).toFixed(0)} ms`,
  );
  console.log(
    'direction mix: ' +
      Object.entries(dirTotals)
        .map(([d, n]) => `${d} ${((100 * n) / placed).toFixed(1)}%`)
        .join(', '),
  );
  if (errors.length > 0) {
    console.log(`FAIL: ${errors.length} problems`);
    for (const e of errors.slice(0, 50)) console.log('  ' + e);
    process.exit(1);
  }
  console.log('independent checks: PASS');
  if (worst >= 5000) process.exit(1);
}

await main();
