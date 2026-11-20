import type { Path, Seg, Vec } from '../types';
import { EPS, dist, lerp, polar } from './vec';

export interface PathBuilder {
  /** Straight line to `to`. */
  line(to: Vec): PathBuilder;
  cubic(c1: Vec, c2: Vec, to: Vec): PathBuilder;
  /**
   * Circular arc about `centre` from angle `a0` to `a1` (a1 < a0 goes clockwise), as cubics of at
   * most 90° each. If the current point is not already at the arc's start, a line is added first.
   */
  arc(centre: Vec, r: number, a0: number, a1: number): PathBuilder;
  close(): PathBuilder;
  build(): Path;
}

export function moveTo(p: Vec): PathBuilder {
  const start: Vec = { x: p.x, y: p.y };
  const segs: Seg[] = [];
  let cur: Vec = start;
  let closed = false;
  const builder: PathBuilder = {
    line(to) {
      segs.push({ kind: 'L', to });
      cur = to;
      return builder;
    },
    cubic(c1, c2, to) {
      segs.push({ kind: 'C', c1, c2, to });
      cur = to;
      return builder;
    },
    arc(centre, r, a0, a1) {
      const first = { x: centre.x + polar(r, a0).x, y: centre.y + polar(r, a0).y };
      if (dist(cur, first) > EPS) builder.line(first);
      const span = a1 - a0;
      if (span === 0) return builder;
      const n = Math.ceil(Math.abs(span) / (Math.PI / 2) - 1e-9);
      const theta = span / n;
      const k = (4 / 3) * Math.tan(theta / 4);
      for (let i = 0; i < n; i++) {
        const s = a0 + theta * i;
        const e = s + theta;
        const ps = polar(r, s);
        const pe = polar(r, e);
        // Tangent at an angle a, counter-clockwise, is (-sin a, cos a) * r.
        builder.cubic(
          { x: centre.x + ps.x - k * ps.y, y: centre.y + ps.y + k * ps.x },
          { x: centre.x + pe.x + k * pe.y, y: centre.y + pe.y - k * pe.x },
          { x: centre.x + pe.x, y: centre.y + pe.y },
        );
      }
      return builder;
    },
    close() {
      closed = true;
      return builder;
    },
    build() {
      return { start, segs: [...segs], closed };
    },
  };
  return builder;
}

/** Circle as 4 cubics, closed, starting at angle 0 and running counter-clockwise. */
export function circle(c: Vec, r: number): Path {
  return moveTo({ x: c.x + r, y: c.y })
    .arc(c, r, 0, 2 * Math.PI)
    .close()
    .build();
}

/** Map every point (including control points) through `fn`. Exact for affine maps. */
export function transform(path: Path, fn: (v: Vec) => Vec): Path {
  return {
    start: fn(path.start),
    closed: path.closed,
    segs: path.segs.map((s): Seg => {
      if (s.kind === 'L') return { kind: 'L', to: fn(s.to) };
      return { kind: 'C', c1: fn(s.c1), c2: fn(s.c2), to: fn(s.to) };
    }),
  };
}

/** Same curve traversed in the opposite direction. */
export function reverse(path: Path): Path {
  const points: Vec[] = [path.start];
  for (const s of path.segs) points.push(s.to);
  const segs: Seg[] = [];
  for (let i = path.segs.length - 1; i >= 0; i--) {
    const s = path.segs[i] as Seg;
    const to = points[i] as Vec;
    segs.push(s.kind === 'L' ? { kind: 'L', to } : { kind: 'C', c1: s.c2, c2: s.c1, to });
  }
  const last = points[points.length - 1] as Vec;
  return { start: last, segs, closed: path.closed };
}

function cubicAt(p0: Vec, c1: Vec, c2: Vec, p1: Vec, t: number): Vec {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * c1.x + c * c2.x + d * p1.x,
    y: a * p0.y + b * c1.y + c * c2.y + d * p1.y,
  };
}

/**
 * Points along the path, including its start and end, such that consecutive points are at most
 * `stepMm` apart. Béziers are evaluated at uniform parameter steps; the count is chosen from the
 * bound |B'(t)| ≤ 3·max control-leg, so the step guarantee holds for any curve.
 */
export function sample(path: Path, stepMm: number): Vec[] {
  if (!(stepMm > 0)) throw new Error('sample: stepMm must be positive');
  const out: Vec[] = [path.start];
  let cur = path.start;
  for (const s of path.segs) {
    if (s.kind === 'L') {
      const n = Math.max(1, Math.ceil(dist(cur, s.to) / stepMm - 1e-9));
      for (let i = 1; i <= n; i++) out.push(lerp(cur, s.to, i / n));
    } else {
      const maxLeg = Math.max(dist(cur, s.c1), dist(s.c1, s.c2), dist(s.c2, s.to));
      const n = Math.max(1, Math.ceil((3 * maxLeg) / stepMm));
      for (let i = 1; i < n; i++) out.push(cubicAt(cur, s.c1, s.c2, s.to, i / n));
      out.push(s.to);
    }
    cur = s.to;
  }
  return out;
}

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Tight bounding box of the curve (Bézier extrema included, not just control points). */
export function bbox(path: Path): BBox {
  const box: BBox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const take = (v: Vec) => {
    box.minX = Math.min(box.minX, v.x);
    box.maxX = Math.max(box.maxX, v.x);
    box.minY = Math.min(box.minY, v.y);
    box.maxY = Math.max(box.maxY, v.y);
  };
  take(path.start);
  let cur = path.start;
  for (const s of path.segs) {
    take(s.to);
    if (s.kind === 'C') {
      for (const axis of ['x', 'y'] as const) {
        for (const t of cubicExtrema(cur[axis], s.c1[axis], s.c2[axis], s.to[axis])) {
          take(cubicAt(cur, s.c1, s.c2, s.to, t));
        }
      }
    }
    cur = s.to;
  }
  return box;
}

/** Parameters in (0, 1) where the derivative of a 1D cubic Bézier is zero. */
function cubicExtrema(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  const ts: number[] = [];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) ts.push(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      ts.push((-b + sq) / (2 * a), (-b - sq) / (2 * a));
    }
  }
  return ts.filter((t) => t > 0 && t < 1);
}

/** Round to 3 decimals (0.001 mm) and normalise -0, so output is byte-stable. */
function fmt(n: number): string {
  const r = Math.round(n * 1000) / 1000;
  return Object.is(r, -0) || r === 0 ? '0' : String(r);
}

/** SVG path data with absolute M/L/C/Z. `flipY` negates y (maths y-up to SVG y-down). */
export function toSvgD(path: Path, flipY: boolean): string {
  const sy = flipY ? -1 : 1;
  const pt = (v: Vec) => `${fmt(v.x)} ${fmt(v.y * sy)}`;
  const parts = [`M${pt(path.start)}`];
  for (const s of path.segs) {
    parts.push(s.kind === 'L' ? `L${pt(s.to)}` : `C${pt(s.c1)} ${pt(s.c2)} ${pt(s.to)}`);
  }
  if (path.closed) parts.push('Z');
  return parts.join(' ');
}
