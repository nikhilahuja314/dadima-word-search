import type { Path, Vec } from '../types';
import { sample } from '../geom/path';
import { dist } from '../geom/vec';

/** Distance from `p` to the segment `a`-`b`. */
export function distToSegment(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/** Distance from `p` to a sampled polyline (consecutive points are joined). */
export function distToPolyline(p: Vec, pts: readonly Vec[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    best = Math.min(best, distToSegment(p, pts[i] as Vec, pts[i + 1] as Vec));
  }
  return best;
}

/** Sample several paths into one list of polylines. */
export function samplePaths(paths: readonly Path[], step: number): Vec[][] {
  return paths.map((p) => sample(p, step));
}

/** Smallest distance from `p` to any of the polylines. */
export function distToPolylines(p: Vec, lines: readonly (readonly Vec[])[]): number {
  let best = Infinity;
  for (const l of lines) best = Math.min(best, distToPolyline(p, l));
  return best;
}

/** Smallest distance between two sampled curves (point-to-segment, both directions). */
export function minGap(a: readonly Vec[], b: readonly Vec[]): number {
  let best = Infinity;
  for (const p of a) best = Math.min(best, distToPolyline(p, b));
  for (const p of b) best = Math.min(best, distToPolyline(p, a));
  return best;
}

/**
 * Uniform-grid index over sampled polylines for exact nearest-distance queries (expanding ring
 * search). Same answers as `distToPolylines`, but far faster for long curves.
 */
export class PolylineIndex {
  private readonly cells = new Map<number, [Vec, Vec][]>();
  private readonly cell: number;
  private empty = true;

  constructor(lines: readonly (readonly Vec[])[], cell = 2) {
    this.cell = cell;
    for (const l of lines) {
      for (let i = 0; i + 1 < l.length; i++) {
        const a = l[i] as Vec;
        const b = l[i + 1] as Vec;
        this.empty = false;
        const seg: [Vec, Vec] = [a, b];
        const x0 = Math.floor(Math.min(a.x, b.x) / cell);
        const x1 = Math.floor(Math.max(a.x, b.x) / cell);
        const y0 = Math.floor(Math.min(a.y, b.y) / cell);
        const y1 = Math.floor(Math.max(a.y, b.y) / cell);
        for (let x = x0; x <= x1; x++) {
          for (let y = y0; y <= y1; y++) {
            const key = PolylineIndex.key(x, y);
            const list = this.cells.get(key);
            if (list) list.push(seg);
            else this.cells.set(key, [seg]);
          }
        }
      }
    }
  }

  private static key(x: number, y: number): number {
    return (x + 32768) * 65536 + (y + 32768);
  }

  /** True if every segment is at least `d` from `p` (searches only the cells within `d`). */
  clearOf(p: Vec, d: number): boolean {
    if (this.empty) return true;
    const cx = Math.floor(p.x / this.cell);
    const cy = Math.floor(p.y / this.cell);
    const reach = Math.ceil(d / this.cell);
    for (let dx = -reach; dx <= reach; dx++) {
      for (let dy = -reach; dy <= reach; dy++) {
        const list = this.cells.get(PolylineIndex.key(cx + dx, cy + dy));
        if (!list) continue;
        for (const [a, b] of list) if (distToSegment(p, a, b) < d) return false;
      }
    }
    return true;
  }

  /** Distance from `p` to the nearest segment (Infinity if the index is empty). */
  distance(p: Vec): number {
    if (this.empty) return Infinity;
    const cx = Math.floor(p.x / this.cell);
    const cy = Math.floor(p.y / this.cell);
    let best = Infinity;
    for (let n = 0; n < 100000; n++) {
      if (best <= (n - 1) * this.cell) break;
      for (let dx = -n; dx <= n; dx++) {
        for (let dy = -n; dy <= n; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== n) continue;
          const list = this.cells.get(PolylineIndex.key(cx + dx, cy + dy));
          if (!list) continue;
          for (const [a, b] of list) best = Math.min(best, distToSegment(p, a, b));
        }
      }
      if (n > 1000) break;
    }
    return best;
  }
}
