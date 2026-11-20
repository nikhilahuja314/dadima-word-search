import { assemble } from './assemble';
import { assertValidPlan, createPlan, planSignature } from './plan/plan';
import type { Drawing, MandalaPlan, Path, Seg } from './types';
import { NUMBERS } from './types';

export interface Generated {
  plan: MandalaPlan;
  drawing: Drawing;
}

/** Strokes plus fills allowed on one page. */
export const MAX_PATHS = 6000;

function cubicMid(p0: { x: number; y: number }, s: Extract<Seg, { kind: 'C' }>) {
  return {
    x: (p0.x + 3 * s.c1.x + 3 * s.c2.x + s.to.x) / 8,
    y: (p0.y + 3 * s.c1.y + 3 * s.c2.y + s.to.y) / 8,
  };
}

function check(v: { x: number; y: number }): string | null {
  if (!Number.isFinite(v.x) || !Number.isFinite(v.y)) return 'NaN coordinate';
  if (Math.hypot(v.x, v.y) > NUMBERS.R + 1) return 'point outside R + 1';
  return null;
}

function pathProblem(p: Path): string | null {
  let cur = p.start;
  const first = check(cur);
  if (first) return first;
  for (const s of p.segs) {
    if (s.kind === 'C') {
      // Control points only need to be finite; the curve itself is bounded via its midpoint.
      for (const c of [s.c1, s.c2]) {
        if (!Number.isFinite(c.x) || !Number.isFinite(c.y)) return 'NaN coordinate';
      }
      const m = check(cubicMid(cur, s));
      if (m) return m;
    }
    const e = check(s.to);
    if (e) return e;
    cur = s.to;
  }
  return null;
}

/**
 * Cheap geometric sanity check (no raster, safe in the browser): returns the first problem found,
 * or null. No NaN, every on-curve point (ends and bézier midpoints) within R + 1, fewer than
 * MAX_PATHS paths.
 */
export function quickCheck(drawing: Drawing): string | null {
  if (drawing.strokes.length + drawing.fills.length >= MAX_PATHS) return 'too many paths';
  for (const s of drawing.strokes) {
    const p = pathProblem(s.path);
    if (p) return p;
  }
  for (const f of drawing.fills) {
    const p = pathProblem(f);
    if (p) return p;
  }
  return null;
}

/** Sub-seed for retry `attempt` (attempt 0 is the seed itself). */
export function subSeed(seed: number, attempt: number): number {
  return attempt === 0 ? seed >>> 0 : (seed * 31 + attempt) >>> 0;
}

/** Retry loop shared by generateMandala and generateBatch; `reject` skips a plan outright. */
function generateWhere(seed: number, reject: (plan: MandalaPlan) => boolean): Generated {
  let last = 'no attempts';
  for (let attempt = 0; attempt <= NUMBERS.maxRetries; attempt++) {
    const plan = createPlan(subSeed(seed, attempt));
    if (reject(plan)) {
      last = 'duplicate plan';
      continue;
    }
    const drawing = assemble(plan);
    const problem = quickCheck(drawing);
    if (problem === null) return { plan, drawing };
    last = problem;
  }
  throw new Error(
    `generateMandala(${seed}): gave up after ${NUMBERS.maxRetries} retries (${last})`,
  );
}

/** Seed to plan and drawing; retries with sub-seeds `(seed * 31 + attempt) >>> 0` if quickCheck fails. */
export function generateMandala(seed: number): Generated {
  return generateWhere(seed, () => false);
}

/**
 * `count` pages with seeds `baseSeed + i * 7919`. A page whose planSignature repeats an earlier
 * page of the batch moves on to its next sub-seed. Every returned plan has been validated.
 */
export function generateBatch(count: number, baseSeed: number): Generated[] {
  const seen = new Set<string>();
  const out: Generated[] = [];
  for (let i = 0; i < count; i++) {
    const g = generateWhere(baseSeed + i * 7919, (plan) => seen.has(planSignature(plan)));
    assertValidPlan(g.plan);
    seen.add(planSignature(g.plan));
    out.push(g);
  }
  return out;
}
