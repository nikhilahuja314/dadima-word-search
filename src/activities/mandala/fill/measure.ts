import { petalHalfWidthAt, petalPath, sectorPath } from '../geom/shapes';
import { sample } from '../geom/path';
import { dist } from '../geom/vec';
import type { Path, Region, Vec } from '../types';

/** The closed outline of a region. */
export function regionPath(region: Region): Path {
  return region.kind === 'petal' ? petalPath(region.spec) : sectorPath(region.spec);
}

/** The outline sampled at `step` mm, as a ring whose last point equals its first. */
export function regionPolygon(region: Region, step = 0.1): Vec[] {
  return sample(regionPath(region), step);
}

/** Area in mm², by the shoelace formula on samples at 0.25 mm. */
export function area(region: Region): number {
  const pts = regionPolygon(region, 0.25);
  let sum = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i] as Vec;
    const b = pts[i + 1] as Vec;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/**
 * The narrowest cross-section of the region.
 * - Petal: the smallest full width across the axis, for t in [0.05, 0.9] from base to tip. The last
 *   10% is skipped because every pointed petal narrows to nothing at its tip.
 * - Sector: the smaller of its radial depth and its chord at the inner radius.
 */
export function minWidth(region: Region): number {
  if (region.kind === 'sector') {
    const { rInner, rOuter, a0, a1 } = region.spec;
    const half = Math.min((a1 - a0) / 2, Math.PI / 2);
    return Math.min(rOuter - rInner, 2 * rInner * Math.sin(half));
  }
  let best = Infinity;
  for (let i = 1; i <= 18; i++) {
    best = Math.min(best, 2 * petalHalfWidthAt(region.spec, i * 0.05));
  }
  return best;
}

function segDist(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Spatial index over a polygon: fast distance-to-boundary and point-in-polygon queries. */
export class RegionIndex {
  readonly poly: readonly Vec[];
  private readonly cell: number;
  private readonly minX: number;
  private readonly minY: number;
  private readonly w: number;
  private readonly h: number;
  private readonly cells: number[][];
  private readonly rows: number[][];

  constructor(ring: readonly Vec[], cell = 1) {
    const poly = [...ring];
    const first = poly[0] as Vec;
    const last = poly[poly.length - 1] as Vec;
    if (first.x !== last.x || first.y !== last.y) poly.push(first);
    this.poly = poly;
    this.cell = cell;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of poly) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    this.minX = minX;
    this.minY = minY;
    this.w = Math.floor((maxX - minX) / cell) + 1;
    this.h = Math.floor((maxY - minY) / cell) + 1;
    this.cells = Array.from({ length: this.w * this.h }, () => []);
    this.rows = Array.from({ length: this.h }, () => []);
    for (let i = 0; i + 1 < poly.length; i++) {
      const a = poly[i] as Vec;
      const b = poly[i + 1] as Vec;
      const x0 = Math.floor((Math.min(a.x, b.x) - minX) / cell);
      const x1 = Math.floor((Math.max(a.x, b.x) - minX) / cell);
      const y0 = Math.floor((Math.min(a.y, b.y) - minY) / cell);
      const y1 = Math.floor((Math.max(a.y, b.y) - minY) / cell);
      for (let cy = y0; cy <= y1; cy++) {
        (this.rows[cy] as number[]).push(i);
        for (let cx = x0; cx <= x1; cx++) (this.cells[cy * this.w + cx] as number[]).push(i);
      }
    }
  }

  /** Distance from `p` to the polygon boundary. */
  distance(p: Vec): number {
    const cx = Math.floor((p.x - this.minX) / this.cell);
    const cy = Math.floor((p.y - this.minY) / this.cell);
    let best = Infinity;
    if (cx < -2 || cy < -2 || cx > this.w + 2 || cy > this.h + 2) {
      for (let i = 0; i + 1 < this.poly.length; i++) {
        best = Math.min(best, segDist(p, this.poly[i] as Vec, this.poly[i + 1] as Vec));
      }
      return best;
    }
    const maxR = Math.max(this.w, this.h) + 3;
    for (let r = 0; r <= maxR; r++) {
      for (let y = cy - r; y <= cy + r; y++) {
        if (y < 0 || y >= this.h) continue;
        const edge = y === cy - r || y === cy + r;
        const step = edge ? 1 : 2 * r;
        for (let x = cx - r; x <= cx + r; x += step || 1) {
          if (x < 0 || x >= this.w) continue;
          for (const i of this.cells[y * this.w + x] as number[]) {
            best = Math.min(best, segDist(p, this.poly[i] as Vec, this.poly[i + 1] as Vec));
          }
        }
      }
      if (best <= r * this.cell) break;
    }
    return best;
  }

  /** True if `p` is strictly inside the polygon (even-odd rule). */
  inside(p: Vec): boolean {
    const cy = Math.floor((p.y - this.minY) / this.cell);
    if (cy < 0 || cy >= this.h) return false;
    let c = false;
    for (const i of this.rows[cy] as number[]) {
      const a = this.poly[i] as Vec;
      const b = this.poly[i + 1] as Vec;
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
    }
    return c;
  }
}

const key = (x: number, y: number): string => `${x},${y}`;

export interface SpacingOptions {
  /** Report any two strokes whose non-exempt points are closer than this (centre to centre). */
  min: number;
  /** Points within this arc length of a free end of an open stroke are exempt. Default 2.5 mm. */
  freeEnd?: number;
  /** Sampling step, mm. Default 0.2. */
  step?: number;
}

export interface SpacingViolation {
  a: number;
  b: number;
  d: number;
}

interface Sampled {
  pts: Vec[];
  arc: number[];
  total: number;
  open: boolean;
  /** Exempt zones: cluster id and arc-length radius, at the start and end. */
  junctions: { cluster: number; radius: number; atEnd: boolean; fan: boolean }[];
}

/**
 * Find a pair of strokes that run closer than `opts.min`, or null. Intentional contacts are exempt:
 * - the last `freeEnd` mm of an open stroke (it ends at or near something on purpose, and where it
 *   meets an outline obliquely it stays within the spacing limit of it for a little way);
 * - strokes that share an end point: with exactly two (scallops meeting) the half of each stroke
 *   nearest the shared point, since tangent arcs always run close there; with three or more (a fan) the first 60% of each stroke, where a
 *   fan's strokes necessarily converge. That part of a fan is exempt against every other stroke,
 *   not just its siblings, because it also runs close to the outline it fans out from.
 */
export function findSpacingViolation(
  paths: readonly Path[],
  opts: SpacingOptions,
): SpacingViolation | null {
  const step = opts.step ?? 0.2;
  const freeEnd = opts.freeEnd ?? 2.5;
  const sampled: Sampled[] = paths.map((p) => {
    const pts = sample(p, step);
    const arc = [0];
    for (let i = 1; i < pts.length; i++) {
      arc.push((arc[i - 1] as number) + dist(pts[i - 1] as Vec, pts[i] as Vec));
    }
    return { pts, arc, total: arc[arc.length - 1] as number, open: !p.closed, junctions: [] };
  });
  // Cluster end points of open strokes.
  const centres: Vec[] = [];
  const counts: number[] = [];
  const ends: { path: number; atEnd: boolean; cluster: number }[] = [];
  sampled.forEach((s, i) => {
    if (!s.open) return;
    for (const atEnd of [false, true]) {
      const p = (atEnd ? s.pts[s.pts.length - 1] : s.pts[0]) as Vec;
      let c = centres.findIndex((q) => dist(p, q) < 0.1);
      if (c < 0) {
        c = centres.length;
        centres.push(p);
        counts.push(0);
      }
      counts[c] = (counts[c] as number) + 1;
      ends.push({ path: i, atEnd, cluster: c });
    }
  });
  for (const e of ends) {
    const n = counts[e.cluster] as number;
    if (n < 2) continue;
    const s = sampled[e.path] as Sampled;
    s.junctions.push({
      cluster: e.cluster,
      radius: (n >= 3 ? 0.6 : 0.5) * s.total,
      atEnd: e.atEnd,
      fan: n >= 3,
    });
  }
  const exemptEnd = (s: Sampled, k: number): boolean =>
    freeEnd > 0 &&
    s.open &&
    ((s.arc[k] as number) < freeEnd || s.total - (s.arc[k] as number) < freeEnd);
  // Inside the converging part of a fan, strokes are close to everything near the base on purpose.
  const inFan = (s: Sampled, k: number): boolean =>
    s.junctions.some(
      (j) => j.fan && (j.atEnd ? s.total - (s.arc[k] as number) : (s.arc[k] as number)) <= j.radius,
    );
  const inJunction = (s: Sampled, k: number): number[] => {
    const out: number[] = [];
    for (const j of s.junctions) {
      const a = j.atEnd ? s.total - (s.arc[k] as number) : (s.arc[k] as number);
      if (a <= j.radius) out.push(j.cluster);
    }
    return out;
  };

  const cell = opts.min;
  const grid = new Map<string, { path: number; k: number }[]>();
  sampled.forEach((s, i) => {
    s.pts.forEach((p, k) => {
      const kk = key(Math.floor(p.x / cell), Math.floor(p.y / cell));
      const list = grid.get(kk);
      if (list) list.push({ path: i, k });
      else grid.set(kk, [{ path: i, k }]);
    });
  });
  for (let i = 0; i < sampled.length; i++) {
    const s = sampled[i] as Sampled;
    for (let k = 0; k < s.pts.length; k++) {
      if (exemptEnd(s, k)) continue;
      const p = s.pts[k] as Vec;
      const gx = Math.floor(p.x / cell);
      const gy = Math.floor(p.y / cell);
      let mine: number[] | null = null;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const list = grid.get(key(gx + dx, gy + dy));
          if (!list) continue;
          for (const o of list) {
            if (o.path <= i) continue;
            const t = sampled[o.path] as Sampled;
            const q = t.pts[o.k] as Vec;
            const d = dist(p, q);
            if (d >= opts.min) continue;
            if (exemptEnd(t, o.k)) continue;
            if (inFan(s, k) || inFan(t, o.k)) continue;
            mine ??= inJunction(s, k);
            if (mine.length > 0 && inJunction(t, o.k).some((c) => (mine as number[]).includes(c))) {
              continue;
            }
            return { a: i, b: o.path, d };
          }
        }
      }
    }
  }
  return null;
}
