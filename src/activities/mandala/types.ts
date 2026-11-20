export type { Rng } from '../../core/rng';
export { createRng, pick, randInt, shuffle } from '../../core/rng';

export interface Vec {
  x: number;
  y: number;
}

/** Path segments. 'L' = straight line, 'C' = cubic bézier. All absolute coordinates, mm. */
export type Seg = { kind: 'L'; to: Vec } | { kind: 'C'; c1: Vec; c2: Vec; to: Vec };

export interface Path {
  start: Vec;
  segs: Seg[];
  /** Closed paths get a 'Z'; the last seg's `to` should equal `start` within EPS. */
  closed: boolean;
}

/** outline = 1.5 pt structural edges (petal outlines, layer rings); detail = 1 pt interior work. */
export type StrokeRole = 'outline' | 'detail';

export interface Drawing {
  strokes: { path: Path; role: StrokeRole }[];
  /** Solid black filled shapes (accents). Always closed. Not stroked separately. */
  fills: Path[];
}

/** A petal, described parametrically so it can be inset by regenerating it smaller. */
export type PetalShape = 'lotus' | 'teardrop' | 'round' | 'arch';
export interface PetalSpec {
  shape: PetalShape;
  /** Axis angle of the petal (radians). The petal is mirror-symmetric about this ray. */
  angle: number;
  /** Radius where the petal's base sits (on the base circle). */
  rBase: number;
  /** Radius of the tip (lotus/teardrop/arch: the point; round: the top of the curve). */
  rTip: number;
  /** Half the angular width of the base, radians. */
  halfWidth: number;
  /** 0..1, how far out the widest point is between base and tip (lotus ~0.45, teardrop ~0.35, round ~0.6). */
  bellyAt: number;
  /** Widest half-width as a multiple of the base half-chord (1.0–1.4). */
  bellyScale: number;
}

/** Annular sector: rInner..rOuter, angle a0..a1 (a0 < a1). */
export interface SectorSpec {
  rInner: number;
  rOuter: number;
  a0: number;
  a1: number;
}

export type Region = { kind: 'petal'; spec: PetalSpec } | { kind: 'sector'; spec: SectorSpec };

/** Interior fill recipes, interpreted by fill/fills.ts. Recursive via `then`. */
export type Fill =
  | { type: 'none' }
  | { type: 'inset'; gap: number; then: Fill } // concentric copy, `gap` mm inside, then fill that
  | { type: 'fan'; n: number } // n strokes radiating from base centre to the boundary
  | { type: 'comb'; n: number; depth: number } // n strokes from boundary inward, `depth` fraction
  | { type: 'beadArc'; n: number } // n tangent circles along an inset arc near the tip
  | { type: 'scallopArc'; n: number } // n semicircle scallops along the base, opening outward
  | { type: 'innerTeardrop'; scale: number; then: Fill } // smaller teardrop on the axis, filled recursively
  | { type: 'split'; at: number; lower: Fill; upper: Fill }; // cross-arc at fraction `at` from base, fill each side

export type BandMotif = 'scallops' | 'arches' | 'beads' | 'zigzag' | 'pillars';

export type Layer =
  | {
      kind: 'petals';
      rInner: number;
      rOuter: number;
      /** Petals per full turn. Always k or 2k. */
      fold: number;
      /** 0 = petal axis on angle 0; 0.5 = shifted half a pitch. */
      phase: 0 | 0.5;
      shape: PetalShape;
      fill: Fill;
      /** What goes in the V gaps between petal tips. */
      valley: 'none' | 'smallPetal' | 'dotAccent';
      tipAccent: boolean;
    }
  | {
      kind: 'band';
      rInner: number;
      rOuter: number;
      fold: number; // motif repeats per turn: k * m for m in {2,3,4}
      phase: 0 | 0.5;
      motif: BandMotif;
    };

export type CentreKind = 'rosette' | 'sunburst' | 'star';

export interface MandalaPlan {
  seed: number;
  k: 8 | 12;
  centre: { kind: CentreKind; r: number; fold: number };
  /** Inner to outer, contiguous: layers[i].rOuter === layers[i+1].rInner. Last rOuter === R. */
  layers: Layer[];
  /** Draw a double ring (two circles NUMBERS.ringGap apart) between these layer indices i|i+1. */
  doubleRings: number[];
}

export const NUMBERS = {
  /** Outer radius, mm. */
  R: 90,
  /** Stroke widths, pt. */
  outlinePt: 1.5,
  detailPt: 1.0,
  /** The same in mm (derived; used for spacing maths). */
  outlineMm: 0.529,
  detailMm: 0.353,
  /** Narrowest white gap any construction may leave, mm (edge to edge). */
  minRegionWidth: 1.6,
  /** Raster check, mm². */
  minRegionArea: 4,
  /** Centre-to-centre spacing for parallel detail strokes, mm (minRegionWidth + detailMm). */
  minStrokeSpacing: 1.6 + 0.353,
  /** Gap between double-ring circles, mm. */
  ringGap: 1.8,
  /** Centre radius / R. */
  centreFrac: [0.13, 0.18],
  /** Layer count, not counting the centre. */
  layerCount: [3, 5],
  /** Outermost petal layer depth / R. */
  outerDepthFrac: [0.26, 0.34],
  /** Band layer thickness, mm. */
  bandDepth: [5, 9],
  /** Accent dot radius, mm. */
  accentDotR: [0.8, 1.2],
  /** Raster check. */
  regionCountRange: [150, 450],
  /** Sub-seeds tried before throwing. */
  maxRetries: 20,
} as const;
