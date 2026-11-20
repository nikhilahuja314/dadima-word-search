import { describe, expect, test } from 'vitest';
import { generateMandala } from '../generate';
import { circle } from '../geom/path';
import type { Drawing } from '../types';
import { NUMBERS } from '../types';
const FAST = Boolean(process.env.FAST);
import { analyse, failureReasons, passes } from './raster';

const ring = (r: number, role: 'outline' | 'detail' = 'detail') => ({
  path: circle({ x: 0, y: 0 }, r),
  role,
});

describe('analyse (synthetic drawings)', () => {
  test('two concentric circles give 2 regions, both fine', () => {
    const d: Drawing = { strokes: [ring(20), ring(30)], fills: [] };
    const r = analyse(d, 8);
    expect(r.regionCount).toBe(2);
    expect(r.tooSmall).toEqual([]);
    expect(r.tooThin).toEqual([]);
    expect(r.symmetryMismatch).toBeLessThan(0.01);
    expect(r.inkOutsideR).toBe(false);
  });

  test('a 0.8 mm annulus is flagged too thin', () => {
    const d: Drawing = { strokes: [ring(20), ring(20 + 0.8 + 0.353)], fills: [] };
    const r = analyse(d, 8);
    expect(r.tooThin).toHaveLength(1);
    expect(r.tooThin[0]!.widthMm).toBeGreaterThan(0.6);
    expect(r.tooThin[0]!.widthMm).toBeLessThan(1.0);
    expect(r.tooSmall).toEqual([]);
    expect(passes(r)).toBe(false);
  });

  test('a tiny circle is flagged too small', () => {
    const d: Drawing = { strokes: [ring(1.2), ring(30)], fills: [] };
    const r = analyse(d, 8);
    expect(r.tooSmall).toHaveLength(1);
    expect(r.tooSmall[0]!.areaMm2).toBeLessThan(4);
    expect(Math.hypot(r.tooSmall[0]!.centroidMm.x, r.tooSmall[0]!.centroidMm.y)).toBeLessThan(0.5);
  });

  test('an off-centre blob is asymmetric', () => {
    const d: Drawing = {
      strokes: [{ path: circle({ x: 40, y: 10 }, 6), role: 'outline' }],
      fills: [],
    };
    expect(analyse(d, 8).symmetryMismatch).toBeGreaterThan(0.05);
  });

  test('ink beyond R + outline width is detected', () => {
    const d: Drawing = { strokes: [ring(91.5, 'outline')], fills: [] };
    expect(analyse(d, 8).inkOutsideR).toBe(true);
    const ok: Drawing = { strokes: [ring(89.9, 'outline')], fills: [] };
    expect(analyse(ok, 8).inkOutsideR).toBe(false);
  });

  test('failureReasons names each failing check', () => {
    const d: Drawing = { strokes: [ring(1.2), ring(30)], fills: [] };
    expect(failureReasons(analyse(d, 8))).toEqual(
      expect.arrayContaining(['too-few-regions', 'too-small']),
    );
  });
});

describe('analyse (generated mandalas)', () => {
  // Slow: set FAST=1 to skip. Region count (150-450) is excluded here: it depends on plan richness
  // and is tuned in M8; `pnpm verify:mandala` still enforces it.
  test.skipIf(FAST)('the first 20 seeds are colourable and symmetric', { timeout: 300_000 }, () => {
    const failures: string[] = [];
    for (let seed = 1; seed <= 20; seed++) {
      const g = generateMandala(seed);
      const r = analyse(g.drawing, g.plan.k);
      const reasons = failureReasons(r).filter((x) => !x.endsWith('-regions'));
      if (reasons.length > 0) failures.push(`seed ${seed}: ${reasons.join(',')}`);
    }
    expect(failures).toEqual([]);
  });

  test.skipIf(FAST)('stroke-convergence pinholes are counted but not flagged', () => {
    const g = generateMandala(1);
    const r = analyse(g.drawing, g.plan.k);
    expect(r.pinholes).toBeGreaterThan(0);
    expect(r.tooSmall.every((f) => f.areaMm2 >= 0.1 || f.widthMm >= NUMBERS.detailMm)).toBe(true);
  });
});
