import { describe, expect, test } from 'vitest';
import type { Path } from '../types';
import { bbox, circle, moveTo, reverse, sample, toSvgD, transform } from './path';
import { EPS, add, dist, polar } from './vec';

describe('moveTo builder', () => {
  test('line and cubic accumulate segments', () => {
    const p = moveTo({ x: 0, y: 0 })
      .line({ x: 1, y: 0 })
      .cubic({ x: 2, y: 0 }, { x: 2, y: 1 }, { x: 1, y: 1 })
      .close()
      .build();
    expect(p.start).toEqual({ x: 0, y: 0 });
    expect(p.segs).toHaveLength(2);
    expect(p.segs[0]?.kind).toBe('L');
    expect(p.segs[1]?.kind).toBe('C');
    expect(p.closed).toBe(true);
  });

  test('is open unless closed', () => {
    expect(moveTo({ x: 0, y: 0 }).line({ x: 1, y: 1 }).build().closed).toBe(false);
  });

  test('arc segments span at most 90 degrees', () => {
    const p = moveTo({ x: 5, y: 0 })
      .arc({ x: 0, y: 0 }, 5, 0, 3 * Math.PI)
      .build();
    expect(p.segs).toHaveLength(6);
    expect(moveTo({ x: 5, y: 0 }).arc({ x: 0, y: 0 }, 5, 0, 0.3).build().segs).toHaveLength(1);
  });

  test('arc inserts a line when the current point is not at the arc start', () => {
    const p = moveTo({ x: 0, y: 0 }).arc({ x: 10, y: 0 }, 5, 0, 1).build();
    expect(p.segs[0]?.kind).toBe('L');
  });
});

describe('arc accuracy', () => {
  const centre = { x: 3, y: -2 };
  const r = 17;
  for (const deg of [10, 90, 270]) {
    test(`matches a true circle over ${deg} degrees`, () => {
      const a0 = 0.4;
      const a1 = a0 + (deg * Math.PI) / 180;
      const p = moveTo(add(centre, polar(r, a0)))
        .arc(centre, r, a0, a1)
        .build();
      const pts = sample(p, (r * (a1 - a0)) / 99);
      // Check 100+ points all lie on the circle.
      expect(pts.length).toBeGreaterThanOrEqual(100);
      let worst = 0;
      for (const q of pts) worst = Math.max(worst, Math.abs(dist(q, centre) - r));
      expect(worst).toBeLessThan(0.01);
      const end = pts[pts.length - 1]!;
      expect(dist(end, add(centre, polar(r, a1)))).toBeLessThan(EPS);
    });
  }

  test('negative span runs clockwise', () => {
    const p = moveTo({ x: 5, y: 0 })
      .arc({ x: 0, y: 0 }, 5, 0, -Math.PI / 2)
      .build();
    expect(dist(p.segs[0]!.to, { x: 0, y: -5 })).toBeLessThan(EPS);
  });
});

describe('circle', () => {
  test('is 4 closed cubics on the circle', () => {
    const c = circle({ x: 1, y: 2 }, 10);
    expect(c.closed).toBe(true);
    expect(c.segs).toHaveLength(4);
    expect(c.segs.every((s) => s.kind === 'C')).toBe(true);
    for (const q of sample(c, 0.2)) {
      expect(Math.abs(dist(q, { x: 1, y: 2 }) - 10)).toBeLessThan(0.01);
    }
    expect(dist(c.segs[3]!.to, c.start)).toBeLessThan(EPS);
  });
});

describe('transform and reverse', () => {
  const p: Path = moveTo({ x: 0, y: 0 })
    .line({ x: 4, y: 0 })
    .cubic({ x: 5, y: 1 }, { x: 5, y: 3 }, { x: 4, y: 4 })
    .build();

  test('transform maps every point', () => {
    const t = transform(p, (v) => ({ x: v.x + 1, y: -v.y }));
    expect(t.start).toEqual({ x: 1, y: -0 });
    expect(t.segs[1]).toEqual({
      kind: 'C',
      c1: { x: 6, y: -1 },
      c2: { x: 6, y: -3 },
      to: { x: 5, y: -4 },
    });
    expect(t.closed).toBe(p.closed);
  });

  test('reverse traverses the same curve backwards', () => {
    const r = reverse(p);
    expect(r.start).toEqual({ x: 4, y: 4 });
    expect(r.segs[0]).toEqual({
      kind: 'C',
      c1: { x: 5, y: 3 },
      c2: { x: 5, y: 1 },
      to: { x: 4, y: 0 },
    });
    expect(r.segs[1]).toEqual({ kind: 'L', to: { x: 0, y: 0 } });
    const fwd = sample(p, 0.1);
    const back = sample(r, 0.1);
    expect(dist(fwd[0]!, back[back.length - 1]!)).toBeLessThan(EPS);
    expect(dist(fwd[fwd.length - 1]!, back[0]!)).toBeLessThan(EPS);
  });

  test('reverse twice is the identity', () => {
    expect(reverse(reverse(p))).toEqual(p);
  });
});

describe('sample', () => {
  test('consecutive points are at most step apart, ends included', () => {
    const p = moveTo({ x: 0, y: 0 })
      .cubic({ x: 30, y: 0 }, { x: 0, y: 30 }, { x: 30, y: 30 })
      .line({ x: 30, y: 50 })
      .build();
    for (const step of [0.1, 0.5, 2]) {
      const pts = sample(p, step);
      expect(pts[0]).toEqual({ x: 0, y: 0 });
      expect(pts[pts.length - 1]).toEqual({ x: 30, y: 50 });
      for (let i = 1; i < pts.length; i++) {
        expect(dist(pts[i - 1]!, pts[i]!)).toBeLessThanOrEqual(step + EPS);
      }
    }
  });

  test('rejects non-positive step', () => {
    expect(() => sample(circle({ x: 0, y: 0 }, 1), 0)).toThrow();
  });
});

describe('bbox', () => {
  test('uses curve extrema, not control points', () => {
    const b = bbox(circle({ x: 0, y: 0 }, 10));
    expect(b.minX).toBeCloseTo(-10, 2);
    expect(b.maxX).toBeCloseTo(10, 2);
    expect(b.minY).toBeCloseTo(-10, 2);
    expect(b.maxY).toBeCloseTo(10, 2);
  });

  test('bulging cubic stays under its control polygon', () => {
    const b = bbox(
      moveTo({ x: 0, y: 0 }).cubic({ x: 0, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 0 }).build(),
    );
    expect(b.maxY).toBeCloseTo(7.5, 9);
    expect(b.minY).toBe(0);
  });

  test('polyline', () => {
    const b = bbox(moveTo({ x: 1, y: 2 }).line({ x: -3, y: 5 }).build());
    expect(b).toEqual({ minX: -3, minY: 2, maxX: 1, maxY: 5 });
  });
});

describe('toSvgD', () => {
  const p = moveTo({ x: 1.23456, y: -0.0004 })
    .line({ x: 10, y: 20.5 })
    .cubic({ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 })
    .close()
    .build();

  test('snapshot, y up', () => {
    expect(toSvgD(p, false)).toMatchInlineSnapshot(`"M1.235 0 L10 20.5 C1 2 3 4 5 6 Z"`);
  });

  test('snapshot, y flipped', () => {
    expect(toSvgD(p, true)).toMatchInlineSnapshot(`"M1.235 0 L10 -20.5 C1 -2 3 -4 5 -6 Z"`);
  });

  test('open paths have no Z, and output has no NaN or -0', () => {
    const open = moveTo({ x: 0, y: 0 }).line({ x: 1, y: 1 }).build();
    expect(toSvgD(open, true)).toBe('M0 0 L1 -1');
    for (const d of [toSvgD(circle({ x: 0, y: 0 }, 5), true), toSvgD(p, false)]) {
      expect(d).not.toContain('NaN');
      expect(d).not.toContain('-0 ');
    }
  });

  test('is repeatable', () => {
    const c = circle({ x: 0.1, y: 0.2 }, 33.3333);
    expect(toSvgD(c, true)).toBe(toSvgD(c, true));
  });
});
