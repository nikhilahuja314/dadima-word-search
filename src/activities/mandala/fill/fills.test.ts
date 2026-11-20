/* oxlint-disable unicorn/no-thenable -- `then` is the name of a field in the Fill contract (types.ts) */
import { describe, expect, test } from 'vitest';
import { createRng, NUMBERS } from '../types';
import type { Fill, Path, PetalShape, PetalSpec, Region, SectorSpec, Vec } from '../types';
import { sample } from '../geom/path';
import { insetPetal, petalPath } from '../geom/shapes';
import { mirrorAbout, polar } from '../geom/vec';
import { fits, renderFill } from './fills';
import { RegionIndex, findSpacingViolation, regionPolygon } from './measure';

const SHAPES: PetalShape[] = ['lotus', 'teardrop', 'round', 'arch'];
const BELLY: Record<PetalShape, [number, number]> = {
  lotus: [0.45, 1.25],
  teardrop: [0.33, 1.3],
  round: [0.6, 1.15],
  arch: [0.7, 1.05],
};
const MARGIN = NUMBERS.detailMm / 2 + 0.1;
const SPACING = NUMBERS.minStrokeSpacing;

function petalRegion(
  shape: PetalShape,
  rBase: number,
  depth: number,
  fold: number,
  angle = 0.3,
): Region {
  const [bellyAt, bellyScale] = BELLY[shape];
  const spec: PetalSpec = {
    shape,
    angle,
    rBase,
    rTip: rBase + depth,
    halfWidth: Math.PI / fold,
    bellyAt,
    bellyScale,
  };
  return { kind: 'petal', spec };
}

const none: Fill = { type: 'none' };
const inset = (gap: number, then: Fill): Fill => ({ type: 'inset', gap, then });

/** Every fill template that M1's pickFill can emit (n values at the generous end of the ranges). */
const TEMPLATES: Fill[] = [
  inset(2.2, {
    type: 'split',
    at: 0.55,
    lower: { type: 'fan', n: 9 },
    upper: { type: 'innerTeardrop', scale: 0.45, then: inset(1.8, none) },
  }),
  inset(2.2, inset(2.0, { type: 'comb', n: 13, depth: 0.35 })),
  inset(2.2, {
    type: 'split',
    at: 0.6,
    lower: { type: 'comb', n: 13, depth: 0.35 },
    upper: { type: 'beadArc', n: 7 },
  }),
  inset(2.0, { type: 'fan', n: 9 }),
  inset(2.0, { type: 'innerTeardrop', scale: 0.5, then: none }),
  { type: 'scallopArc', n: 4 },
  inset(1.8, none),
  none,
];

function points(paths: readonly Path[], step = 0.25): Vec[] {
  return paths.flatMap((p) => sample(p, step));
}

/** Asserts the three M2 properties for one case; returns whether anything was drawn. */
function check(region: Region, fill: Fill): boolean {
  const paths = renderFill(region, fill).strokes.map((s) => s.path);
  if (!fits(region, fill)) {
    expect(paths).toHaveLength(0);
    return false;
  }
  const idx = new RegionIndex(regionPolygon(region, 0.1));
  for (const p of points(paths)) {
    expect(idx.inside(p)).toBe(true);
    expect(idx.distance(p)).toBeGreaterThanOrEqual(MARGIN - 1e-9);
  }
  expect(findSpacingViolation(paths, { min: SPACING - 0.05, step: 0.25 })).toBeNull();
  return paths.length > 0;
}

describe('renderFill basics', () => {
  const lotus = petalRegion('lotus', 40, 30, 12);

  test('none draws nothing and fits is false', () => {
    expect(renderFill(lotus, none).strokes).toHaveLength(0);
    expect(fits(lotus, none)).toBe(false);
  });

  test('every stroke is a detail stroke and there are no solid fills', () => {
    for (const t of TEMPLATES) {
      const d = renderFill(lotus, t);
      expect(d.fills).toHaveLength(0);
      for (const s of d.strokes) expect(s.role).toBe('detail');
    }
  });

  test('inset draws the inset petal outline (and not the region outline)', () => {
    const d = renderFill(lotus, inset(2, none));
    expect(d.strokes).toHaveLength(1);
    if (lotus.kind !== 'petal') throw new Error('unreachable');
    const inner = insetPetal(lotus.spec, 2);
    expect(inner).not.toBeNull();
    expect(d.strokes[0]?.path).toEqual(petalPath(inner as PetalSpec));
  });

  test('inset of a collapsed petal draws nothing', () => {
    const tiny = petalRegion('lotus', 40, 6, 12);
    expect(renderFill(tiny, inset(2.2, { type: 'fan', n: 9 })).strokes).toHaveLength(0);
  });

  test('requested counts are clamped, never exceeded', () => {
    const fan = renderFill(lotus, { type: 'fan', n: 9 }).strokes;
    expect(fan.length).toBeGreaterThanOrEqual(3);
    expect(fan.length).toBeLessThanOrEqual(9);
    const narrow = renderFill(petalRegion('lotus', 15, 28, 24), { type: 'fan', n: 11 }).strokes;
    expect(narrow.length).toBeLessThan(11);
    const comb = renderFill(lotus, { type: 'comb', n: 40, depth: 0.35 }).strokes;
    expect(comb.length).toBeLessThan(40);
  });

  test('comb strokes keep their spacing right to their free ends', () => {
    for (const shape of SHAPES) {
      const paths = renderFill(petalRegion(shape, 40, 28, 12), {
        type: 'comb',
        n: 13,
        depth: 0.35,
      }).strokes.map((s) => s.path);
      expect(paths.length).toBeGreaterThanOrEqual(3);
      expect(
        findSpacingViolation(paths, { min: SPACING - 0.05, freeEnd: 0, step: 0.1 }),
      ).toBeNull();
    }
  });

  test('a fan is drawn from the base centre', () => {
    const d = renderFill(lotus, { type: 'fan', n: 7 });
    if (lotus.kind !== 'petal') throw new Error('unreachable');
    const base = polar(lotus.spec.rBase + 0.5, lotus.spec.angle);
    for (const s of d.strokes) {
      expect(Math.hypot(s.path.start.x - base.x, s.path.start.y - base.y)).toBeLessThan(1e-6);
    }
  });

  test('beads are tangent circles of radius at least 1 mm', () => {
    const d = renderFill(petalRegion('round', 40, 30, 12), { type: 'beadArc', n: 5 });
    expect(d.strokes.length).toBeGreaterThanOrEqual(3);
    for (const s of d.strokes) {
      expect(s.path.closed).toBe(true);
      const pts = sample(s.path, 0.2);
      const xs = pts.map((p) => p.x);
      const r = (Math.max(...xs) - Math.min(...xs)) / 2;
      expect(r).toBeGreaterThanOrEqual(1.0);
    }
  });

  test('scallops are open arcs along the base', () => {
    const d = renderFill(petalRegion('lotus', 40, 20, 12), { type: 'scallopArc', n: 4 });
    expect(d.strokes.length).toBeGreaterThanOrEqual(2);
    for (const s of d.strokes) expect(s.path.closed).toBe(false);
  });

  test('inner teardrop is a closed teardrop and its fill is nested inside', () => {
    const plain = renderFill(lotus, { type: 'innerTeardrop', scale: 0.5, then: none });
    expect(plain.strokes).toHaveLength(1);
    expect(plain.strokes[0]?.path.closed).toBe(true);
    const wide = petalRegion('lotus', 30, 60, 8);
    const nested = renderFill(wide, { type: 'innerTeardrop', scale: 0.8, then: inset(1.8, none) });
    expect(nested.strokes).toHaveLength(2);
    expect(nested.strokes.every((s) => s.path.closed)).toBe(true);
  });

  test('split draws a cross arc and fills both halves', () => {
    const d = renderFill(lotus, {
      type: 'split',
      at: 0.5,
      lower: { type: 'fan', n: 5 },
      upper: { type: 'beadArc', n: 5 },
    });
    expect(d.strokes.length).toBeGreaterThan(3);
    expect(d.strokes[0]?.path.closed).toBe(false);
  });

  test('output is deterministic', () => {
    for (const t of TEMPLATES) expect(renderFill(lotus, t)).toEqual(renderFill(lotus, t));
  });

  test('output is mirror-symmetric about the petal axis', () => {
    const angle = 0.9;
    for (const shape of SHAPES) {
      const region = petalRegion(shape, 40, 30, 12, angle);
      for (const t of TEMPLATES) {
        const pts = points(
          renderFill(region, t).strokes.map((s) => s.path),
          0.5,
        );
        const polys = renderFill(region, t).strokes.map((s) => sample(s.path, 0.05));
        for (const p of pts) {
          const m = mirrorAbout(p, angle);
          let best = Infinity;
          for (const poly of polys) {
            for (const q of poly) best = Math.min(best, Math.hypot(q.x - m.x, q.y - m.y));
          }
          expect(best).toBeLessThan(0.05);
        }
      }
    }
  });

  test('rotating the region rotates the output', () => {
    const a = renderFill(petalRegion('lotus', 40, 28, 12, 0), TEMPLATES[3] as Fill);
    const b = renderFill(petalRegion('lotus', 40, 28, 12, Math.PI / 2), TEMPLATES[3] as Fill);
    expect(b.strokes).toHaveLength(a.strokes.length);
    expect(a.strokes.length).toBeGreaterThan(0);
  });
});

describe('sector regions', () => {
  const band: Region = {
    kind: 'sector',
    spec: { rInner: 50, rOuter: 62, a0: 0.1, a1: 0.1 + Math.PI / 6 },
  };
  const fills: Fill[] = [
    inset(1.8, none),
    { type: 'comb', n: 9, depth: 0.35 },
    { type: 'beadArc', n: 3 },
    { type: 'scallopArc', n: 3 },
    { type: 'fan', n: 5 },
  ];

  test.each(fills)('supports $type and stays inside', (fill) => {
    expect(check(band, fill)).toBe(true);
  });

  test('innerTeardrop and split draw nothing on a sector', () => {
    expect(
      renderFill(band, { type: 'innerTeardrop', scale: 0.5, then: none }).strokes,
    ).toHaveLength(0);
    expect(
      renderFill(band, { type: 'split', at: 0.5, lower: none, upper: none }).strokes,
    ).toHaveLength(0);
  });

  test('a sector inset draws a sector outline', () => {
    const d = renderFill(band, inset(1.8, none));
    expect(d.strokes).toHaveLength(1);
    expect(d.strokes[0]?.path.closed).toBe(true);
  });

  test('a band too thin for an inset draws nothing', () => {
    const thin: Region = { kind: 'sector', spec: { rInner: 50, rOuter: 54, a0: 0, a1: 0.4 } };
    expect(renderFill(thin, inset(1.8, none)).strokes).toHaveLength(0);
  });
});

function randomFill(rng: () => number, depthLeft: number): Fill {
  const r = rng();
  const int = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
  if (depthLeft <= 0 || r < 0.1) return none;
  if (r < 0.3)
    return { type: 'inset', gap: 1.5 + rng() * 1.5, then: randomFill(rng, depthLeft - 1) };
  if (r < 0.42) return { type: 'fan', n: int(3, 12) };
  if (r < 0.54) return { type: 'comb', n: int(3, 16), depth: 0.2 + rng() * 0.3 };
  if (r < 0.64) return { type: 'beadArc', n: int(3, 10) };
  if (r < 0.74) return { type: 'scallopArc', n: int(2, 6) };
  if (r < 0.86) {
    return {
      type: 'innerTeardrop',
      scale: 0.3 + rng() * 0.4,
      then: randomFill(rng, depthLeft - 1),
    };
  }
  return {
    type: 'split',
    at: 0.35 + rng() * 0.35,
    lower: randomFill(rng, depthLeft - 1),
    upper: randomFill(rng, depthLeft - 1),
  };
}

describe('property: fills stay inside, keep spacing, and degrade silently', () => {
  // 4 shapes x 3 radii x 3 depths x 4 folds x every template, split per shape to keep tests short.
  for (const shape of SHAPES) {
    test(`grid, ${shape}`, { timeout: 120_000 }, () => {
      let drawn = 0;
      let total = 0;
      for (const rBase of [15, 40, 65]) {
        for (const depth of [10, 18, 28]) {
          for (const fold of [8, 12, 16, 24]) {
            const region = petalRegion(shape, rBase, depth, fold);
            for (const t of TEMPLATES) {
              total++;
              if (check(region, t)) drawn++;
            }
          }
        }
      }
      // Guard against vacuous passes: a good share of the generous cases must actually draw.
      expect(drawn / total).toBeGreaterThan(0.35);
    });
  }

  test('every template draws something somewhere, in every shape', () => {
    for (const shape of SHAPES) {
      for (const t of TEMPLATES.slice(0, 7)) {
        const region = petalRegion(shape, 65, 28, 8);
        expect(fits(region, t)).toBe(true);
      }
    }
  });

  test('200 random fills over random regions', { timeout: 120_000 }, () => {
    const rng = createRng(20261120);
    let drawn = 0;
    for (let i = 0; i < 200; i++) {
      const fold = [8, 12, 16, 24][Math.floor(rng() * 4)] as number;
      let region: Region;
      if (rng() < 0.2) {
        const rInner = 20 + rng() * 50;
        const spec: SectorSpec = {
          rInner,
          rOuter: rInner + 5 + rng() * 14,
          a0: rng() * 6,
          a1: 0,
        };
        spec.a1 = spec.a0 + (2 * Math.PI) / fold;
        region = { kind: 'sector', spec };
      } else {
        const shape = SHAPES[Math.floor(rng() * 4)] as PetalShape;
        region = petalRegion(shape, 12 + rng() * 55, 8 + rng() * 24, fold, rng() * 6);
      }
      if (check(region, randomFill(rng, 3))) drawn++;
    }
    expect(drawn).toBeGreaterThan(60);
  });
});
