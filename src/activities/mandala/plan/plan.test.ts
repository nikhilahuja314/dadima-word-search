import { describe, expect, test } from 'vitest';
import { NUMBERS } from '../types';
import type { Layer, MandalaPlan, PetalShape } from '../types';
import { assertValidPlan, createPlan, fillTemplate, planSignature } from './plan';

const SEEDS = Array.from({ length: 1000 }, (_, i) => i + 1);
const plans = SEEDS.map(createPlan);
type Petals = Extract<Layer, { kind: 'petals' }>;
const petalsOf = (p: MandalaPlan) => p.layers.filter((l): l is Petals => l.kind === 'petals');

describe('createPlan', () => {
  test('is deterministic (100 seeds)', () => {
    for (let s = 1; s <= 100; s++) expect(createPlan(s)).toEqual(createPlan(s));
  });

  test('assertValidPlan never throws over seeds 1..1000', () => {
    for (const p of plans) expect(() => assertValidPlan(p)).not.toThrow();
  });

  test('layers are contiguous from the centre, last rOuter = R', () => {
    for (const p of plans) {
      expect(p.layers[0]!.rInner).toBeCloseTo(p.centre.r, 9);
      p.layers.forEach((l, i) => {
        if (i > 0) expect(l.rInner).toBe(p.layers[i - 1]!.rOuter);
      });
      expect(p.layers.at(-1)!.rOuter).toBe(NUMBERS.R);
    }
  });

  test('layer count 3..5 and mix of kinds', () => {
    for (const p of plans) {
      expect(p.layers.length).toBeGreaterThanOrEqual(3);
      expect(p.layers.length).toBeLessThanOrEqual(5);
      expect(p.layers.some((l) => l.kind === 'band')).toBe(true);
      expect(p.layers.slice(0, -1).some((l) => l.kind === 'petals')).toBe(true);
    }
  });

  test('petal folds: first is k, non-decreasing, never above 2k', () => {
    for (const p of plans) {
      const petals = petalsOf(p);
      expect(petals[0]!.fold).toBe(p.k);
      petals.forEach((l, i) => {
        expect([p.k, 2 * p.k]).toContain(l.fold);
        if (i > 0) expect(l.fold).toBeGreaterThanOrEqual(petals[i - 1]!.fold);
      });
    }
  });

  test('band folds are k*m and cell arc is 3.5..9 mm (4 target)', () => {
    for (const p of plans) {
      for (const l of p.layers) {
        if (l.kind !== 'band') continue;
        expect([2, 3, 4, 6]).toContain(l.fold / p.k);
        const arc = (2 * Math.PI * ((l.rInner + l.rOuter) / 2)) / l.fold;
        expect(arc).toBeGreaterThanOrEqual(3.5);
        expect(arc).toBeLessThanOrEqual(9);
      }
    }
  });

  test('no two adjacent bands, outermost is petals', () => {
    for (const p of plans) {
      p.layers.forEach((l, i) => {
        if (i > 0) expect(l.kind === 'band' && p.layers[i - 1]!.kind === 'band').toBe(false);
      });
      expect(p.layers.at(-1)!.kind).toBe('petals');
    }
  });

  test('no adjacent petals layers share a shape or fill template; outer shape lotus/teardrop', () => {
    for (const p of plans) {
      const petals = petalsOf(p);
      expect(['lotus', 'teardrop']).toContain(petals.at(-1)!.shape);
      petals.forEach((l, i) => {
        if (i === 0) return;
        expect(l.shape).not.toBe(petals[i - 1]!.shape);
        expect(fillTemplate(l.fill)).not.toBe(fillTemplate(petals[i - 1]!.fill));
      });
    }
  });

  test('minimum depths and ranges', () => {
    for (const p of plans) {
      for (const l of p.layers) {
        const d = l.rOuter - l.rInner;
        if (l.kind === 'petals') expect(d).toBeGreaterThanOrEqual(9);
        else {
          expect(d).toBeGreaterThanOrEqual(NUMBERS.bandDepth[0]);
          expect(d).toBeLessThanOrEqual(NUMBERS.bandDepth[1]);
        }
      }
      const outer = p.layers.at(-1)!;
      const frac = (outer.rOuter - outer.rInner) / NUMBERS.R;
      expect(frac).toBeGreaterThanOrEqual(NUMBERS.outerDepthFrac[0] - 1e-9);
      expect(frac).toBeLessThanOrEqual(NUMBERS.outerDepthFrac[1] + 1e-9);
      expect(p.centre.r / NUMBERS.R).toBeGreaterThanOrEqual(NUMBERS.centreFrac[0] - 1e-9);
      expect(p.centre.r / NUMBERS.R).toBeLessThanOrEqual(NUMBERS.centreFrac[1] + 1e-9);
    }
  });

  test('phase staggers equal-fold neighbouring petals layers', () => {
    for (const p of plans) {
      const petals = petalsOf(p);
      petals.forEach((l, i) => {
        if (i === 0) return expect(l.phase).toBe(0);
        const prev = petals[i - 1]!;
        if (prev.fold === l.fold) expect(l.phase).not.toBe(prev.phase);
        else expect(l.phase).toBe(0);
      });
    }
  });

  test('accents and double rings', () => {
    for (const p of plans) {
      const petals = petalsOf(p);
      expect(petals.filter((l) => l.tipAccent).length).toBeLessThanOrEqual(2);
      expect(petals.at(-1)!.tipAccent).toBe(false);
      expect(p.doubleRings).toContain(p.layers.length - 2);
      for (const r of p.doubleRings) expect(r).toBeLessThanOrEqual(p.layers.length - 2);
    }
  });

  test('centre fold rules', () => {
    for (const p of plans) {
      if (p.centre.kind === 'star') expect(p.centre.fold).toBe(p.k);
      else expect([p.k, 2 * p.k]).toContain(p.centre.fold);
    }
  });

  test('variety over seeds 1..1000', () => {
    const k8 = plans.filter((p) => p.k === 8).length / plans.length;
    expect(k8).toBeGreaterThanOrEqual(0.35);
    expect(k8).toBeLessThanOrEqual(0.65);
    for (const kind of ['rosette', 'sunburst', 'star']) {
      expect(
        plans.filter((p) => p.centre.kind === kind).length / plans.length,
      ).toBeGreaterThanOrEqual(0.2);
    }
    const shapes = new Set<PetalShape>(plans.flatMap((p) => petalsOf(p).map((l) => l.shape)));
    expect(shapes).toEqual(new Set(['lotus', 'teardrop', 'round', 'arch']));
    expect(new Set(plans.map(planSignature)).size).toBeGreaterThanOrEqual(900);
  });
});

const base = () => structuredClone(createPlan(7));

describe('assertValidPlan rejects broken plans', () => {
  test('non-contiguous layers', () => {
    const p = base();
    p.layers[1]!.rInner += 1;
    expect(() => assertValidPlan(p)).toThrow();
  });
  test('last rOuter != R', () => {
    const p = base();
    p.layers.at(-1)!.rOuter = 80;
    expect(() => assertValidPlan(p)).toThrow();
  });
  test('missing outer double ring', () => {
    const p = base();
    p.doubleRings = [];
    expect(() => assertValidPlan(p)).toThrow();
  });
  test('outer shape round', () => {
    const p = base();
    (p.layers.at(-1) as Petals).shape = 'round';
    expect(() => assertValidPlan(p)).toThrow();
  });
});
