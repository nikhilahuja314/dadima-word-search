import { circle, moveTo, sample, transform } from '../geom/path';
import { petalPath, petalHalfWidthAt } from '../geom/shapes';
import { lerp, polar, rot, scale } from '../geom/vec';
import type { Drawing, MandalaPlan, Path, PetalSpec, Vec } from '../types';
import { NUMBERS } from '../types';
import { minGap } from '../accent/clearance';

type Centre = MandalaPlan['centre'];

const ORIGIN: Vec = { x: 0, y: 0 };

/** Radius of the smallest bead whose white interior is still a colourable region. */
// 10% area headroom: a bead sized to exactly minRegionArea rasterises to 3.99 mm² (seed 468).
const MIN_BEAD_R = Math.max(
  1.2,
  Math.sqrt((NUMBERS.minRegionArea * 1.1) / Math.PI) + NUMBERS.detailMm / 2,
);

/** Fold counts are k or 2k with k in {8, 12}, so anything above 12 is a doubled fold. */
function baseFold(fold: number): number {
  return fold > 12 ? fold / 2 : fold;
}

/** Farthest radius the inner motifs may reach: the spec's 0.92r, but a full stroke spacing short of the rim. */
function reach(r: number): number {
  return Math.min(0.92 * r, r - NUMBERS.minStrokeSpacing);
}

interface RosetteFit {
  petals: PetalSpec;
  /** True if petal interiors and the gaps between petals both meet the minimum widths. */
  ok: boolean;
}

function rosettePetal(r: number, fold: number, bellyScale: number): PetalSpec {
  return {
    shape: 'round',
    angle: 0,
    rBase: 0.28 * r,
    rTip: reach(r),
    halfWidth: Math.PI / fold,
    bellyAt: 0.6,
    bellyScale,
  };
}

/** Open outline: the petal without its base arc (the base sits on the inner disc). */
function openPetal(spec: PetalSpec): Path {
  const full = petalPath(spec);
  return { start: full.start, segs: full.segs.slice(0, -1), closed: false };
}

function fitRosette(r: number, fold: number): RosetteFit {
  const rIn = 0.28 * r;
  // Near the disc the petals meet and the wedge between them is narrower than a stroke spacing;
  // that is a meeting point. Only the part of the outline beyond it has to keep its distance.
  const rMeet = rIn + NUMBERS.minStrokeSpacing / (2 * Math.sin(Math.PI / fold));
  const beyond = (pts: Vec[]) => pts.filter((p) => Math.hypot(p.x, p.y) >= rMeet);
  let chosen = rosettePetal(r, fold, 0.5);
  let gapOk = false;
  // Widest belly that still leaves a full stroke spacing to the neighbouring petal.
  for (let s = 1.25; s >= 0.5 - 1e-9; s -= 0.025) {
    const spec = rosettePetal(r, fold, s);
    const a = beyond(sample(openPetal(spec), 0.08));
    const b = beyond(
      sample(
        transform(openPetal(spec), (v) => rot(v, (2 * Math.PI) / fold)),
        0.08,
      ),
    );
    if (minGap(a, b) >= NUMBERS.minStrokeSpacing) {
      chosen = spec;
      gapOk = true;
      break;
    }
  }
  const midWhite = 2 * petalHalfWidthAt(chosen, 0.5) - NUMBERS.detailMm;
  return { petals: chosen, ok: gapOk && midWhite >= NUMBERS.minRegionWidth };
}

function rosette(c: Centre): Drawing {
  const { r } = c;
  let fit = fitRosette(r, c.fold);
  let fold = c.fold;
  if (!fit.ok && baseFold(c.fold) !== c.fold) {
    fold = baseFold(c.fold);
    fit = fitRosette(r, fold);
  }
  const strokes: Drawing['strokes'] = [{ path: circle(ORIGIN, 0.28 * r), role: 'detail' }];
  for (let i = 0; i < fold; i++) {
    const a = (2 * Math.PI * i) / fold;
    strokes.push({
      path: transform(openPetal(fit.petals), (v) => rot(v, a)),
      role: 'detail',
    });
  }
  strokes.push({ path: circle(ORIGIN, r), role: 'outline' });
  return { strokes, fills: [] };
}

interface BeadFit {
  fold: number;
  beadR: number;
}

const BEAD_CENTRE_FRAC = 0.72;

function fitBeads(r: number, fold: number): BeadFit | null {
  const rc = BEAD_CENTRE_FRAC * r;
  const sp = NUMBERS.minStrokeSpacing;
  const radialCap = Math.min(rc - 0.5 * r, r - rc) - sp;
  const half = rc * Math.sin(Math.PI / fold); // half the chord between adjacent centres
  // Tangent circles if they fit radially, else spaced by at least a stroke spacing.
  const beadR = half <= radialCap ? half : Math.min(radialCap, half - sp / 2);
  return beadR >= MIN_BEAD_R ? { fold, beadR } : null;
}

function sunburst(c: Centre): Drawing {
  const { r } = c;
  const strokes: Drawing['strokes'] = [{ path: circle(ORIGIN, 0.5 * r), role: 'detail' }];
  const fit =
    fitBeads(r, c.fold) ?? (baseFold(c.fold) !== c.fold ? fitBeads(r, baseFold(c.fold)) : null);
  if (fit) {
    for (let i = 0; i < fit.fold; i++) {
      const a = (2 * Math.PI * i) / fit.fold;
      strokes.push({
        path: circle(polar(BEAD_CENTRE_FRAC * r, a), fit.beadR),
        role: 'detail',
      });
    }
  } else {
    // Beads do not fit: a plain double ring instead (spaced for colouring, not by ringGap).
    strokes.push({ path: circle(ORIGIN, r - NUMBERS.minStrokeSpacing), role: 'detail' });
  }
  strokes.push({ path: circle(ORIGIN, r), role: 'outline' });
  return { strokes, fills: [] };
}

function star(c: Centre): Drawing {
  const { r, fold } = c;
  const rOut = reach(r);
  const rIn = 0.45 * r;
  const pull = (v: Vec): Vec => scale(v, 0.85); // 15% toward the centre
  const pts: Vec[] = [];
  for (let i = 0; i < 2 * fold; i++) {
    pts.push(polar(i % 2 === 0 ? rOut : rIn, (Math.PI * i) / fold));
  }
  const b = moveTo(pts[0] as Vec);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i] as Vec;
    const to = pts[(i + 1) % pts.length] as Vec;
    b.cubic(pull(lerp(a, to, 1 / 3)), pull(lerp(a, to, 2 / 3)), to);
  }
  const outline = b.close().build();
  return {
    strokes: [
      { path: outline, role: 'detail' },
      { path: circle(ORIGIN, 0.18 * r), role: 'detail' },
      { path: circle(ORIGIN, r), role: 'outline' },
    ],
    fills: [],
  };
}

/** Centre motif: everything lies within radius `c.r`, whose rim is an outline circle. */
export function renderCentre(c: Centre): Drawing {
  switch (c.kind) {
    case 'rosette':
      return rosette(c);
    case 'sunburst':
      return sunburst(c);
    case 'star':
      return star(c);
  }
}
