import { describe, expect, test, vi } from 'vitest';
import type { Drawing } from './types';
import { NUMBERS } from './types';

const calls: number[] = [];

vi.mock('./plan/plan', async (importOriginal) => {
  const real = await importOriginal<typeof import('./plan/plan')>();
  // Seed 5 + 7919 deliberately yields the same plan as seed 5.
  return { ...real, createPlan: (s: number) => real.createPlan(s === 5 + 7919 ? 5 : s) };
});

vi.mock('./assemble', async (importOriginal) => {
  const real = await importOriginal<typeof import('./assemble')>();
  return {
    ...real,
    assemble: (plan: Parameters<typeof real.assemble>[0]): Drawing => {
      calls.push(plan.seed);
      const d = real.assemble(plan);
      // The first two attempts produce ink outside the disc.
      if (calls.length <= 2) {
        const bad = d.strokes[0]!;
        return {
          ...d,
          strokes: [
            { ...bad, path: { ...bad.path, start: { x: NUMBERS.R + 10, y: 0 } } },
            ...d.strokes,
          ],
        };
      }
      return d;
    },
  };
});

describe('generateMandala retries', () => {
  test('a failing quickCheck retries with sub-seeds (seed * 31 + attempt) >>> 0', async () => {
    const { generateMandala } = await import('./generate');
    calls.length = 0;
    const g = generateMandala(9);
    expect(calls).toEqual([9, (9 * 31 + 1) >>> 0, (9 * 31 + 2) >>> 0]);
    expect(g.plan.seed).toBe((9 * 31 + 2) >>> 0);
  });

  test('a duplicate planSignature moves the page to its next sub-seed', async () => {
    const { generateBatch, subSeed } = await import('./generate');
    const { planSignature } = await import('./plan/plan');
    const batch = generateBatch(2, 5);
    expect(batch[0]?.plan.seed).toBe(5);
    expect(batch[1]?.plan.seed).toBe(subSeed(5 + 7919, 1));
    expect(planSignature(batch[0]!.plan)).not.toBe(planSignature(batch[1]!.plan));
  });
});
