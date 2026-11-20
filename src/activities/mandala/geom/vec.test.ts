import { describe, expect, test } from 'vitest';
import {
  EPS,
  add,
  angleOf,
  dist,
  len,
  lerp,
  mirrorAbout,
  mirrorX,
  polar,
  rot,
  scale,
  sub,
} from './vec';

const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(Math.abs(a.x - b.x)).toBeLessThan(EPS);
  expect(Math.abs(a.y - b.y)).toBeLessThan(EPS);
};

describe('vec', () => {
  test('EPS is 1e-6', () => expect(EPS).toBe(1e-6));

  test('add, sub, scale', () => {
    expect(add({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({ x: 4, y: 6 });
    expect(sub({ x: 1, y: 2 }, { x: 3, y: 5 })).toEqual({ x: -2, y: -3 });
    expect(scale({ x: 1, y: -2 }, 3)).toEqual({ x: 3, y: -6 });
  });

  test('len and dist', () => {
    expect(len({ x: 3, y: 4 })).toBe(5);
    expect(dist({ x: 1, y: 1 }, { x: 4, y: 5 })).toBe(5);
  });

  test('lerp', () => {
    expect(lerp({ x: 0, y: 0 }, { x: 10, y: 20 }, 0.25)).toEqual({ x: 2.5, y: 5 });
  });

  test('rot rotates counter-clockwise', () => {
    close(rot({ x: 1, y: 0 }, Math.PI / 2), { x: 0, y: 1 });
    close(rot({ x: 0, y: 1 }, Math.PI / 2), { x: -1, y: 0 });
  });

  test('polar and angleOf round-trip', () => {
    close(polar(2, Math.PI / 2), { x: 0, y: 2 });
    expect(angleOf(polar(5, 1.2))).toBeCloseTo(1.2, 12);
    expect(angleOf({ x: -1, y: 0 })).toBeCloseTo(Math.PI, 12);
  });

  test('mirrorX negates y', () => {
    expect(mirrorX({ x: 2, y: 3 })).toEqual({ x: 2, y: -3 });
  });

  test('mirrorAbout reflects across the ray at theta', () => {
    close(mirrorAbout({ x: 1, y: 0 }, Math.PI / 2), { x: -1, y: 0 });
    close(mirrorAbout({ x: 0, y: 1 }, 0), { x: 0, y: -1 });
    const v = { x: 0.3, y: 1.7 };
    close(mirrorAbout(mirrorAbout(v, 0.9), 0.9), v);
    // Points on the axis are fixed.
    close(mirrorAbout(polar(4, 0.9), 0.9), polar(4, 0.9));
  });
});
