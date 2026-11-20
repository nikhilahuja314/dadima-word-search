import { describe, expect, test } from 'vitest';
import { createRng } from '../types';
import type { PetalSpec, Region, SectorSpec, Vec } from '../types';
import { moveTo } from '../geom/path';
import {
  RegionIndex,
  area,
  findSpacingViolation,
  minWidth,
  regionPath,
  regionPolygon,
} from './measure';

const sector: SectorSpec = { rInner: 20, rOuter: 28, a0: 0.2, a1: 0.7 };
const petal: PetalSpec = {
  shape: 'lotus',
  angle: 0.4,
  rBase: 30,
  rTip: 60,
  halfWidth: Math.PI / 12,
  bellyAt: 0.45,
  bellyScale: 1.25,
};

function brute(p: Vec, poly: readonly Vec[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < poly.length; i++) {
    const a = poly[i] as Vec;
    const b = poly[i + 1] as Vec;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
  }
  return best;
}

describe('area / minWidth / regionPath', () => {
  test('sector area matches the closed form', () => {
    const expected = ((sector.a1 - sector.a0) / 2) * (sector.rOuter ** 2 - sector.rInner ** 2);
    expect(area({ kind: 'sector', spec: sector })).toBeCloseTo(expected, 0);
    expect(Math.abs(area({ kind: 'sector', spec: sector }) - expected) / expected).toBeLessThan(
      0.002,
    );
  });

  test('petal area is positive, rotation invariant and below its bounding sector', () => {
    const a = area({ kind: 'petal', spec: petal });
    const b = area({ kind: 'petal', spec: { ...petal, angle: 2 } });
    expect(a).toBeGreaterThan(100);
    expect(b).toBeCloseTo(a, 3);
    expect(a).toBeLessThan(((2 * 1.25 * petal.halfWidth) / 2) * 1.2 * (60 ** 2 - 30 ** 2));
  });

  test('minWidth of a sector is the smaller of depth and inner chord', () => {
    expect(minWidth({ kind: 'sector', spec: sector })).toBeCloseTo(8, 6);
    const thin: SectorSpec = { rInner: 20, rOuter: 40, a0: 0, a1: 0.05 };
    expect(minWidth({ kind: 'sector', spec: thin })).toBeCloseTo(2 * 20 * Math.sin(0.025), 6);
  });

  test('minWidth of a petal shrinks with a smaller half-width', () => {
    const wide = minWidth({ kind: 'petal', spec: petal });
    const narrow = minWidth({ kind: 'petal', spec: { ...petal, halfWidth: petal.halfWidth / 2 } });
    expect(narrow).toBeLessThan(wide);
    expect(narrow).toBeGreaterThan(0);
  });

  test('regionPolygon is a closed ring', () => {
    const ring = regionPolygon({ kind: 'petal', spec: petal }, 0.25);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(regionPath({ kind: 'sector', spec: sector }).closed).toBe(true);
  });
});

describe('RegionIndex', () => {
  const regions: Region[] = [
    { kind: 'petal', spec: petal },
    { kind: 'sector', spec: sector },
  ];
  test.each(regions)('distance and inside agree with brute force ($kind)', (region) => {
    const ring = regionPolygon(region, 0.1);
    const idx = new RegionIndex(ring);
    const rng = createRng(7);
    for (let i = 0; i < 300; i++) {
      const p = { x: -5 + rng() * 70, y: -5 + rng() * 60 };
      expect(idx.distance(p)).toBeCloseTo(brute(p, ring), 9);
    }
    // A point well inside and one well outside.
    const c =
      region.kind === 'petal'
        ? { x: 45 * Math.cos(0.4), y: 45 * Math.sin(0.4) }
        : { x: 24 * Math.cos(0.45), y: 24 * Math.sin(0.45) };
    expect(idx.inside(c)).toBe(true);
    expect(idx.inside({ x: -50, y: -50 })).toBe(false);
    expect(idx.distance({ x: 500, y: 500 })).toBeGreaterThan(100);
  });
});

const line = (x0: number, y0: number, x1: number, y1: number) =>
  moveTo({ x: x0, y: y0 }).line({ x: x1, y: y1 }).build();

describe('findSpacingViolation', () => {
  test('parallel strokes too close are reported, far ones are not', () => {
    expect(
      findSpacingViolation([line(0, 0, 10, 0), line(0, 1, 10, 1)], { min: 1.9 }),
    ).not.toBeNull();
    expect(
      findSpacingViolation([line(0, 0, 10, 0), line(0, 2.5, 10, 2.5)], { min: 1.9 }),
    ).toBeNull();
  });

  test('free ends are exempt but a line running alongside is not', () => {
    // The tip of the second stroke ends 1 mm from the first: exempt.
    expect(findSpacingViolation([line(0, 0, 10, 0), line(5, 1, 5, 6)], { min: 1.6 })).toBeNull();
    expect(
      findSpacingViolation([line(0, 0, 10, 0), line(5, 1, 5, 6)], { min: 1.6, freeEnd: 0 }),
    ).not.toBeNull();
  });

  test('three strokes sharing an end (a fan) are exempt over their first 60%', () => {
    const fan = [-0.3, 0, 0.3].map((a) => line(0, 0, 20 * Math.cos(a), 20 * Math.sin(a)));
    expect(findSpacingViolation(fan, { min: 1.9 })).toBeNull();
    // Packed so tightly that they are still too close past 60% of their length.
    const packed = [-0.02, 0, 0.02].map((a) => line(0, 0, 20 * Math.cos(a), 20 * Math.sin(a)));
    expect(findSpacingViolation(packed, { min: 1.9 })).not.toBeNull();
  });

  test('a stroke compared with itself is never a violation', () => {
    expect(findSpacingViolation([line(0, 0, 10, 0)], { min: 5 })).toBeNull();
  });
});
