import type { Path, PetalShape, PetalSpec, SectorSpec, Vec } from '../types';
import { NUMBERS } from '../types';
import { moveTo, sample, transform } from './path';
import { polar, rot } from './vec';

/** Half the included angle between the two sides at the tip, radians (round: a flat top). */
const TIP_HALF_ANGLE: Record<PetalShape, number> = {
  lotus: (20 * Math.PI) / 180,
  teardrop: (14 * Math.PI) / 180,
  arch: (16 * Math.PI) / 180,
  round: Math.PI / 2,
};

/** Half the angle between the two outline tangents at the petal tip, radians. */
export function tipHalfAngle(shape: PetalShape): number {
  return TIP_HALF_ANGLE[shape];
}

interface Cubic {
  c1: Vec;
  c2: Vec;
  to: Vec;
}

/** Upper side (y >= 0) in the local frame (axis = +x), from the base corner to the tip. */
function upperSide(spec: PetalSpec): Cubic[] {
  const { shape, rBase, rTip, halfWidth, bellyAt, bellyScale } = spec;
  const corner = polar(rBase, halfWidth);
  const cy = corner.y;
  const bx = rBase + bellyAt * (rTip - rBase);
  const by = bellyScale * cy;
  const dx1 = bx - corner.x;
  const dx2 = rTip - bx;
  const tip: Vec = { x: rTip, y: 0 };
  const ta = TIP_HALF_ANGLE[shape];
  // Direction from the tip back along the side, at the tip half angle.
  const back = (l: number): Vec => ({ x: tip.x - l * Math.cos(ta), y: l * Math.sin(ta) });

  const belly: Cubic = {
    c1: { x: corner.x + 0.3 * dx1, y: cy + 0.6 * (by - cy) },
    c2: { x: bx - 0.4 * dx1, y: by },
    to: { x: bx, y: by },
  };
  switch (shape) {
    case 'lotus':
      return [belly, { c1: { x: bx + 0.45 * dx2, y: by }, c2: back(0.45 * dx2), to: tip }];
    case 'teardrop':
      return [belly, { c1: { x: bx + 0.25 * dx2, y: by }, c2: back(0.65 * dx2), to: tip }];
    case 'arch':
      // Straight-ish shoulder, then a long flaring ogee to a sharp point.
      return [belly, { c1: { x: bx + 0.2 * dx2, y: by }, c2: back(0.5 * dx2), to: tip }];
    case 'round':
      return [belly, { c1: { x: bx + 0.55 * dx2, y: by }, c2: { x: rTip, y: 0.55 * by }, to: tip }];
  }
}

/**
 * Closed petal outline, mirror-symmetric about its axis. Starts at the upper base corner, runs up
 * the near side to the tip, down the far side, then back along the base-circle arc.
 */
export function petalPath(spec: PetalSpec): Path {
  const upper = upperSide(spec);
  const b = moveTo(polar(spec.rBase, spec.halfWidth));
  for (const c of upper) b.cubic(c.c1, c.c2, c.to);
  // Far side: the upper side mirrored (y negated) and walked backwards.
  const pts: Vec[] = [polar(spec.rBase, spec.halfWidth), ...upper.map((c) => c.to)];
  for (let i = upper.length - 1; i >= 0; i--) {
    const c = upper[i] as Cubic;
    const to = pts[i] as Vec;
    b.cubic({ x: c.c2.x, y: -c.c2.y }, { x: c.c1.x, y: -c.c1.y }, { x: to.x, y: -to.y });
  }
  b.arc({ x: 0, y: 0 }, spec.rBase, -spec.halfWidth, spec.halfWidth).close();
  return transform(b.build(), (v) => rot(v, spec.angle));
}

/**
 * A smaller petal whose outline lies about `d` mm inside the original, or null if it would be
 * degenerate (too short or too narrow to colour).
 */
export function insetPetal(spec: PetalSpec, d: number): PetalSpec | null {
  const rBase = spec.rBase + d;
  const rTip = spec.rTip - d / Math.sin(TIP_HALF_ANGLE[spec.shape]);
  const halfWidth = spec.halfWidth - d / spec.rBase;
  if (halfWidth <= 0) return null;
  if (rTip - rBase < 2 * NUMBERS.minRegionWidth) return null;
  if (halfWidth * rBase < NUMBERS.minRegionWidth) return null;

  // The ogee of an arch pinches in early, so its inset needs extra lateral clearance.
  const lateral = spec.shape === 'arch' ? 1.3 * d : d;
  const cyOld = spec.rBase * Math.sin(spec.halfWidth);
  const cyNew = rBase * Math.sin(halfWidth);
  const bx = spec.rBase + spec.bellyAt * (spec.rTip - spec.rBase);
  const bellyScale = Math.max(0.3, (spec.bellyScale * cyOld - lateral) / cyNew);
  const bellyAt = Math.min(0.9, Math.max(0.1, (bx - rBase) / (rTip - rBase)));
  return { ...spec, rBase, rTip, halfWidth, bellyAt, bellyScale };
}

/** Annular sector, closed: outer arc, radial line in, inner arc back, radial line out. */
export function sectorPath(spec: SectorSpec): Path {
  const o = { x: 0, y: 0 };
  return moveTo(polar(spec.rOuter, spec.a0))
    .arc(o, spec.rOuter, spec.a0, spec.a1)
    .line(polar(spec.rInner, spec.a1))
    .arc(o, spec.rInner, spec.a1, spec.a0)
    .line(polar(spec.rOuter, spec.a0))
    .close()
    .build();
}

/** The point on the petal's axis at fraction `t` from base (0) to tip (1). */
export function petalAxisPoint(spec: PetalSpec, t: number): Vec {
  return polar(spec.rBase + t * (spec.rTip - spec.rBase), spec.angle);
}

/** Half-width of the petal perpendicular to its axis, at fraction `t` from base to tip. */
export function petalHalfWidthAt(spec: PetalSpec, t: number): number {
  const local = transform(petalPath(spec), (v) => rot(v, -spec.angle));
  const pts = sample(local, 0.1);
  const x = spec.rBase + t * (spec.rTip - spec.rBase);
  let best = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i] as Vec;
    const b = pts[i + 1] as Vec;
    if ((a.x - x) * (b.x - x) > 0 || a.x === b.x) continue;
    const y = a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
    best = Math.max(best, Math.abs(y));
  }
  return best;
}
