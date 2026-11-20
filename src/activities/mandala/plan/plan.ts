// The Fill contract (types.ts) names its recursive field `then`, so this rule cannot apply here.
/* oxlint-disable unicorn/no-thenable */
import { createRng, pick, randInt } from '../../../core/rng';
import type { Rng } from '../../../core/rng';
import { NUMBERS } from '../types';
import type { BandMotif, Fill, Layer, MandalaPlan, PetalShape } from '../types';

const { R } = NUMBERS;

/** Minimum depth of any petals layer, mm. */
export const MIN_PETAL_DEPTH = 9;
/** Allowed arc length of one band cell at mid-radius, mm. */
export const BAND_CELL_ARC: readonly [number, number] = [4, 9];
/** Hard floor asserted by assertValidPlan; the 4 mm target is unreachable for small inner bands at k=12. */
export const BAND_CELL_ARC_FLOOR = 3.5;
/** Band multipliers tried (plan says {2,3,4}; 6 is needed for k=8 outer bands, see assertValidPlan). */
const BAND_MULTIPLIERS = [2, 3, 4, 6] as const;
const BAND_MOTIFS: readonly BandMotif[] = ['scallops', 'arches', 'beads', 'zigzag', 'pillars'];
const INNER_SHAPES: readonly PetalShape[] = ['lotus', 'round', 'arch', 'teardrop'];

type PetalsLayer = Extract<Layer, { kind: 'petals' }>;
type BandLayer = Extract<Layer, { kind: 'band' }>;

const uniform = (rng: Rng, [lo, hi]: readonly [number, number]): number => lo + rng() * (hi - lo);
const randIntIn = (rng: Rng, lo: number, hi: number): number => lo + randInt(rng, hi - lo + 1);

// ---------------------------------------------------------------- fills

type Template =
  | 'tall-fan-tear'
  | 'tall-comb'
  | 'tall-comb-bead'
  | 'mid-fan'
  | 'mid-tear'
  | 'mid-scallop'
  | 'low-inset'
  | 'low-none';

/** Identify the top-level template a fill was built from (used by signatures and adjacency rules). */
export function fillTemplate(fill: Fill): Template | 'other' {
  if (fill.type === 'none') return 'low-none';
  if (fill.type === 'scallopArc') return 'mid-scallop';
  if (fill.type === 'inset') {
    const t = fill.then;
    if (fill.gap === 2.2) {
      if (t.type === 'split') return t.lower.type === 'fan' ? 'tall-fan-tear' : 'tall-comb-bead';
      if (t.type === 'inset') return 'tall-comb';
    }
    if (fill.gap === 2.0) {
      if (t.type === 'fan') return 'mid-fan';
      if (t.type === 'innerTeardrop') return 'mid-tear';
    }
    if (fill.gap === 1.8 && t.type === 'none') return 'low-inset';
  }
  return 'other';
}

function buildFill(rng: Rng, template: Template): Fill {
  switch (template) {
    case 'tall-fan-tear':
      return {
        type: 'inset',
        gap: 2.2,
        then: {
          type: 'split',
          at: 0.55,
          lower: { type: 'fan', n: randIntIn(rng, 7, 11) },
          upper: {
            type: 'innerTeardrop',
            scale: 0.45,
            then: { type: 'inset', gap: 1.8, then: { type: 'none' } },
          },
        },
      };
    case 'tall-comb':
      return {
        type: 'inset',
        gap: 2.2,
        then: {
          type: 'inset',
          gap: 2.0,
          then: { type: 'comb', n: randIntIn(rng, 9, 15), depth: 0.35 },
        },
      };
    case 'tall-comb-bead':
      return {
        type: 'inset',
        gap: 2.2,
        then: {
          type: 'split',
          at: 0.6,
          lower: { type: 'comb', n: randIntIn(rng, 9, 15), depth: 0.35 },
          upper: { type: 'beadArc', n: randIntIn(rng, 5, 9) },
        },
      };
    case 'mid-fan':
      return { type: 'inset', gap: 2.0, then: { type: 'fan', n: randIntIn(rng, 7, 11) } };
    case 'mid-tear':
      return {
        type: 'inset',
        gap: 2.0,
        then: { type: 'innerTeardrop', scale: 0.5, then: { type: 'none' } },
      };
    case 'mid-scallop':
      return { type: 'scallopArc', n: randIntIn(rng, 3, 5) };
    case 'low-inset':
      return { type: 'inset', gap: 1.8, then: { type: 'none' } };
    case 'low-none':
      return { type: 'none' };
  }
}

/** Choose a fill recipe by layer depth; never repeats `avoid` (the previous petals layer's template). */
export function pickFill(rng: Rng, depth: number, avoid: string | null): Fill {
  const options: readonly Template[] =
    depth >= 20
      ? ['tall-fan-tear', 'tall-comb', 'tall-comb-bead']
      : depth >= 12
        ? ['mid-fan', 'mid-tear', 'mid-scallop']
        : ['low-inset', 'low-none'];
  const allowed = options.filter((t) => t !== avoid);
  return buildFill(rng, pick(rng, allowed.length > 0 ? allowed : options));
}

// ---------------------------------------------------------------- plan

/** Rough depth (mm) of the V gap between neighbouring tips, per shape. A heuristic: no geometry exists yet. */
function valleyDepth(shape: PetalShape, layerDepth: number): number {
  const frac: Record<PetalShape, number> = { lotus: 0.4, teardrop: 0.45, arch: 0.3, round: 0.2 };
  return layerDepth * frac[shape];
}

/** Layer kinds for the n-1 inner layers (the outermost is always petals). Null if nothing valid came up. */
function pickKinds(rng: Rng, n: number): ('band' | 'petals')[] | null {
  for (let attempt = 0; attempt < 100; attempt++) {
    const kinds: ('band' | 'petals')[] = [];
    for (let i = 0; i < n - 1; i++) {
      const prevBand = kinds[i - 1] === 'band';
      const wantBand = i === 0 ? rng() < 0.5 : rng() < 0.4;
      kinds.push(wantBand && !prevBand ? 'band' : 'petals');
    }
    if (n < 3 || (kinds.includes('band') && kinds.includes('petals'))) return kinds;
  }
  return null;
}

function bandFold(k: number, rInner: number, rOuter: number): number {
  const mid = (rInner + rOuter) / 2;
  const arc = (m: number) => (2 * Math.PI * mid) / (k * m);
  const [lo, hi] = BAND_CELL_ARC;
  const violation = (m: number) => Math.max(0, lo - arc(m), arc(m) - hi);
  // Prefer the plan's {2,3,4} (smallest m that is in range); use 6 only when needed. When nothing is
  // in range (k=12, tiny inner bands: cells of ~3.7 mm at m=2), take the least-violating multiplier.
  const inRange = BAND_MULTIPLIERS.filter((m) => violation(m) === 0);
  if (inRange.length > 0) return k * inRange[0]!;
  let best: number = BAND_MULTIPLIERS[0];
  for (const m of BAND_MULTIPLIERS) if (violation(m) < violation(best)) best = m;
  return k * best;
}

export function createPlan(seed: number): MandalaPlan {
  const rng = createRng(seed);
  const k = pick(rng, [8, 12] as const);

  // Centre
  const centreR = R * uniform(rng, NUMBERS.centreFrac);
  const centreKind = pick(rng, ['rosette', 'sunburst', 'star'] as const);
  const centreFold = centreKind === 'star' ? k : rng() < 0.5 ? k : 2 * k;

  // Layer count and kinds (retry with fewer layers if the radii cannot fit)
  let n = randIntIn(rng, NUMBERS.layerCount[0], NUMBERS.layerCount[1]);
  const outerShape: PetalShape = rng() < 0.7 ? 'lotus' : 'teardrop';
  const outerDepth = R * uniform(rng, NUMBERS.outerDepthFrac);

  let kinds: ('band' | 'petals')[] = [];
  let bandDepths: number[] = [];
  let petalDepths: number[] = [];
  for (;;) {
    if (n < 2) throw new Error('createPlan: cannot fit any layers');
    const picked = pickKinds(rng, n);
    if (picked === null) {
      n--;
      continue;
    }
    kinds = picked;
    bandDepths = kinds.filter((x) => x === 'band').map(() => uniform(rng, NUMBERS.bandDepth));
    const innerPetals = kinds.filter((x) => x === 'petals').length;
    const space = R - outerDepth - centreR - bandDepths.reduce((a, b) => a + b, 0);
    const weights = Array.from(
      { length: innerPetals },
      (_, i) => uniform(rng, [1, 1.6]) * (1 + 0.15 * i),
    );
    const total = weights.reduce((a, b) => a + b, 0);
    petalDepths = weights.map((w) => (space * w) / total);
    if (innerPetals > 0 && petalDepths.every((d) => d >= MIN_PETAL_DEPTH)) break;
    if (innerPetals === 0 && space >= -1e-9) break;
    n--;
  }

  // Radii, inner to outer (outermost layer appended as the last entry)
  const depths: number[] = [];
  let bi = 0;
  let pi = 0;
  for (const kind of kinds) depths.push(kind === 'band' ? bandDepths[bi++]! : petalDepths[pi++]!);
  depths.push(outerDepth);
  const bounds: number[] = [centreR];
  for (const d of depths) bounds.push(bounds[bounds.length - 1]! + d);
  bounds[bounds.length - 1] = R;
  const allKinds = [...kinds, 'petals' as const];
  const lastInnerPetal = allKinds.lastIndexOf('petals', allKinds.length - 2);

  // Build layers
  const layers: Layer[] = [];
  let prevPetal: PetalsLayer | null = null;
  let prevTemplate: string | null = null;
  let prevMotif: BandMotif | null = null;
  const tipCandidates: number[] = [];
  allKinds.forEach((kind, i) => {
    const rInner = bounds[i]!;
    const rOuter = bounds[i + 1]!;
    const isOuter = i === allKinds.length - 1;
    if (kind === 'band') {
      const motif = pick(
        rng,
        BAND_MOTIFS.filter((m) => m !== prevMotif),
      );
      prevMotif = motif;
      const band: BandLayer = {
        kind: 'band',
        rInner,
        rOuter,
        fold: bandFold(k, rInner, rOuter),
        phase: 0,
        motif,
      };
      layers.push(band);
      return;
    }
    const depth = rOuter - rInner;
    let shape: PetalShape;
    if (isOuter) shape = outerShape;
    else {
      const banned = new Set<PetalShape>();
      if (prevPetal) banned.add(prevPetal.shape);
      if (i === lastInnerPetal) banned.add(outerShape);
      shape = pick(
        rng,
        INNER_SHAPES.filter((s) => !banned.has(s)),
      );
    }
    let fold: number;
    if (!prevPetal) fold = k;
    else if (isOuter) fold = rng() < 0.5 ? k : 2 * k;
    else fold = rng() < 0.5 ? prevPetal.fold : Math.min(2 * k, prevPetal.fold * 2);
    if (prevPetal && fold < prevPetal.fold) fold = prevPetal.fold;
    const phase: 0 | 0.5 =
      prevPetal && prevPetal.fold === fold ? (prevPetal.phase === 0 ? 0.5 : 0) : 0;
    const fill = pickFill(rng, depth, prevTemplate);
    const u = rng();
    const deep = valleyDepth(shape, depth) >= 6;
    const valley: PetalsLayer['valley'] = deep
      ? u < 0.4
        ? 'smallPetal'
        : u < 0.7
          ? 'dotAccent'
          : 'none'
      : u < 0.3
        ? 'dotAccent'
        : 'none';
    const layer: PetalsLayer = {
      kind: 'petals',
      rInner,
      rOuter,
      fold,
      phase,
      shape,
      fill,
      valley,
      tipAccent: false,
    };
    if (!isOuter) tipCandidates.push(layers.length);
    layers.push(layer);
    prevPetal = layer;
    prevTemplate = fillTemplate(fill);
  });

  // Tip accents: at most 2 layers, never the outermost
  let tips = 0;
  for (const idx of tipCandidates) {
    if (tips < 2 && rng() < 0.4) {
      (layers[idx] as PetalsLayer).tipAccent = true;
      tips++;
    }
  }

  // Double rings: outermost boundary always, others 50%
  const doubleRings: number[] = [];
  for (let i = 0; i < layers.length - 1; i++) {
    const r = rng();
    if (i === layers.length - 2 || r < 0.5) doubleRings.push(i);
  }

  const plan: MandalaPlan = {
    seed,
    k,
    centre: { kind: centreKind, r: centreR, fold: centreFold },
    layers,
    doubleRings,
  };
  assertValidPlan(plan);
  return plan;
}

// ---------------------------------------------------------------- validation

/** Throws if any plan invariant is violated. */
export function assertValidPlan(plan: MandalaPlan): void {
  const fail = (msg: string): never => {
    throw new Error(`invalid plan (seed ${plan.seed}): ${msg}`);
  };
  const { k, layers, centre } = plan;
  if (k !== 8 && k !== 12) fail(`k=${k}`);
  const [cLo, cHi] = NUMBERS.centreFrac;
  if (centre.r < R * cLo - 1e-9 || centre.r > R * cHi + 1e-9) fail('centre radius out of range');
  if (centre.kind === 'star' ? centre.fold !== k : centre.fold !== k && centre.fold !== 2 * k) {
    fail('centre fold');
  }
  if (layers.length < 2 || layers.length > NUMBERS.layerCount[1]) fail('layer count');
  if (layers.length >= 3) {
    if (!layers.some((l) => l.kind === 'band')) fail('no band');
    if (!layers.slice(0, -1).some((l) => l.kind === 'petals')) fail('no inner petals layer');
  }
  if (Math.abs(layers[0]!.rInner - centre.r) > 1e-9) fail('first layer does not touch centre');
  layers.forEach((l, i) => {
    const next = layers[i + 1];
    if (next && l.rOuter !== next.rInner) fail(`layers ${i}/${i + 1} not contiguous`);
    if (l.rOuter <= l.rInner) fail(`layer ${i} has no depth`);
    if (l.kind === 'band') {
      const depth = l.rOuter - l.rInner;
      if (depth < NUMBERS.bandDepth[0] - 1e-9 || depth > NUMBERS.bandDepth[1] + 1e-9) {
        fail(`band ${i} depth ${depth}`);
      }
      if (next?.kind === 'band') fail(`bands ${i}/${i + 1} adjacent`);
      if (i === layers.length - 1) fail('outermost layer is a band');
      if (l.phase !== 0) fail('band phase');
      const m = l.fold / k;
      if (!Number.isInteger(m) || !(BAND_MULTIPLIERS as readonly number[]).includes(m)) {
        fail(`band ${i} fold ${l.fold}`);
      }
      const arc = (2 * Math.PI * ((l.rInner + l.rOuter) / 2)) / l.fold;
      if (arc < BAND_CELL_ARC_FLOOR - 1e-9 || arc > BAND_CELL_ARC[1] + 1e-9) {
        fail(`band ${i} cell arc ${arc}`);
      }
    } else if (l.rOuter - l.rInner < MIN_PETAL_DEPTH - 1e-9) {
      fail(`petals ${i} depth`);
    }
  });
  if (layers[layers.length - 1]!.rOuter !== R) fail('last rOuter != R');
  const outer = layers[layers.length - 1]!;
  if (outer.kind !== 'petals') return fail('outermost layer is not petals');
  const outerDepth = outer.rOuter - outer.rInner;
  if (
    outerDepth < R * NUMBERS.outerDepthFrac[0] - 1e-9 ||
    outerDepth > R * NUMBERS.outerDepthFrac[1] + 1e-9
  ) {
    fail('outer depth');
  }
  if (outer.shape !== 'lotus' && outer.shape !== 'teardrop') fail('outer shape');
  if (outer.fold !== k && outer.fold !== 2 * k) fail('outer fold');

  const petals = layers.filter((l): l is PetalsLayer => l.kind === 'petals');
  petals.forEach((l, i) => {
    if (l.fold !== k && l.fold !== 2 * k) fail(`petal fold ${l.fold}`);
    if (l.phase !== 0 && l.phase !== 0.5) fail('petal phase');
    const prev = petals[i - 1];
    if (!prev) {
      if (l.fold !== k) fail('first petals layer fold must be k');
      if (l.phase !== 0) fail('first petals layer phase');
      return;
    }
    if (l.fold < prev.fold) fail('fold decreases outward');
    if (l.shape === prev.shape) fail('adjacent petals layers share a shape');
    const expectPhase = prev.fold === l.fold ? (prev.phase === 0 ? 0.5 : 0) : 0;
    if (l.phase !== expectPhase) fail('petal phase not staggered');
    if (fillTemplate(l.fill) === 'other') fail('unknown fill template');
    if (fillTemplate(l.fill) === fillTemplate(prev.fill))
      fail('adjacent petals layers share a fill');
  });
  if (petals.some((l) => fillTemplate(l.fill) === 'other')) fail('unknown fill template');
  if (petals.filter((l) => l.tipAccent).length > 2) fail('too many tip accents');
  if (outer.tipAccent) fail('outermost tipAccent');

  const rings = plan.doubleRings;
  if (!rings.includes(layers.length - 2)) fail('missing outer double ring');
  rings.forEach((r, i) => {
    if (!Number.isInteger(r) || r < 0 || r > layers.length - 2) fail(`double ring ${r}`);
    if (i > 0 && r <= rings[i - 1]!) fail('doubleRings not strictly increasing');
  });
}

/** Short stable string identifying a plan's structure: k, centre kind, and per layer kind/shape/fold/template. */
export function planSignature(plan: MandalaPlan): string {
  const layers = plan.layers.map((l) =>
    l.kind === 'band' ? `b:${l.motif}:${l.fold}` : `p:${l.shape}:${l.fold}:${fillTemplate(l.fill)}`,
  );
  return `${plan.k}|${plan.centre.kind}${plan.centre.fold}|${layers.join('/')}`;
}
