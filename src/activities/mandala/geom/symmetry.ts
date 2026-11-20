import type { Drawing, Path } from '../types';
import { sample, transform } from './path';
import { dist, mirrorAbout, rot } from './vec';

/** All `fold` rotations of every path (rotation-major order), each by 2π/fold·(i + phase). */
export function rotateCopies(paths: readonly Path[], fold: number, phase = 0): Path[] {
  const out: Path[] = [];
  for (let i = 0; i < fold; i++) {
    const a = ((2 * Math.PI) / fold) * (i + phase);
    for (const p of paths) out.push(transform(p, (v) => rot(v, a)));
  }
  return out;
}

/** Each path reflected across the ray at angle `theta` (originals not included). */
export function mirrorCopy(paths: readonly Path[], theta: number): Path[] {
  return paths.map((p) => transform(p, (v) => mirrorAbout(v, theta)));
}

/** True if the sampled curve coincides with its mirror image about `theta` within `tol` mm. */
export function isMirrorSymmetric(path: Path, theta: number, tol: number): boolean {
  const step = Math.max(tol * 20, 0.25);
  const pts = sample(path, step);
  const mirrored = pts.map((v) => mirrorAbout(v, theta));
  const close = (from: typeof pts, onto: typeof pts) =>
    from.every((p) => {
      let best = Infinity;
      for (let i = 0; i + 1 < onto.length; i++) {
        best = Math.min(best, distToSegment(p, onto[i]!, onto[i + 1]!));
      }
      return best <= tol;
    });
  return close(pts, mirrored) && close(mirrored, pts);
}

function distToSegment(p: { x: number; y: number }, a: typeof p, b: typeof p): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/**
 * Make a D_fold drawing from a generating wedge: the input together with its mirror image about
 * angle 0 (the vertical axis on paper), repeated at all `fold` rotations. Input that is already
 * mirror-symmetric will contain coincident duplicate strokes.
 */
export function symmetriseDrawing(d: Drawing, fold: number): Drawing {
  const strokes: Drawing['strokes'] = [];
  const fills: Path[] = [];
  const mirroredStrokes = d.strokes.map((s) => ({
    role: s.role,
    path: transform(s.path, (v) => mirrorAbout(v, 0)),
  }));
  for (let i = 0; i < fold; i++) {
    const a = (2 * Math.PI * i) / fold;
    const turn = (p: Path) => transform(p, (v) => rot(v, a));
    for (const s of [...d.strokes, ...mirroredStrokes]) {
      strokes.push({ role: s.role, path: turn(s.path) });
    }
    for (const f of [...d.fills, ...mirrorCopy(d.fills, 0)]) fills.push(turn(f));
  }
  return { strokes, fills };
}
