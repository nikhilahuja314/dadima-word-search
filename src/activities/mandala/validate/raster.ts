/**
 * Node-only raster colourability checks (M6). Never import this from code that ships to the
 * browser: it pulls in @resvg/resvg-js. The browser relies on the construction guards instead.
 */
import { Resvg } from '@resvg/resvg-js';
import { drawingToSvg } from '../render/svg';
import { NUMBERS, type Drawing } from '../types';

export interface RegionFlag {
  /** Region area, mm². */
  areaMm2: number;
  /** Width of the widest inscribed disc's diameter, mm (edge to edge, see widthOf). */
  widthMm: number;
  /** Centroid in mm, mandala-centred, x right, y up, as seen on the page. */
  centroidMm: { x: number; y: number };
}

export interface Report {
  /** Enclosed white regions (the background and pinholes are excluded). */
  regionCount: number;
  /**
   * Pinholes: specks of white where two strokes converge to a point (wedge apexes, petal tips on
   * rings), pinched off by the stroke width. Narrower than a detail stroke and under 0.1 mm², they
   * print as part of the line and no pencil can colour them, so they are not regions. Reported
   * for visibility only; they never fail a page.
   */
  pinholes: number;
  tooSmall: RegionFlag[];
  tooThin: RegionFlag[];
  /** XOR-style mismatch of the ink under rotation by 2π/k and mirroring, as a fraction of ink. */
  symmetryMismatch: number;
  /** True if any ink lies beyond R + outlineMm from the centre. */
  inkOutsideR: boolean;
}

export interface AnalyseOptions {
  /** Resolution of the region checks. Default 300. */
  dpi?: number;
  /** Narrowest allowed white width, mm. Default 1.2. */
  minWidthMm?: number;
  /** Resolution of the symmetry check. Default 150. */
  symmetryDpi?: number;
}

/** Everything `analyse` computed, for tools that want to paint the offending pixels. */
export interface FullAnalysis {
  report: Report;
  width: number;
  height: number;
  dpi: number;
  /** 1 where ink. */
  ink: Uint8Array;
  /** Component label per pixel: 0 = ink, 1 = background, 2.. = enclosed regions. */
  labels: Int32Array;
  /** Per label: 0 ok, 1 too small, 2 too thin, 3 both. */
  flags: Uint8Array;
  /** Symmetry mismatch mask (1 where ink has no counterpart), at `symmetry.dpi`. */
  symmetry: { width: number; height: number; dpi: number; mask: Uint8Array };
}

export const MIN_WIDTH_MM = 1.2;
export const SYMMETRY_LIMIT = 0.01;

/** Rasterise to a thresholded ink mask (luminance < 128 on white). */
export function rasterise(
  drawing: Drawing,
  dpi: number,
): { ink: Uint8Array; width: number; height: number } {
  const svg = drawingToSvg(drawing, { withPage: false, sizeMm: 2 * NUMBERS.R + 4 });
  const img = new Resvg(svg, { dpi, background: '#ffffff' }).render();
  const { width, height } = img;
  const px = img.pixels;
  const ink = new Uint8Array(width * height);
  for (let i = 0; i < ink.length; i++) {
    const lum = 0.299 * px[i * 4]! + 0.587 * px[i * 4 + 1]! + 0.114 * px[i * 4 + 2]!;
    if (lum < 128) ink[i] = 1;
  }
  return { ink, width, height };
}

/** 4-connected labelling of white pixels. Label 1 is the component touching the border. */
function labelWhite(ink: Uint8Array, w: number, h: number): { labels: Int32Array; count: number } {
  const labels = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  let next = 2;
  const fill = (seed: number, label: number): void => {
    let sp = 0;
    stack[sp++] = seed;
    labels[seed] = label;
    const push = (q: number): void => {
      if (!ink[q] && !labels[q]) {
        labels[q] = label;
        stack[sp++] = q;
      }
    };
    while (sp > 0) {
      const p = stack[--sp]!;
      const x = p % w;
      const y = (p - x) / w;
      if (x > 0) push(p - 1);
      if (x < w - 1) push(p + 1);
      if (y > 0) push(p - w);
      if (y < h - 1) push(p + w);
    }
  };
  // Background first: flood from the top-left corner (the margin is always white).
  if (!ink[0]) {
    fill(0, 1);
  }
  for (let p = 0; p < w * h; p++) {
    if (ink[p] || labels[p]) continue;
    // A white pixel on the border not reached from the corner is still background.
    const x = p % w;
    const y = (p - x) / w;
    const border = x === 0 || y === 0 || x === w - 1 || y === h - 1;
    if (border) {
      fill(p, 1);
    } else fill(p, next++);
  }
  return { labels, count: next - 2 };
}

/** 3-4 chamfer distance (units of 1/3 px) from each white pixel to the nearest ink pixel. */
function chamfer(ink: Uint8Array, w: number, h: number): Int32Array {
  const INF = 1 << 28;
  const d = new Int32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = ink[i] ? 0 : INF;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      let v = d[p]!;
      if (v === 0) continue;
      if (x > 0) v = Math.min(v, d[p - 1]! + 3);
      if (y > 0) {
        v = Math.min(v, d[p - w]! + 3);
        if (x > 0) v = Math.min(v, d[p - w - 1]! + 4);
        if (x < w - 1) v = Math.min(v, d[p - w + 1]! + 4);
      }
      d[p] = v;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const p = y * w + x;
      let v = d[p]!;
      if (v === 0) continue;
      if (x < w - 1) v = Math.min(v, d[p + 1]! + 3);
      if (y < h - 1) {
        v = Math.min(v, d[p + w]! + 3);
        if (x < w - 1) v = Math.min(v, d[p + w + 1]! + 4);
        if (x > 0) v = Math.min(v, d[p + w - 1]! + 4);
      }
      d[p] = v;
    }
  }
  return d;
}

/**
 * Symmetry mismatch at `dpi`: for the rotation by 2π/k and for the mirror about the vertical
 * axis (angle 0 points up on the page), ink in the transformed mask that is not within one pixel
 * (8-neighbourhood) of the original ink, plus the reverse, over the ink pixel count. The worse
 * of the two transforms is returned, with the union of both mismatch masks.
 */
function symmetry(
  drawing: Drawing,
  k: number,
  dpi: number,
): { ratio: number; width: number; height: number; mask: Uint8Array } {
  const { ink, width: w, height: h } = rasterise(drawing, dpi);
  const cx = w / 2;
  const cy = h / 2;
  let inkCount = 0;
  for (let i = 0; i < ink.length; i++) inkCount += ink[i]!;

  const dilate = (src: Uint8Array): Uint8Array => {
    const out = new Uint8Array(src.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let hit = 0;
        for (let dy = -1; dy <= 1 && !hit; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx >= 0 && xx < w && src[yy * w + xx]) {
              hit = 1;
              break;
            }
          }
        }
        out[y * w + x] = hit;
      }
    }
    return out;
  };
  const inkDil = dilate(ink);

  const transform = (map: (px: number, py: number) => [number, number]): Uint8Array => {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const [sx, sy] = map(x + 0.5 - cx, y + 0.5 - cy);
        const ix = Math.floor(sx + cx);
        const iy = Math.floor(sy + cy);
        if (ix >= 0 && ix < w && iy >= 0 && iy < h && ink[iy * w + ix]) out[y * w + x] = 1;
      }
    }
    return out;
  };
  const a = (2 * Math.PI) / k;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const rotated = transform((px, py) => [cos * px + sin * py, -sin * px + cos * py]);
  const mirrored = transform((px, py) => [-px, py]);

  const mask = new Uint8Array(w * h);
  let worst = 0;
  for (const t of [rotated, mirrored]) {
    const tDil = dilate(t);
    let bad = 0;
    for (let i = 0; i < t.length; i++) {
      const m = (t[i]! && !inkDil[i]) || (ink[i]! && !tDil[i]);
      if (m) {
        bad++;
        mask[i] = 1;
      }
    }
    worst = Math.max(worst, bad);
  }
  return { ratio: inkCount === 0 ? 0 : worst / inkCount, width: w, height: h, mask };
}

/** Full analysis, keeping the label image. `k` is the plan's base fold (8 or 12). */
/** See Report.pinholes. */
const PINHOLE_MAX_AREA = 0.1;

export function analyseFull(drawing: Drawing, k: number, opts: AnalyseOptions = {}): FullAnalysis {
  const dpi = opts.dpi ?? 300;
  const minWidthMm = opts.minWidthMm ?? MIN_WIDTH_MM;
  const symDpi = opts.symmetryDpi ?? 150;
  const mmPerPx = 25.4 / dpi;

  const { ink, width: w, height: h } = rasterise(drawing, dpi);
  const { labels, count } = labelWhite(ink, w, h);
  const dist = chamfer(ink, w, h);

  const area = new Float64Array(count + 2);
  const sx = new Float64Array(count + 2);
  const sy = new Float64Array(count + 2);
  const maxD = new Int32Array(count + 2);
  let inkOutsideR = false;
  const limitMm = NUMBERS.R + NUMBERS.outlineMm;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const l = labels[p]!;
      if (ink[p]) {
        if (!inkOutsideR) {
          const dx = (x + 0.5 - w / 2) * mmPerPx;
          const dy = (y + 0.5 - h / 2) * mmPerPx;
          if (Math.hypot(dx, dy) > limitMm) inkOutsideR = true;
        }
        continue;
      }
      if (l < 2) continue;
      area[l]! += 1;
      sx[l]! += x + 0.5;
      sy[l]! += y + 0.5;
      if (dist[p]! > maxD[l]!) maxD[l] = dist[p]!;
    }
  }

  const flags = new Uint8Array(count + 2);
  const tooSmall: RegionFlag[] = [];
  const tooThin: RegionFlag[] = [];
  let pinholes = 0;
  for (let l = 2; l < count + 2; l++) {
    const n = area[l]!;
    const areaMm2 = n * mmPerPx * mmPerPx;
    // The distance is between pixel centres (white to nearest ink), so a white strip n px wide
    // gives (n + 1) / 2 px at its middle. Subtract that half pixel to get the white-to-white width.
    const widthMm = (2 * (maxD[l]! / 3) - 1) * mmPerPx;
    const centroidMm = {
      x: (sx[l]! / n - w / 2) * mmPerPx,
      y: -(sy[l]! / n - h / 2) * mmPerPx,
    };
    const flag: RegionFlag = { areaMm2, widthMm, centroidMm };
    if (areaMm2 < PINHOLE_MAX_AREA && widthMm < NUMBERS.detailMm) {
      pinholes++;
      continue;
    }
    if (areaMm2 < NUMBERS.minRegionArea) {
      tooSmall.push(flag);
      flags[l] = flags[l]! | 1;
    }
    if (widthMm < minWidthMm) {
      tooThin.push(flag);
      flags[l] = flags[l]! | 2;
    }
  }

  const sym = symmetry(drawing, k, symDpi);
  return {
    report: {
      regionCount: count - pinholes,
      pinholes,
      tooSmall,
      tooThin,
      symmetryMismatch: sym.ratio,
      inkOutsideR,
    },
    width: w,
    height: h,
    dpi,
    ink,
    labels,
    flags,
    symmetry: { width: sym.width, height: sym.height, dpi: symDpi, mask: sym.mask },
  };
}

/** Raster colourability report for one drawing; `k` is the plan's base fold. */
export function analyse(drawing: Drawing, k: number, opts: AnalyseOptions = {}): Report {
  return analyseFull(drawing, k, opts).report;
}

export function passes(report: Report): boolean {
  const [lo, hi] = NUMBERS.regionCountRange;
  return (
    report.regionCount >= lo &&
    report.regionCount <= hi &&
    report.tooSmall.length === 0 &&
    report.tooThin.length === 0 &&
    report.symmetryMismatch < SYMMETRY_LIMIT &&
    !report.inkOutsideR
  );
}

/** Human-readable reasons a report fails; empty when it passes. */
export function failureReasons(report: Report): string[] {
  const out: string[] = [];
  const [lo, hi] = NUMBERS.regionCountRange;
  if (report.regionCount < lo) out.push('too-few-regions');
  if (report.regionCount > hi) out.push('too-many-regions');
  if (report.tooSmall.length > 0) out.push('too-small');
  if (report.tooThin.length > 0) out.push('too-thin');
  if (report.symmetryMismatch >= SYMMETRY_LIMIT) out.push('asymmetric');
  if (report.inkOutsideR) out.push('ink-outside-R');
  return out;
}
