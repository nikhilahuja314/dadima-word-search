import { describe, expect, test } from 'vitest';
import type { Drawing, Path } from '../types';
import { circle, moveTo, sample } from './path';
import { petalPath } from './shapes';
import { isMirrorSymmetric, mirrorCopy, rotateCopies, symmetriseDrawing } from './symmetry';
import { EPS, dist, polar } from './vec';

const wedge: Path = moveTo({ x: 10, y: 1 }).line({ x: 20, y: 5 }).line({ x: 15, y: 9 }).build();

describe('rotateCopies', () => {
  test('returns fold rotations of each path', () => {
    const out = rotateCopies([wedge, wedge], 6);
    expect(out).toHaveLength(12);
    expect(dist(out[0]!.start, wedge.start)).toBeLessThan(EPS);
    const r = Math.hypot(wedge.start.x, wedge.start.y);
    const a = Math.atan2(wedge.start.y, wedge.start.x);
    expect(dist(out[2]!.start, polar(r, a + Math.PI / 3))).toBeLessThan(EPS);
  });

  test('phase shifts by a fraction of the pitch', () => {
    const out = rotateCopies([wedge], 8, 0.5);
    const r = Math.hypot(wedge.start.x, wedge.start.y);
    const a = Math.atan2(wedge.start.y, wedge.start.x);
    expect(dist(out[0]!.start, polar(r, a + Math.PI / 8))).toBeLessThan(EPS);
    expect(out).toHaveLength(8);
  });

  test('does not mutate inputs', () => {
    const before = JSON.stringify(wedge);
    rotateCopies([wedge], 5);
    expect(JSON.stringify(wedge)).toBe(before);
  });
});

describe('mirrorCopy / isMirrorSymmetric', () => {
  test('mirrors across the axis', () => {
    const [m] = mirrorCopy([wedge], 0);
    expect(dist(m!.start, { x: 10, y: -1 })).toBeLessThan(EPS);
  });

  test('petals and circles are symmetric about their axes', () => {
    const p = petalPath({
      shape: 'lotus',
      angle: 0.6,
      rBase: 20,
      rTip: 60,
      halfWidth: 0.25,
      bellyAt: 0.45,
      bellyScale: 1.2,
    });
    expect(isMirrorSymmetric(p, 0.6, 0.005)).toBe(true);
    expect(isMirrorSymmetric(p, 0.8, 0.005)).toBe(false);
    expect(isMirrorSymmetric(circle({ x: 0, y: 0 }, 10), 1.3, 0.01)).toBe(true);
    expect(isMirrorSymmetric(wedge, 0, 0.01)).toBe(false);
  });
});

function pointSet(paths: Path[]): Set<string> {
  return new Set(
    paths.flatMap((p) => sample(p, 1).map((v) => `${v.x.toFixed(2)},${v.y.toFixed(2)}`)),
  );
}

describe('symmetriseDrawing', () => {
  const d: Drawing = {
    strokes: [{ path: wedge, role: 'detail' }],
    fills: [circle({ x: 12, y: 3 }, 1)],
  };

  test('produces fold x (original + mirror) strokes and fills, preserving roles', () => {
    const s = symmetriseDrawing(d, 8);
    expect(s.strokes).toHaveLength(16);
    expect(s.fills).toHaveLength(16);
    expect(s.strokes.every((x) => x.role === 'detail')).toBe(true);
  });

  test('result is D_fold symmetric: mirror and 2pi/fold rotation map it onto itself', () => {
    const fold = 6;
    const strokePaths = symmetriseDrawing(d, fold).strokes.map((x) => x.path);
    const original = pointSet(strokePaths);
    expect(original.size).toBeGreaterThan(0);
    expect(pointSet(mirrorCopy(strokePaths, 0))).toEqual(original);
    expect(pointSet(rotateCopies(strokePaths, 1, 1 / fold))).toEqual(original);
  });

  test('is deterministic', () => {
    expect(symmetriseDrawing(d, 12)).toEqual(symmetriseDrawing(d, 12));
  });
});
