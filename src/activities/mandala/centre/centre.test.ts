import { describe, expect, test } from 'vitest';
import { distToPolyline, minGap } from '../accent/clearance';
import { sample } from '../geom/path';
import { mirrorAbout, rot } from '../geom/vec';
import type { CentreKind, Drawing, Vec } from '../types';
import { NUMBERS } from '../types';
import { renderCentre } from './centre';

const KINDS: CentreKind[] = ['rosette', 'sunburst', 'star'];
const KS = [8, 12] as const;
const RADII = [11, 14, 16];

function foldsFor(kind: CentreKind, k: number): number[] {
  return kind === 'star' ? [k] : [k, 2 * k];
}

const cases = KINDS.flatMap((kind) =>
  KS.flatMap((k) => foldsFor(kind, k).flatMap((fold) => RADII.map((r) => ({ kind, k, fold, r })))),
);

function lines(d: Drawing, step: number): Vec[][] {
  return d.strokes.map((s) => sample(s.path, step));
}

describe('renderCentre', () => {
  test.each(cases)('$kind k=$k fold=$fold r=$r: ink within r + outline/2', ({ kind, fold, r }) => {
    const d = renderCentre({ kind, r, fold });
    for (const l of lines(d, 0.1)) {
      for (const p of l)
        expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(r + NUMBERS.outlineMm / 2);
    }
    // The rim is an outline circle of radius r.
    const rim = d.strokes.filter((s) => s.role === 'outline');
    expect(rim).toHaveLength(1);
    for (const p of sample(rim[0]!.path, 0.5)) expect(Math.hypot(p.x, p.y)).toBeCloseTo(r, 2);
    expect(d.fills).toHaveLength(0);
  });

  test.each(cases)('$kind k=$k fold=$fold r=$r: D_k symmetric', ({ kind, k, fold, r }) => {
    const d = renderCentre({ kind, r, fold });
    const all = lines(d, 0.1);
    const near = (p: Vec) => Math.min(...all.map((l) => distToPolyline(p, l)));
    for (const l of lines(d, 0.3)) {
      for (const p of l) {
        expect(near(rot(p, (2 * Math.PI) / k))).toBeLessThan(0.005);
        expect(near(mirrorAbout(p, 0))).toBeLessThan(0.005);
      }
    }
  });

  test.each(cases)(
    '$kind k=$k fold=$fold r=$r: strokes keep minStrokeSpacing unless they meet',
    ({ kind, fold, r }) => {
      const d = renderCentre({ kind, r, fold });
      const ls = lines(d, 0.1);
      // Petals i and i+2 face each other across the base of petal i+1, so for a small rosette
      // their gap is the base chord of one petal: a meeting point, allowed to be narrower.
      const petals = d.strokes.length - 2;
      const allowed =
        kind === 'rosette'
          ? Math.min(NUMBERS.minStrokeSpacing, 2 * 0.28 * r * Math.sin(Math.PI / petals))
          : NUMBERS.minStrokeSpacing;
      for (let i = 0; i < ls.length; i++) {
        for (let j = i + 1; j < ls.length; j++) {
          let g = minGap(ls[i]!, ls[j]!);
          if (g < 0.01) {
            // Meeting point (petal corners on the disc, tangent beads): ignore the stretch of
            // curve within 2.5 spacings of the contact, which is where the wedge is still closing.
            const contact =
              ls[i]!.find((p) => distToPolyline(p, ls[j]!) < 0.01) ??
              ls[j]!.find((p) => distToPolyline(p, ls[i]!) < 0.01)!;
            const keep = (pts: Vec[]) =>
              pts.filter(
                (p) =>
                  Math.hypot(p.x - contact.x, p.y - contact.y) > 2.5 * NUMBERS.minStrokeSpacing,
              );
            const a = keep(ls[i]!);
            const b = keep(ls[j]!);
            if (a.length === 0 || b.length === 0) continue;
            g = minGap(a, b);
          }
          expect(g).toBeGreaterThanOrEqual(allowed - 0.01);
        }
      }
    },
  );

  test('sunburst beads are tangent or spaced, radius >= 1.2 mm, count multiple of k', () => {
    const d = renderCentre({ kind: 'sunburst', r: 16, fold: 8 });
    const beads = d.strokes.filter((s) => s.role === 'detail').slice(1);
    expect(beads.length % 8).toBe(0);
    expect(beads.length).toBeGreaterThan(0);
    const bb = sample(beads[0]!.path, 0.05);
    const xs = bb.map((p) => p.x);
    expect((Math.max(...xs) - Math.min(...xs)) / 2).toBeGreaterThanOrEqual(1.2);
  });

  test('sunburst falls back from 2k to k, then to a plain double ring', () => {
    const count = (r: number, fold: number) =>
      renderCentre({ kind: 'sunburst', r, fold }).strokes.length;
    // 16 beads do not fit at r=16, so 8 do (+ disc + rim).
    expect(count(16, 16)).toBe(10);
    // r = 11: nothing fits radially; disc + inner ring + rim.
    expect(count(11, 8)).toBe(3);
    expect(count(11, 16)).toBe(3);
  });

  test('rosette falls back from 2k to k when petals get too narrow', () => {
    const petals = (fold: number, r: number) =>
      renderCentre({ kind: 'rosette', r, fold }).strokes.length - 2;
    expect(petals(24, 14)).toBe(12);
    expect(petals(16, 14)).toBe(8);
    expect(petals(12, 16)).toBe(12);
  });

  test('star has k points and concave edges', () => {
    const d = renderCentre({ kind: 'star', r: 16, fold: 12 });
    const star = d.strokes[0]!.path;
    expect(star.segs).toHaveLength(24);
    expect(star.closed).toBe(true);
    // Midpoint of an edge lies inside the straight chord (nearer the centre).
    const a = star.start;
    const s = star.segs[0]!;
    if (s.kind !== 'C') throw new Error('expected cubic');
    const mid = { x: (a.x + s.to.x) / 2, y: (a.y + s.to.y) / 2 };
    const curveMid = {
      x: (a.x + 3 * s.c1.x + 3 * s.c2.x + s.to.x) / 8,
      y: (a.y + 3 * s.c1.y + 3 * s.c2.y + s.to.y) / 8,
    };
    expect(Math.hypot(curveMid.x, curveMid.y)).toBeLessThan(Math.hypot(mid.x, mid.y));
  });

  test('is deterministic', () => {
    const c = { kind: 'rosette' as const, r: 14, fold: 12 };
    expect(renderCentre(c)).toEqual(renderCentre(c));
  });
});
