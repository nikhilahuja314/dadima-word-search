import { describe, expect, test } from 'vitest';
import type { PetalShape, PetalSpec, Vec } from '../types';
import { NUMBERS } from '../types';
import { sample } from './path';
import {
  insetPetal,
  petalAxisPoint,
  petalHalfWidthAt,
  petalPath,
  sectorPath,
  tipHalfAngle,
} from './shapes';
import { EPS, dist, polar, rot } from './vec';
import { isMirrorSymmetric } from './symmetry';

const SHAPES: PetalShape[] = ['lotus', 'teardrop', 'round', 'arch'];

function spec(shape: PetalShape, angle = 0, extra: Partial<PetalSpec> = {}): PetalSpec {
  const belly = { lotus: 0.45, teardrop: 0.33, round: 0.6, arch: 0.5 }[shape];
  return {
    shape,
    angle,
    rBase: 30,
    rTip: 75,
    halfWidth: 0.3,
    bellyAt: belly,
    bellyScale: 1.25,
    ...extra,
  };
}

function inside(p: Vec, poly: Vec[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i] as Vec;
    const b = poly[j] as Vec;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

function distToPolyline(p: Vec, poly: Vec[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < poly.length; i++) {
    const a = poly[i] as Vec;
    const b = poly[i + 1] as Vec;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    best = Math.min(best, dist(p, { x: a.x + t * dx, y: a.y + t * dy }));
  }
  return best;
}

describe('petalPath', () => {
  for (const shape of SHAPES) {
    for (const angle of [0, 1.1, -2.5]) {
      test(`${shape} at ${angle} is closed and mirror-symmetric`, () => {
        const s = spec(shape, angle);
        const p = petalPath(s);
        expect(p.closed).toBe(true);
        expect(dist(p.segs[p.segs.length - 1]!.to, p.start)).toBeLessThan(EPS);
        // Strict check via pointwise sampling, tolerance 0.005 mm.
        expect(isMirrorSymmetric(p, angle, 0.005)).toBe(true);
      });
    }
  }

  test('base corners are at polar(rBase, angle +/- halfWidth)', () => {
    const s = spec('lotus', 0.7);
    const p = petalPath(s);
    expect(dist(p.start, polar(s.rBase, 0.7 + s.halfWidth))).toBeLessThan(EPS);
  });

  test('tip is at rTip on the axis; axis spans rBase..rTip', () => {
    for (const shape of SHAPES) {
      const s = spec(shape, 0.4);
      const p = petalPath(s);
      const tip = polar(s.rTip, 0.4);
      expect(SHAPES.length).toBe(4);
      expect(p.segs.some((seg) => dist(seg.to, tip) < EPS)).toBe(true);
      const pts = sample(p, 0.2).map((v) => rot(v, -0.4));
      expect(Math.max(...pts.map((v) => v.x))).toBeCloseTo(s.rTip, 2);
      expect(Math.min(...pts.map((v) => v.x))).toBeGreaterThan(
        s.rBase * Math.cos(s.halfWidth) - EPS,
      );
    }
  });

  test('pointed shapes meet at the documented tip angle; round is flat', () => {
    for (const shape of ['lotus', 'teardrop', 'arch'] as const) {
      const s = spec(shape);
      const p = petalPath(s);
      const idx = p.segs.findIndex((seg) => dist(seg.to, { x: s.rTip, y: 0 }) < EPS);
      const seg = p.segs[idx]!;
      expect(seg.kind).toBe('C');
      if (seg.kind !== 'C') return;
      const ang = Math.atan2(seg.to.y - seg.c2.y, seg.to.x - seg.c2.x);
      expect(Math.abs(ang)).toBeCloseTo(tipHalfAngle(shape), 6);
      expect(tipHalfAngle(shape)).toBeLessThan(Math.PI / 6);
    }
    expect(tipHalfAngle('lotus') * 2).toBeCloseTo((40 * Math.PI) / 180, 6);
    expect(tipHalfAngle('round')).toBeCloseTo(Math.PI / 2, 9);
  });

  test('widest point is where bellyAt says, scaled by bellyScale', () => {
    const s = spec('lotus', 0, { bellyAt: 0.45, bellyScale: 1.3 });
    const cy = s.rBase * Math.sin(s.halfWidth);
    expect(petalHalfWidthAt(s, 0.45)).toBeCloseTo(1.3 * cy, 2);
  });

  test('adjacent petals share base corners exactly', () => {
    for (const shape of SHAPES) {
      const hw = Math.PI / 12;
      const a = petalPath(spec(shape, 0, { halfWidth: hw }));
      const b = petalPath(spec(shape, 2 * hw, { halfWidth: hw }));
      // a's lower corner (end of the last side seg before the base arc) equals b's start...
      const aLower = polar(30, -hw);
      const bLower = polar(30, 2 * hw - hw);
      const aUpper = a.start;
      const bLowerPt = sample(b, 0.5).reduce((best, q) =>
        dist(q, aUpper) < dist(best, aUpper) ? q : best,
      );
      expect(dist(aLower, polar(30, -hw))).toBeLessThan(EPS);
      expect(dist(aUpper, bLower)).toBeLessThan(EPS);
      expect(dist(bLowerPt, aUpper)).toBeLessThan(EPS);
    }
  });

  test('base edge is the base-circle arc', () => {
    const s = spec('lotus', 0.3);
    const pts = sample(petalPath(s), 0.1).filter(
      (v) => Math.abs(Math.hypot(v.x, v.y) - s.rBase) < 0.02,
    );
    expect(pts.length).toBeGreaterThan(10);
  });
});

describe('insetPetal', () => {
  for (const shape of SHAPES) {
    for (const d of [1, 2, 3]) {
      test(`${shape} inset by ${d} lies inside and keeps >= 0.8 d clearance`, () => {
        const s = spec(shape, 0.5);
        const inner = insetPetal(s, d);
        expect(inner).not.toBeNull();
        const outerPts = sample(petalPath(s), 0.1);
        const innerPts = sample(petalPath(inner!), 0.1);
        let worst = Infinity;
        for (const q of innerPts) {
          expect(inside(q, outerPts)).toBe(true);
          worst = Math.min(worst, distToPolyline(q, outerPts));
        }
        expect(worst).toBeGreaterThanOrEqual(0.8 * d);
      });
    }
  }

  test('inset keeps axis angle and shape', () => {
    const s = spec('teardrop', 0.9);
    const i = insetPetal(s, 2)!;
    expect(i.angle).toBe(0.9);
    expect(i.shape).toBe('teardrop');
    expect(i.rBase).toBeGreaterThan(s.rBase);
    expect(i.rTip).toBeLessThan(s.rTip);
    expect(i.halfWidth).toBeLessThan(s.halfWidth);
  });

  test('returns null once the petal collapses', () => {
    for (const shape of SHAPES) {
      expect(insetPetal(spec(shape), 100)).toBeNull();
      expect(insetPetal(spec(shape), 12)).toBeNull();
    }
    // Too narrow rather than too short.
    expect(insetPetal(spec('lotus', 0, { halfWidth: 0.1 }), 2.9)).toBeNull();
    expect(insetPetal(spec('lotus', 0, { rTip: 40 }), 2)).toBeNull();
    expect(NUMBERS.minRegionWidth).toBeGreaterThan(0);
  });

  test('repeated insets eventually return null, never degenerate geometry', () => {
    let s: PetalSpec | null = spec('lotus');
    let steps = 0;
    while (s && steps < 50) {
      const p = petalPath(s);
      for (const seg of p.segs) expect(Number.isFinite(seg.to.x + seg.to.y)).toBe(true);
      s = insetPetal(s, 1.5);
      steps++;
    }
    expect(s).toBeNull();
  });
});

describe('sectorPath', () => {
  test('is a closed annular sector with the right corners', () => {
    const p = sectorPath({ rInner: 20, rOuter: 30, a0: 0.2, a1: 0.9 });
    expect(p.closed).toBe(true);
    expect(dist(p.start, polar(30, 0.2))).toBeLessThan(EPS);
    const pts = sample(p, 0.1);
    const radii = pts.map((v) => Math.hypot(v.x, v.y));
    expect(Math.min(...radii)).toBeGreaterThan(20 - 0.01);
    expect(Math.max(...radii)).toBeLessThan(30 + 0.01);
    expect(dist(p.segs[p.segs.length - 1]!.to, p.start)).toBeLessThan(EPS);
    const ends = p.segs.map((s) => s.to);
    expect(ends.some((e) => dist(e, polar(20, 0.9)) < EPS)).toBe(true);
    expect(ends.some((e) => dist(e, polar(30, 0.9)) < 0.01)).toBe(true);
  });

  test('wide sectors still stay on their circles', () => {
    const pts = sample(sectorPath({ rInner: 10, rOuter: 40, a0: -1, a1: 4 }), 0.2);
    for (const q of pts) {
      const r = Math.hypot(q.x, q.y);
      expect(r).toBeGreaterThan(10 - 0.01);
      expect(r).toBeLessThan(40 + 0.01);
    }
  });
});

describe('petalAxisPoint / petalHalfWidthAt', () => {
  test('axis point interpolates base to tip along the axis', () => {
    const s = spec('lotus', 0.8);
    expect(dist(petalAxisPoint(s, 0), polar(30, 0.8))).toBeLessThan(EPS);
    expect(dist(petalAxisPoint(s, 1), polar(75, 0.8))).toBeLessThan(EPS);
    expect(dist(petalAxisPoint(s, 0.5), polar(52.5, 0.8))).toBeLessThan(EPS);
  });

  test('half-width: positive in the body, ~0 at the pointed tip, rotation invariant', () => {
    const a = spec('lotus', 0);
    const b = spec('lotus', 2.2);
    for (const t of [0.2, 0.5, 0.8]) {
      expect(petalHalfWidthAt(a, t)).toBeGreaterThan(0.5);
      expect(petalHalfWidthAt(a, t)).toBeCloseTo(petalHalfWidthAt(b, t), 3);
    }
    expect(petalHalfWidthAt(a, 1)).toBeLessThan(0.05);
    expect(petalHalfWidthAt(a, 0.9)).toBeLessThan(petalHalfWidthAt(a, 0.5));
  });

  test('round petal keeps width near its top', () => {
    const s = spec('round');
    expect(petalHalfWidthAt(s, 0.95)).toBeGreaterThan(1);
  });
});
