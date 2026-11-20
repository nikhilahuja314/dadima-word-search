import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync, crc32 } from 'node:zlib';
import { generateMandala } from '../src/activities/mandala/generate';
import {
  analyseFull,
  failureReasons,
  passes,
  type FullAnalysis,
  type Report,
} from '../src/activities/mandala/validate/raster';
import { NUMBERS, type MandalaPlan } from '../src/activities/mandala/types';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const count = Number(arg('count') ?? 500);
const start = Number(arg('start') ?? 1);
const outDir = arg('out') ?? 'docs/mandala/samples/failures';
const maxPng = Number(arg('max-png') ?? 12);
const json = arg('json');

function chunk(type: string, data: Uint8Array): Buffer {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, Buffer.from(data), crc]);
}

function encodePng(rgb: Uint8Array, w: number, h: number): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, rgb.byteOffset + y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Ink black, white white, flagged regions red (small = red, thin = orange), mismatches blue. */
function paint(a: FullAnalysis, rings: boolean, report: Report): Buffer {
  const { width: w, height: h } = a;
  const rgb = new Uint8Array(w * h * 3).fill(255);
  const mm = 25.4 / a.dpi;
  for (let i = 0; i < w * h; i++) {
    const f = a.flags[a.labels[i]!]!;
    let c: [number, number, number] = [255, 255, 255];
    if (a.ink[i]) c = [0, 0, 0];
    else if (f & 1) c = [230, 0, 0];
    else if (f & 2) c = [255, 140, 0];
    rgb.set(c, i * 3);
  }
  const sw = a.symmetry.width;
  const sh = a.symmetry.height;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.min(sw - 1, Math.floor((x * sw) / w));
      const sy = Math.min(sh - 1, Math.floor((y * sh) / h));
      if (a.symmetry.mask[sy * sw + sx] && a.ink[y * w + x]) rgb.set([0, 90, 255], (y * w + x) * 3);
    }
  }
  if (rings) {
    for (const f of [...report.tooSmall, ...report.tooThin]) {
      const cx = f.centroidMm.x / mm + w / 2;
      const cy = -f.centroidMm.y / mm + h / 2;
      const r = 5 / mm;
      for (let t = 0; t < 360; t += 0.25) {
        const x = Math.round(cx + r * Math.cos((t * Math.PI) / 180));
        const y = Math.round(cy + r * Math.sin((t * Math.PI) / 180));
        for (let d = 0; d < 2; d++) {
          const xx = x + d;
          if (xx >= 0 && xx < w && y >= 0 && y < h) rgb.set([230, 0, 0], (y * w + xx) * 3);
        }
      }
    }
  }
  return encodePng(rgb, w, h);
}

interface Row {
  seed: number;
  k: number;
  where: Record<string, number>;
  report: Report;
  reasons: string[];
}

/** Which plan layer a flagged region's centroid falls in (by radius). */
function locate(plan: MandalaPlan, c: { x: number; y: number }): string {
  const r = Math.hypot(c.x, c.y);
  if (r < plan.centre.r) return `centre/${plan.centre.kind}`;
  const l = plan.layers.find((x) => r >= x.rInner && r < x.rOuter);
  if (!l) return 'outside';
  if (l.kind === 'band') return `band/${l.motif}`;
  return `petals/${l.shape}/${l.fill.type}`;
}

mkdirSync(outDir, { recursive: true });

/**
 * Seeds start..start+count-1. Rasterising leaks native memory in the resvg binding (several GB
 * over a few hundred seeds), so the parent process runs seeds in short-lived worker processes.
 */
function runSeeds(from: number, n: number, pngBudget: number): Row[] {
  const out: Row[] = [];
  let pngsLeft = pngBudget;
  for (let seed = from; seed < from + n; seed++) {
    const g = generateMandala(seed);
    const a = analyseFull(g.drawing, g.plan.k);
    const reasons = failureReasons(a.report);
    const where: Record<string, number> = {};
    for (const f of [...a.report.tooSmall, ...a.report.tooThin]) {
      const key = locate(g.plan, f.centroidMm);
      where[key] = (where[key] ?? 0) + 1;
    }
    out.push({ seed, k: g.plan.k, where, report: a.report, reasons });
    if (!passes(a.report) && pngsLeft > 0) {
      writeFileSync(join(outDir, `seed-${seed}.png`), paint(a, true, a.report));
      pngsLeft--;
    }
  }
  return out;
}

const CHUNK = 25;
let rows: Row[] = [];
let pngs = 0;
if (process.argv.includes('--worker')) {
  const rowsOut = runSeeds(start, count, maxPng);
  writeFileSync(json ?? '/dev/null', JSON.stringify(rowsOut));
  process.exit(0);
}
const t0 = Date.now();
for (let from = start; from < start + count; from += CHUNK) {
  const n = Math.min(CHUNK, start + count - from);
  const tmp = join(tmpdir(), `verify-mandala-${process.pid}-${from}.json`);
  const r = spawnSync(
    process.execPath,
    [
      ...process.execArgv,
      process.argv[1]!,
      '--worker',
      '--start',
      String(from),
      '--count',
      String(n),
      '--out',
      outDir,
      '--max-png',
      String(maxPng - pngs),
      '--json',
      tmp,
    ],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  );
  if (r.status !== 0) throw new Error(`worker for seeds ${from}+${n} failed (${r.status})`);
  const chunkRows = JSON.parse(readFileSync(tmp, 'utf8')) as Row[];
  unlinkSync(tmp);
  pngs += Math.min(maxPng - pngs, chunkRows.filter((x) => x.reasons.length > 0).length);
  rows = rows.concat(chunkRows);
  console.error(`  ${rows.length}/${count} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
if (json) writeFileSync(json, JSON.stringify(rows));

const fmt = (f: { centroidMm: { x: number; y: number } }) =>
  `(${f.centroidMm.x.toFixed(1)}, ${f.centroidMm.y.toFixed(1)})`;
const failed = rows.filter((r) => r.reasons.length > 0);
console.log(`Pass rate: ${rows.length - failed.length}/${rows.length}`);

// Region-count histogram, bins of 25.
const bins = new Map<number, number>();
for (const r of rows) {
  const b = Math.floor(r.report.regionCount / 25) * 25;
  bins.set(b, (bins.get(b) ?? 0) + 1);
}
console.log(`Region counts (target ${NUMBERS.regionCountRange.join('-')}):`);
for (const b of [...bins.keys()].sort((x, y) => x - y)) {
  console.log(`  ${String(b).padStart(4)}-${String(b + 24).padEnd(4)} ${bins.get(b)}`);
}

const byReason = new Map<string, Row[]>();
for (const r of failed)
  for (const why of r.reasons) byReason.set(why, [...(byReason.get(why) ?? []), r]);
for (const [why, list] of byReason) {
  console.log(`\n${why}: ${list.length} seeds`);
  console.log(`  seeds: ${list.map((r) => r.seed).join(' ')}`);
  for (const r of list.slice(0, 5)) {
    const rep = r.report;
    const detail =
      why === 'too-small'
        ? `${rep.tooSmall.length} regions, e.g. ${rep.tooSmall
            .slice(0, 3)
            .map((f) => `${f.areaMm2.toFixed(2)}mm2@${fmt(f)}`)
            .join(' ')}`
        : why === 'too-thin'
          ? `${rep.tooThin.length} regions, e.g. ${rep.tooThin
              .slice(0, 3)
              .map((f) => `${f.widthMm.toFixed(2)}mm@${fmt(f)}`)
              .join(' ')}`
          : why === 'asymmetric'
            ? `mismatch ${rep.symmetryMismatch.toFixed(4)}`
            : `regions ${rep.regionCount}`;
    console.log(`  seed ${r.seed} (k=${r.k}): ${detail}`);
  }
}
// Flagged regions by area (px at 300 dpi = 0.00717 mm2) and by layer.
const areaBins = {
  'speckle (<=3 px)': 0,
  '3 px - 0.1 mm2': 0,
  '0.1 - 1 mm2': 0,
  '1 - 4 mm2': 0,
  'wide-but-thin only': 0,
};
const px = (25.4 / 300) ** 2;
const locTotals = new Map<string, number>();
for (const r of rows) {
  for (const f of r.report.tooSmall) {
    if (f.areaMm2 <= 3.5 * px) areaBins['speckle (<=3 px)']++;
    else if (f.areaMm2 < 0.1) areaBins['3 px - 0.1 mm2']++;
    else if (f.areaMm2 < 1) areaBins['0.1 - 1 mm2']++;
    else areaBins['1 - 4 mm2']++;
  }
  for (const f of r.report.tooThin)
    if (f.areaMm2 >= NUMBERS.minRegionArea) areaBins['wide-but-thin only']++;
  for (const [k2, n] of Object.entries(r.where)) locTotals.set(k2, (locTotals.get(k2) ?? 0) + n);
}
console.log('\nFlagged regions by size (tooSmall):', JSON.stringify(areaBins));
console.log('Flagged regions by layer (small and thin counted separately):');
for (const [k2, n] of [...locTotals].sort((a, b) => b[1] - a[1]))
  console.log(`  ${String(n).padStart(6)}  ${k2}`);
if (failed.length) console.log(`\nFailure PNGs (first ${pngs}) in ${outDir}`);
process.exit(failed.length ? 1 : 0);
