import { describe, expect, test } from 'vitest';
import { bbox, circle, sample } from '../geom/path';
import { insetPetal, petalPath } from '../geom/shapes';
import { rotateCopies } from '../geom/symmetry';
import { dist, polar } from '../geom/vec';
import type { Layer, MandalaPlan, Path, PetalShape, PetalSpec, Vec } from '../types';
import { NUMBERS } from '../types';
import {
  ACCENT_CLEARANCE,
  layerAccentBudget,
  tipTeardrop,
  valleyDot,
  valleyDotRadius,
  valleySmallPetal,
  type PetalTemplate,
} from './accents';
import { distToPolyline, distToPolylines } from './clearance';

/** The shape constants M4 will use. */
const TEMPLATES: Record<PetalShape, PetalTemplate> = {
  lotus: { shape: 'lotus', bellyAt: 0.45, bellyScale: 1.25 },
  teardrop: { shape: 'teardrop', bellyAt: 0.33, bellyScale: 1.3 },
  round: { shape: 'round', bellyAt: 0.6, bellyScale: 1.15 },
  arch: { shape: 'arch', bellyAt: 0.7, bellyScale: 1.05 },
};
const SHAPES = Object.keys(TEMPLATES) as PetalShape[];
const FOLDS = [8, 12, 16, 24];
const PHASES = [0, 0.5];
const HALF_OUTLINE = NUMBERS.outlineMm / 2;

function layerPetals(rBase: number, rTip: number, fold: number, phase: number, t: PetalTemplate) {
  const out: Path[] = [];
  for (let i = 0; i < fold; i++) {
    const spec: PetalSpec = {
      shape: t.shape,
      angle: ((i + phase) * 2 * Math.PI) / fold,
      rBase,
      rTip,
      halfWidth: Math.PI / fold,
      bellyAt: t.bellyAt,
      bellyScale: t.bellyScale,
    };
    out.push(petalPath(spec));
  }
  return out;
}

function outlineLines(rBase: number, rTip: number, fold: number, phase: number, t: PetalTemplate) {
  const paths = [
    ...layerPetals(rBase, rTip, fold, phase, t),
    circle({ x: 0, y: 0 }, rBase),
    circle({ x: 0, y: 0 }, rTip),
  ];
  return paths.map((p) => sample(p, 0.1));
}

const valleyCases = SHAPES.flatMap((shape) =>
  FOLDS.flatMap((fold) => PHASES.map((phase) => ({ shape, fold, phase, rBase: 30, rTip: 52 }))),
);

describe('valleyDot', () => {
  test.each(valleyCases)(
    '$shape fold=$fold phase=$phase',
    ({ shape, fold, phase, rBase, rTip }) => {
      const t = TEMPLATES[shape];
      const dots = valleyDot(rBase, rTip, fold, phase, t);
      expect(dots).toHaveLength(fold);
      const lines = outlineLines(rBase, rTip, fold, phase, t);
      const dr = valleyDotRadius(fold);
      for (const d of dots) {
        const pts = sample(d, 0.05);
        const box = bbox(d);
        const c = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
        for (const p of pts) expect(dist(p, c)).toBeCloseTo(dr, 2);
        // Edge clear of every stroke centre line by half the stroke plus 0.3 mm.
        expect(distToPolylines(c, lines) - dr).toBeGreaterThanOrEqual(HALF_OUTLINE + 0.3);
        // Valley is at least 3.2 dot radii wide where the dot sits.
        expect(distToPolylines(c, lines)).toBeGreaterThanOrEqual(1.6 * dr - 1e-3);
        // Sits between two petal axes, i.e. on a valley axis.
        const a = Math.atan2(c.y, c.x) / ((2 * Math.PI) / fold) - phase;
        expect(Math.abs(a - Math.round(a - 0.5) - 0.5)).toBeLessThan(1e-6);
      }
    },
  );

  test('radius interpolates by fold, smaller for 2k, within accentDotR', () => {
    expect(valleyDotRadius(8)).toBeCloseTo(NUMBERS.accentDotR[1]);
    expect(valleyDotRadius(24)).toBeCloseTo(NUMBERS.accentDotR[0]);
    expect(valleyDotRadius(16)).toBeLessThan(valleyDotRadius(8));
    expect(valleyDotRadius(24)).toBeLessThan(valleyDotRadius(12));
  });

  test('returns nothing when the layer is too shallow to hold a dot', () => {
    expect(valleyDot(30, 33, 12, 0, TEMPLATES.lotus)).toEqual([]);
  });

  test('is deterministic', () => {
    expect(valleyDot(30, 52, 12, 0)).toEqual(valleyDot(30, 52, 12, 0));
  });
});

describe('valleySmallPetal', () => {
  test.each(valleyCases)(
    '$shape fold=$fold phase=$phase',
    ({ shape, fold, phase, rBase, rTip }) => {
      const t = TEMPLATES[shape];
      const small = valleySmallPetal(rBase, rTip, fold, phase, t);
      // Dense layers (16/24 petals) can leave a valley too narrow for a colourable petal.
      if (fold >= 16) expect([0, fold]).toContain(small.length);
      else expect(small).toHaveLength(fold);
      const big = layerPetals(rBase, rTip, fold, phase, t).map((p) => sample(p, 0.1));
      for (const s of small) {
        const pts = sample(s, 0.1);
        for (const p of pts) {
          expect(distToPolylines(p, big)).toBeGreaterThanOrEqual(NUMBERS.minStrokeSpacing - 0.01);
          expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(rTip - NUMBERS.minStrokeSpacing + 0.01);
        }
      }
      // Same copies as rotating the first one.
      if (small.length === 0) return;
      const again = rotateCopies([small[0] as Path], fold);
      expect(again[fold - 1]!.start.x).toBeCloseTo(small[fold - 1]!.start.x, 6);
    },
  );

  test('gives up when there is no room', () => {
    expect(valleySmallPetal(30, 40, 24, 0, TEMPLATES.lotus)).toEqual([]);
  });
});

function petal(shape: PetalShape, angle: number, rBase: number, rTip: number): PetalSpec {
  const t = TEMPLATES[shape];
  return {
    shape,
    angle,
    rBase,
    rTip,
    halfWidth: Math.PI / 12,
    bellyAt: t.bellyAt,
    bellyScale: t.bellyScale,
  };
}

const tipCases = SHAPES.flatMap((shape) =>
  [
    [20, 40],
    [30, 55],
    [45, 85],
  ].flatMap(([rBase, rTip]) =>
    [0, 1.3, 2.7].map((angle) => ({ shape, rBase: rBase!, rTip: rTip!, angle })),
  ),
);

describe('tipTeardrop', () => {
  test.each(tipCases)('$shape $rBase-$rTip angle=$angle', ({ shape, rBase, rTip, angle }) => {
    const spec = petal(shape, angle, rBase, rTip);
    const gap = 2.2;
    const td = tipTeardrop(spec, gap);
    expect(td).not.toBeNull();
    const pts = sample(td as Path, 0.05);
    const outer = sample(petalPath(spec), 0.05);
    const inner = insetPetal(spec, gap);
    expect(inner).not.toBeNull();
    const innerLine = sample(petalPath(inner as PetalSpec), 0.05);
    // Clear of the petal outline and the first inset's line.
    for (const p of pts) {
      expect(distToPolyline(p, outer)).toBeGreaterThanOrEqual(ACCENT_CLEARANCE - 1e-6);
      expect(distToPolyline(p, innerLine)).toBeGreaterThanOrEqual(ACCENT_CLEARANCE - 1e-6);
    }
    // Inside the inset: every point is nearer the axis than... checked via the tip being inside
    // and all points on the inner side of the inset tip.
    const axisR = (p: Vec) => Math.hypot(p.x, p.y);
    expect(Math.max(...pts.map(axisR))).toBeLessThan((inner as PetalSpec).rTip);
    // On the axis, pointing at the tip: every point's angle is within the petal's half width.
    for (const p of pts) {
      const da = Math.atan2(p.y, p.x) - angle;
      expect(Math.abs(Math.atan2(Math.sin(da), Math.cos(da)))).toBeLessThan(0.2);
    }
    // Length 0.12 x petal length, clamped 2-4 mm.
    const along = pts.map((p) => p.x * Math.cos(angle) + p.y * Math.sin(angle));
    const length = Math.max(...along) - Math.min(...along);
    const want = Math.min(4, Math.max(2, 0.12 * (rTip - rBase)));
    expect(length).toBeGreaterThan(want - 0.05);
    expect(length).toBeLessThan(want + 0.05);
  });

  test('without an inset the accent keeps clear of the petal outline itself', () => {
    const spec = petal('lotus', 0.4, 30, 55);
    const td = tipTeardrop(spec, 0) as Path;
    const outer = sample(petalPath(spec), 0.05);
    for (const p of sample(td, 0.05)) {
      expect(distToPolyline(p, outer)).toBeGreaterThanOrEqual(ACCENT_CLEARANCE - 1e-6);
    }
    // And sits further out than with the inset.
    const withInset = tipTeardrop(spec, 2.2) as Path;
    const far = (p: Path) => Math.max(...sample(p, 0.05).map((v) => Math.hypot(v.x, v.y)));
    expect(far(td)).toBeGreaterThan(far(withInset));
  });

  test('is a closed path rotated onto the petal axis', () => {
    const td = tipTeardrop(petal('teardrop', 1.1, 30, 55)) as Path;
    expect(td.closed).toBe(true);
    const tip = polar(1, 1.1);
    const pts = sample(td, 0.05);
    const best = pts.reduce((a, p) =>
      p.x * tip.x + p.y * tip.y > a.x * tip.x + a.y * tip.y ? p : a,
    );
    expect(Math.abs(Math.atan2(best.y, best.x) - 1.1)).toBeLessThan(1e-6);
  });

  test('returns null for a petal too small to hold one', () => {
    expect(tipTeardrop(petal('lotus', 0, 20, 23))).toBeNull();
  });
});

function layer(over: Partial<Extract<Layer, { kind: 'petals' }>> = {}): Layer {
  return {
    kind: 'petals',
    rInner: 20,
    rOuter: 40,
    fold: 8,
    phase: 0,
    shape: 'lotus',
    fill: { type: 'none' },
    valley: 'none',
    tipAccent: false,
    ...over,
  };
}

function plan(layers: Layer[]): MandalaPlan {
  return { seed: 1, k: 8, centre: { kind: 'star', r: 12, fold: 8 }, layers, doubleRings: [] };
}

describe('layerAccentBudget', () => {
  test('lists the layers that carry each accent', () => {
    const p = plan([
      layer({ tipAccent: true }),
      { kind: 'band', rInner: 40, rOuter: 46, fold: 16, phase: 0, motif: 'beads' },
      layer({ rInner: 46, rOuter: 60, valley: 'dotAccent', tipAccent: true }),
      layer({ rInner: 60, rOuter: 90, valley: 'smallPetal' }),
    ]);
    expect(layerAccentBudget(p)).toEqual({ tip: [0, 2], valleyDot: [2] });
  });

  test('throws on more than 2 tip-accent layers', () => {
    const p = plan([
      layer({ tipAccent: true }),
      layer({ tipAccent: true }),
      layer({ tipAccent: true }),
    ]);
    expect(() => layerAccentBudget(p)).toThrow(/tip/);
  });

  test('throws on more than 2 valley-dot layers', () => {
    const p = plan([
      layer({ valley: 'dotAccent' }),
      layer({ valley: 'dotAccent' }),
      layer({ valley: 'dotAccent' }),
    ]);
    expect(() => layerAccentBudget(p)).toThrow(/valley/);
  });

  test('two of each is fine', () => {
    const p = plan([
      layer({ tipAccent: true, valley: 'dotAccent' }),
      layer({ tipAccent: true, valley: 'dotAccent' }),
    ]);
    expect(() => layerAccentBudget(p)).not.toThrow();
  });
});
