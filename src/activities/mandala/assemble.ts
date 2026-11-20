import {
  ACCENT_CLEARANCE,
  tipTeardrop,
  valleyDot,
  valleySmallPetal,
  type PetalTemplate,
} from './accent/accents';
import { PolylineIndex } from './accent/clearance';
import { renderCentre } from './centre/centre';
import { renderFill } from './fill/fills';
import { circle, moveTo, sample } from './geom/path';
import { petalPath } from './geom/shapes';
import { rotateCopies } from './geom/symmetry';
import { polar } from './geom/vec';
import type { BandMotif, Drawing, Fill, Layer, MandalaPlan, Path, PetalShape, Vec } from './types';
import { NUMBERS } from './types';

type PetalsLayer = Extract<Layer, { kind: 'petals' }>;
type BandLayer = Extract<Layer, { kind: 'band' }>;

const { detailMm, minStrokeSpacing, minRegionWidth, ringGap } = NUMBERS;

/** Default petal proportions per shape (the plan's numbers). */
export const PETAL_DEFAULTS: Readonly<Record<PetalShape, PetalTemplate>> = {
  lotus: { shape: 'lotus', bellyAt: 0.45, bellyScale: 1.25 },
  teardrop: { shape: 'teardrop', bellyAt: 0.33, bellyScale: 1.3 },
  round: { shape: 'round', bellyAt: 0.6, bellyScale: 1.15 },
  arch: { shape: 'arch', bellyAt: 0.7, bellyScale: 1.05 },
};

/** Smallest bead / small-circle radius worth drawing, mm. */
const MIN_BEAD_R = 1.0;
/** Required white area inside a band motif cell: minRegionArea plus 10% headroom for rasterisation. */
const MIN_CELL_WHITE = NUMBERS.minRegionArea * 1.1;

/** White area left inside a circle of stroke-centre radius r drawn as detail. */
function circleWhite(r: number): number {
  const ri = r - NUMBERS.detailMm / 2;
  return ri > 0 ? Math.PI * ri * ri : 0;
}

/**
 * White area enclosed by an open dome and the chord between its feet (which lies on the band's
 * inner ring, an outline stroke): shoelace area minus the ink of half a detail stroke along the
 * dome and half an outline stroke along the chord.
 */
function domeWhite(d: Path): number {
  const pts = sample(d, 0.1);
  let a = 0;
  let per = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    a += p.x * q.y - q.x * p.y;
    if (i < pts.length - 1) per += Math.hypot(q.x - p.x, q.y - p.y);
  }
  const chord = Math.hypot(pts[0]!.x - pts[pts.length - 1]!.x, pts[0]!.y - pts[pts.length - 1]!.y);
  return Math.abs(a) / 2 - (per * NUMBERS.detailMm) / 2 - (chord * NUMBERS.outlineMm) / 2;
}
/** Floor for the belly clamp: below this a petal looks pinched. */
const MIN_BELLY_SCALE = 0.8;

/**
 * The layer's actual petal template: the shape default, with `bellyScale` reduced (never raised)
 * until the petal (a) stays inside its wedge with at least half a stroke spacing to the wedge
 * boundary beyond the lower 30% of its height, so neighbours never touch or cross, and (b) never
 * exceeds the layer's outer radius (for the outermost layer that is R).
 */
export function layerTemplate(
  shape: PetalShape,
  rBase: number,
  rTip: number,
  fold: number,
): PetalTemplate {
  const def = PETAL_DEFAULTS[shape];
  const halfWidth = Math.PI / fold;
  const rFrom = rBase + 0.3 * (rTip - rBase);
  const ok = (scale: number): boolean => {
    const pts = sample(
      petalPath({
        shape,
        angle: 0,
        rBase,
        rTip,
        halfWidth,
        bellyAt: def.bellyAt,
        bellyScale: scale,
      }),
      0.4,
    );
    for (const p of pts) {
      const r = Math.hypot(p.x, p.y);
      if (r > rTip + 1e-6) return false;
      if (r < rFrom) continue;
      const phi = Math.abs(Math.atan2(p.y, p.x));
      if (r * Math.sin(Math.max(0, halfWidth - phi)) < minStrokeSpacing / 2) return false;
    }
    return true;
  };
  if (ok(def.bellyScale)) return def;
  let lo = MIN_BELLY_SCALE;
  let hi = def.bellyScale;
  if (!ok(lo)) return { ...def, bellyScale: lo };
  for (let i = 0; i < 10; i++) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) lo = mid;
    else hi = mid;
  }
  return { ...def, bellyScale: lo };
}

// ------------------------------------------------------------------ helpers

/**
 * Full circle about the origin as eight 45 degree cubics. `circle()` uses four 90 degree cubics,
 * whose radial error (0.027% of r, 0.015 mm at r = 55) would exceed the 0.01 mm tolerance of the
 * D_k symmetry check on the big rings.
 */
function ring(r: number): Path {
  const b = moveTo({ x: r, y: 0 });
  const o: Vec = { x: 0, y: 0 };
  for (let i = 0; i < 8; i++) b.arc(o, r, (i * Math.PI) / 4, ((i + 1) * Math.PI) / 4);
  return b.close().build();
}

interface Ink {
  outlines: Path[];
  details: Path[];
  fills: Path[];
  /** One copy of the layer's detail ink (not its boundary circles), for the ring clearance check. */
  probe: Path[];
}

/** The top-level inset gap of a fill, or 0 when the fill is not an inset. */
function topInsetGap(fill: Fill): number {
  return fill.type === 'inset' ? fill.gap : 0;
}

// ------------------------------------------------------------------ petals

function petalsInk(layer: PetalsLayer): Ink {
  const { rInner, rOuter, fold, phase, shape, fill } = layer;
  const template = layerTemplate(shape, rInner, rOuter, fold);
  const spec = {
    shape,
    angle: 0,
    rBase: rInner,
    rTip: rOuter,
    halfWidth: Math.PI / fold,
    bellyAt: template.bellyAt,
    bellyScale: template.bellyScale,
  };
  const outline = petalPath(spec);
  // One petal's fill, then rotated copies: never one renderFill per petal.
  const fillPaths = renderFill({ kind: 'petal', spec }, fill).strokes.map((s) => s.path);
  const fills: Path[] = [];
  const probeFills: Path[] = [];

  const valleyDetail =
    layer.valley === 'smallPetal' ? valleySmallPetal(rInner, rOuter, fold, phase, template) : [];
  // valleyDot / valleySmallPetal may return []: draw nothing then.
  if (layer.valley === 'dotAccent') {
    const dots = valleyDot(rInner, rOuter, fold, phase, template);
    fills.push(...dots);
    probeFills.push(...dots.slice(0, 1));
  }

  if (layer.tipAccent) {
    const tip = tipTeardrop(spec, topInsetGap(fill));
    if (tip) {
      // tipTeardrop only clears the first inset, so also keep clear of the deeper fill strokes.
      const index = new PolylineIndex(fillPaths.map((p) => sample(p, 0.1)));
      const need = ACCENT_CLEARANCE + detailMm / 2;
      const clear = sample(tip, 0.1).every((p) => index.clearOf(p, need));
      if (clear) {
        fills.push(...rotateCopies([tip], fold, phase));
        probeFills.push(tip);
      }
    }
  }

  return {
    outlines: rotateCopies([outline], fold, phase),
    details: [...rotateCopies(fillPaths, fold, phase), ...valleyDetail],
    fills,
    probe: [outline, ...fillPaths, ...valleyDetail.slice(0, 1), ...probeFills],
  };
}

// ------------------------------------------------------------------ bands

/** Dome over a cell, in the local frame (cell axis = +x, feet on the inner circle). */
function dome(x0: number, rho: number, h: number, pointed: boolean): Path {
  const K = 0.5523;
  const b = moveTo({ x: x0, y: -rho });
  if (pointed) {
    b.cubic({ x: x0 + 0.55 * h, y: -rho }, { x: x0 + 0.6 * h, y: -0.3 * rho }, { x: x0 + h, y: 0 });
    b.cubic({ x: x0 + 0.6 * h, y: 0.3 * rho }, { x: x0 + 0.55 * h, y: rho }, { x: x0, y: rho });
  } else {
    b.cubic({ x: x0 + K * h, y: -rho }, { x: x0 + h, y: -K * rho }, { x: x0 + h, y: 0 });
    b.cubic({ x: x0 + h, y: K * rho }, { x: x0 + K * h, y: rho }, { x: x0, y: rho });
  }
  return b.build();
}

function maxRadius(path: Path): number {
  let m = 0;
  for (const p of sample(path, 0.3)) m = Math.max(m, Math.hypot(p.x, p.y));
  return m;
}

/**
 * One cell's motif paths (cell axis at angle 0), degraded so every stroke keeps `minStrokeSpacing`
 * from the band's rings (except where a motif deliberately meets a ring: dome feet, zigzag
 * vertices and pillars).
 */
function bandCell(band: BandLayer): Path[] {
  const { rInner, rOuter, fold, motif } = band;
  const depth = rOuter - rInner;
  const sp = minStrokeSpacing;
  const pitch = (2 * Math.PI) / fold;
  const half = pitch / 2;
  const mid = (rInner + rOuter) / 2;
  const cellChord = (r: number): number => 2 * r * Math.sin(half);

  switch (motif as BandMotif) {
    case 'scallops':
    case 'arches': {
      const pointed = motif === 'arches';
      const x0 = rInner * Math.cos(half);
      const rho = rInner * Math.sin(half);
      let h = (pointed ? 1.4 : 1) * rho;
      h = Math.min(h, rOuter - sp - x0);
      const minH = minRegionWidth + detailMm;
      while (h >= minH) {
        const d = dome(x0, rho, h, pointed);
        // Shrinking only reduces the enclosed area, so a dome too small to colour ends the search.
        if (domeWhite(d) < MIN_CELL_WHITE) return [];
        if (rOuter - maxRadius(d) >= sp) return [d];
        h *= 0.95;
      }
      return [];
    }
    case 'beads': {
      const rb = Math.min(cellChord(mid) / 2 - sp / 2, depth / 2 - sp);
      if (rb >= MIN_BEAD_R && circleWhite(rb) >= MIN_CELL_WHITE)
        return [circle({ x: mid, y: 0 }, rb)];
      // Too tight for beads: a single ring down the middle if both strips stay colourable.
      return depth >= 2 * sp ? [ring(mid)] : [];
    }
    case 'zigzag': {
      // Deviation from "rInner+0.8 .. rOuter-0.8": a 0.8 mm inset leaves 0.36 mm slivers against
      // the rings, so the vertices sit on the ring centre lines (T-junctions) instead.
      const a = polar(rInner, -half);
      const b = polar(rOuter, 0);
      const c = polar(rInner, half);
      return [moveTo(a).line(b).line(c).build()];
    }
    case 'pillars': {
      const out: Path[] = [moveTo(polar(rInner, half)).line(polar(rOuter, half)).build()];
      const rc = Math.min(mid * Math.sin(half) - sp, depth / 2 - sp);
      if (rc >= MIN_BEAD_R && circleWhite(rc) >= MIN_CELL_WHITE)
        out.push(circle({ x: mid, y: 0 }, rc));
      return out;
    }
  }
}

function bandInk(band: BandLayer, prev: Layer | null, next: Layer | null): Ink {
  const outlines: Path[] = [];
  // The previous layer's outline already draws the inner circle only for the centre (which draws
  // its own outline circle) and the next petals draw their base arcs: skip those duplicates.
  if (prev !== null) outlines.push(ring(band.rInner));
  if (next === null || next.kind !== 'petals') outlines.push(ring(band.rOuter));
  const cell = bandCell(band);
  // The pillar line is shared between neighbouring cells: emit it once per cell boundary, which is
  // exactly one per cell (the +half side), so rotation covers every boundary.
  const phase = band.phase;
  return {
    outlines,
    details: rotateCopies(cell, band.fold, phase),
    fills: [],
    probe: cell,
  };
}

// ------------------------------------------------------------------ rings

/** True if an extra circle at radius `r` stays `minStrokeSpacing` clear of the probe ink. */
function ringIsClear(probe: readonly Path[], r: number): boolean {
  for (const p of probe) {
    for (const v of sample(p, 0.3)) {
      if (Math.abs(Math.hypot(v.x, v.y) - r) < minStrokeSpacing) return false;
    }
  }
  return true;
}

// ------------------------------------------------------------------ assemble

/** Plan to drawing: centre, then layers inner to outer (outlines before details), then rings. */
export function assemble(plan: MandalaPlan): Drawing {
  const centre = renderCentre(plan.centre);
  const strokes: Drawing['strokes'] = [...centre.strokes];
  const fills: Path[] = [...centre.fills];
  const rings: Path[] = [];

  plan.layers.forEach((layer, i) => {
    const prev = i === 0 ? null : (plan.layers[i - 1] as Layer);
    const next = i + 1 < plan.layers.length ? (plan.layers[i + 1] as Layer) : null;
    const ink =
      layer.kind === 'petals' ? petalsInk(layer) : bandInk(layer, i === 0 ? null : prev, next);
    for (const path of ink.outlines) strokes.push({ path, role: 'outline' });
    for (const path of ink.details) strokes.push({ path, role: 'detail' });
    fills.push(...ink.fills);

    if (plan.doubleRings.includes(i) && next !== null) {
      const r = layer.rOuter - ringGap;
      if (ringIsClear(ink.probe, r)) rings.push(ring(r));
    }
  });
  for (const path of rings) strokes.push({ path, role: 'detail' });
  return { strokes, fills };
}
