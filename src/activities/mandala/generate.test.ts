import { describe, expect, test } from 'vitest';
import { generateBatch, generateMandala, MAX_PATHS, quickCheck, subSeed } from './generate';
import { circle } from './geom/path';
import { assertValidPlan, createPlan, planSignature } from './plan/plan';
import type { Drawing } from './types';
import { NUMBERS } from './types';

const ok: Drawing = { strokes: [{ path: circle({ x: 0, y: 0 }, 10), role: 'outline' }], fills: [] };

describe('quickCheck', () => {
  test('accepts a sane drawing', () => {
    expect(quickCheck(ok)).toBeNull();
  });
  test('rejects NaN', () => {
    const bad = circle({ x: Number.NaN, y: 0 }, 1);
    expect(quickCheck({ strokes: [{ path: bad, role: 'detail' }], fills: [] })).toMatch(/NaN/);
    expect(quickCheck({ strokes: [], fills: [bad] })).toMatch(/NaN/);
  });
  test('rejects ink beyond R + 1, including mid-curve bulges', () => {
    const out = circle({ x: 0, y: 0 }, NUMBERS.R + 1.5);
    expect(quickCheck({ strokes: [{ path: out, role: 'outline' }], fills: [] })).toMatch(/outside/);
    expect(quickCheck({ strokes: [], fills: [out] })).toMatch(/outside/);
    const edge = circle({ x: 0, y: 0 }, NUMBERS.R + 0.9);
    expect(quickCheck({ strokes: [{ path: edge, role: 'outline' }], fills: [] })).toBeNull();
  });
  test('rejects too many paths', () => {
    const many: Drawing = {
      strokes: Array.from({ length: MAX_PATHS }, () => ok.strokes[0]!),
      fills: [],
    };
    expect(quickCheck(many)).toMatch(/too many/);
  });
});

describe('generateMandala', () => {
  test('returns a valid plan and a drawing that passes quickCheck; deterministic', () => {
    for (const seed of [1, 2, 3, 42, 1000]) {
      const g = generateMandala(seed);
      assertValidPlan(g.plan);
      expect(quickCheck(g.drawing)).toBeNull();
      expect(g.plan).toEqual(createPlan(seed));
      expect(generateMandala(seed)).toEqual(g);
    }
  });

  test('sub-seed schedule is (seed * 31 + attempt) >>> 0', () => {
    expect(subSeed(7, 0)).toBe(7);
    expect(subSeed(7, 3)).toBe(220);
    expect(subSeed(0xffffffff, 2)).toBe((0xffffffff * 31 + 2) >>> 0);
  });
});

describe('generateBatch', () => {
  test('pages are distinct, deterministic, and start at the base seed', () => {
    const batch = generateBatch(20, 12345);
    expect(batch).toHaveLength(20);
    const sigs = batch.map((g) => planSignature(g.plan));
    expect(new Set(sigs).size).toBe(20);
    expect(batch[0]?.plan.seed).toBe(12345);
    expect(generateBatch(20, 12345)).toEqual(batch);
  });
});

describe('performance', () => {
  test('generating 50 mandalas stays well under 4 s', () => {
    const t0 = performance.now();
    for (let seed = 1; seed <= 50; seed++) generateMandala(seed);
    const ms = performance.now() - t0;
    console.log(`generate 50 mandalas: ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(4000);
  }, 60_000);
});
