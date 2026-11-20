import { circle, moveTo, sample, transform } from '../geom/path';
import { insetPetal, petalPath } from '../geom/shapes';
import { rotateCopies } from '../geom/symmetry';
import { polar, rot } from '../geom/vec';
import type { MandalaPlan, Path, PetalShape, PetalSpec, Vec } from '../types';
import { NUMBERS } from '../types';
import { PolylineIndex } from './clearance';

/**
 * Clearance from an accent's edge to the centre line of any stroke: the outline stroke's half width
 * plus 0.3 mm, plus a hair so rounding never lands exactly on the limit.
 */
export const ACCENT_CLEARANCE = NUMBERS.outlineMm / 2 + 0.3 + 0.02;

/** How the layer's petals are shaped (M4 builds them with halfWidth = π / fold). */
export interface PetalTemplate {
  shape: PetalShape;
  bellyAt: number;
  bellyScale: number;
}

export const DEFAULT_PETAL_TEMPLATE: PetalTemplate = {
  shape: 'lotus',
  bellyAt: 0.45,
  bellyScale: 1.25,
};

/** Radius of a valley dot: `accentDotR` interpolated by fold (8 -> largest, 24 -> smallest). */
export function valleyDotRadius(fold: number): number {
  const [hi, lo] = [NUMBERS.accentDotR[1], NUMBERS.accentDotR[0]];
  const t = Math.min(1, Math.max(0, (fold - 8) / 16));
  return hi - (hi - lo) * t;
}

function petalAt(
  rBase: number,
  rTip: number,
  fold: number,
  angle: number,
  t: PetalTemplate,
): PetalSpec {
  return {
    shape: t.shape,
    angle,
    rBase,
    rTip,
    halfWidth: Math.PI / fold,
    bellyAt: t.bellyAt,
    bellyScale: t.bellyScale,
  };
}

/** Outlines of the two petals either side of the valley at angle π/fold (phase 0 frame). */
function valleyNeighbours(
  rBase: number,
  rTip: number,
  fold: number,
  t: PetalTemplate,
): { lines: Vec[][]; axis: number } {
  const pitch = (2 * Math.PI) / fold;
  const lines = [0, pitch].map((a) => sample(petalPath(petalAt(rBase, rTip, fold, a, t)), 0.1));
  return { lines, axis: pitch / 2 };
}

/**
 * Filled circle in each V between adjacent petals, `fold` copies (the first sits at pitch/2 past
 * the first petal axis; `phase` shifts all of them like the petals). The dot is as deep in the V as
 * the valley is 3.2 dot radii wide, pushed outward if needed so its edge keeps ACCENT_CLEARANCE
 * from both petal outlines and from the circles at `rBase` and `rTip`. Returns [] if no such
 * place exists below the petal tips.
 */
export function valleyDot(
  rBase: number,
  rTip: number,
  fold: number,
  phase: number,
  template: PetalTemplate = DEFAULT_PETAL_TEMPLATE,
): Path[] {
  const dr = valleyDotRadius(fold);
  const { lines, axis } = valleyNeighbours(rBase, rTip, fold, template);
  const index = new PolylineIndex(lines);
  const need = Math.max(1.6 * dr, dr + ACCENT_CLEARANCE);
  const lo = rBase + dr + ACCENT_CLEARANCE;
  const hi = rTip - dr - ACCENT_CLEARANCE;
  for (let r = lo; r <= hi; r += 0.02) {
    if (index.clearOf(polar(r, axis), need)) {
      return rotateCopies([circle(polar(r, axis), dr)], fold, phase);
    }
  }
  return [];
}

/**
 * A small `round` petal (detail stroke) in each valley, `fold` copies. Deviation from "rooted at
 * rInner": the V is closed at rInner, so the petal is rooted at whichever radius up the V gives
 * the largest petal that keeps a full stroke spacing to the big petals; its top stops one spacing below `rTip`.
 * Returns [] if it cannot be made colourable.
 */
export function valleySmallPetal(
  rBase: number,
  rTip: number,
  fold: number,
  phase: number,
  template: PetalTemplate = DEFAULT_PETAL_TEMPLATE,
): Path[] {
  const sp = NUMBERS.minStrokeSpacing;
  const { lines, axis } = valleyNeighbours(rBase, rTip, fold, template);
  const index = new PolylineIndex(lines);
  const rTop = rTip - sp;
  const minHeight = 2 * NUMBERS.minRegionWidth + NUMBERS.detailMm;
  const minHalf = (NUMBERS.minRegionWidth + NUMBERS.detailMm) / 2;
  // Try every root radius up the V and keep the petal with the most area.
  let best: PetalSpec | null = null;
  let bestArea = 0;
  for (let r0 = rBase; rTop - r0 >= minHeight; r0 += 0.2) {
    const room = index.distance(polar(r0, axis)) - sp;
    if (room < minHalf) continue;
    // Exact pruning: this root cannot beat the best petal found so far.
    if (Math.min(room, 0.99 * r0) * (rTop - r0) <= bestArea) continue;
    const specFor = (half: number): PetalSpec => ({
      shape: 'round',
      angle: axis,
      rBase: r0,
      rTip: rTop,
      halfWidth: Math.asin(half / r0),
      bellyAt: 0.6,
      bellyScale: 1,
    });
    const fitsAt = (half: number): boolean => {
      const outline = petalPath(specFor(half));
      // Cheap coarse rejection first; only a petal that survives is checked at full density.
      if (!sample(outline, 0.5).every((p) => index.clearOf(p, sp))) return false;
      return sample(outline, 0.1).every((p) => index.clearOf(p, sp));
    };
    // A wider petal at the same root contains a narrower one, so the widest fit is found by
    // bisection (instead of scanning every width).
    let hi = Math.min(room, 0.99 * r0);
    if (!fitsAt(hi)) {
      let lo = minHalf;
      if (!fitsAt(lo)) continue;
      for (let i = 0; i < 7; i++) {
        const mid = (lo + hi) / 2;
        if (fitsAt(mid)) lo = mid;
        else hi = mid;
      }
      hi = lo;
    }
    if (hi * (rTop - r0) > bestArea) {
      bestArea = hi * (rTop - r0);
      best = specFor(hi);
    }
  }
  return best ? rotateCopies([petalPath(best)], fold, phase) : [];
}

/**
 * Filled teardrop on the petal axis just inside the tip (point toward the tip), length
 * 0.12 x petal length clamped to 2-4 mm. It sits inside the petal's first inset (`gap` mm, as M2's
 * `inset` fill; pass 0 for a petal without one) keeping ACCENT_CLEARANCE from its outline.
 * Returns null if the petal is too small to hold it.
 */
export function tipTeardrop(spec: PetalSpec, gap = 2.2): Path | null {
  const local: PetalSpec = { ...spec, angle: 0 };
  const container = (gap > 0 ? insetPetal(local, gap) : null) ?? local;
  const edgeIndex = new PolylineIndex([sample(petalPath(container), 0.05)]);
  const len = Math.min(4, Math.max(2, 0.12 * (spec.rTip - spec.rBase)));
  const rho = 0.22 * len;
  const d = len - rho;
  const phi = Math.acos(rho / d);
  const build = (tip: number): Path => {
    const c: Vec = { x: tip - len + rho, y: 0 };
    const tPlus: Vec = { x: c.x + rho * Math.cos(phi), y: rho * Math.sin(phi) };
    return moveTo(tPlus)
      .arc(c, rho, phi, 2 * Math.PI - phi)
      .line({ x: tip, y: 0 })
      .line(tPlus)
      .close()
      .build();
  };
  const lowest = container.rBase + ACCENT_CLEARANCE + len;
  const okAt = (tip: number): Path | null => {
    const td = build(tip);
    // Coarse points first so a collision is rejected cheaply; then the full-density check.
    if (!sample(td, 0.3).every((p) => edgeIndex.clearOf(p, ACCENT_CLEARANCE))) return null;
    if (!sample(td, 0.05).every((p) => edgeIndex.clearOf(p, ACCENT_CLEARANCE))) return null;
    return transform(td, (v) => rot(v, spec.angle));
  };
  // Largest tip radius that fits: scan down in 0.1 mm steps, then refine in 0.02 mm steps.
  for (let tip = container.rTip; tip >= lowest; tip -= 0.1) {
    if (okAt(tip) === null) continue;
    for (let fine = Math.min(container.rTip, tip + 0.08); fine >= tip - 1e-9; fine -= 0.02) {
      const hit = okAt(fine);
      if (hit) return hit;
    }
  }
  return null;
}

export interface AccentBudget {
  /** Indices of petal layers that carry a tip teardrop. */
  tip: number[];
  /** Indices of petal layers that carry valley dots. */
  valleyDot: number[];
}

/** Which layers may carry accents; throws if the plan breaks "sparingly" (max 2 + 2 layers). */
export function layerAccentBudget(plan: MandalaPlan): AccentBudget {
  const tip: number[] = [];
  const valley: number[] = [];
  plan.layers.forEach((l, i) => {
    if (l.kind !== 'petals') return;
    if (l.tipAccent) tip.push(i);
    if (l.valley === 'dotAccent') valley.push(i);
  });
  if (tip.length > 2) throw new Error(`plan has ${tip.length} layers with tip accents (max 2)`);
  if (valley.length > 2)
    throw new Error(`plan has ${valley.length} layers with valley dots (max 2)`);
  return { tip, valleyDot: valley };
}
