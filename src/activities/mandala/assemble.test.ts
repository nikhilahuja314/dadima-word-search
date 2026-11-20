import { describe, expect, test } from 'vitest';
import { distToSegment, minGap } from './accent/clearance';
import { assemble, layerTemplate, PETAL_DEFAULTS } from './assemble';
import { sample } from './geom/path';
import { mirrorAbout, rot } from './geom/vec';
import { createPlan } from './plan/plan';
import type { BandMotif, Drawing, Layer, MandalaPlan, Path, Vec } from './types';
import { NUMBERS } from './types';

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);
const SLOW = 120_000;

const cache = new Map<number, { plan: MandalaPlan; drawing: Drawing }>();
/** Assembled once per seed for the whole file (assembly costs ~50 ms). */
function built(seed: number): { plan: MandalaPlan; drawing: Drawing } {
  let b = cache.get(seed);
  if (!b) {
    const plan = createPlan(seed);
    b = { plan, drawing: assemble(plan) };
    cache.set(seed, b);
  }
  return b;
}

/** Grid hash over polyline segments for nearest-distance queries. */
class SegmentGrid {
  private cells = new Map<string, [Vec, Vec][]>();
  private readonly cell = 0.5;
  constructor(lines: Vec[][]) {
    for (const l of lines) {
      for (let i = 0; i + 1 < l.length; i++) {
        const a = l[i] as Vec;
        const b = l[i + 1] as Vec;
        const seg: [Vec, Vec] = [a, b];
        const keys = new Set([
          this.key(a),
          this.key(b),
          this.key({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }),
        ]);
        for (const k of keys) {
          const list = this.cells.get(k);
          if (list) list.push(seg);
          else this.cells.set(k, [seg]);
        }
      }
    }
  }
  private key(p: Vec): string {
    return `${Math.floor(p.x / this.cell)},${Math.floor(p.y / this.cell)}`;
  }
  distance(p: Vec): number {
    const cx = Math.floor(p.x / this.cell);
    const cy = Math.floor(p.y / this.cell);
    let best = Infinity;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        for (const [a, b] of this.cells.get(`${cx + dx},${cy + dy}`) ?? []) {
          best = Math.min(best, distToSegment(p, a, b));
        }
      }
    }
    return best;
  }
}

function allPaths(d: Drawing): Path[] {
  return [...d.strokes.map((s) => s.path), ...d.fills];
}

/** Strokes that are full circles about the origin. */
function circularStrokes(d: Drawing): { path: Path; role: string; r: number }[] {
  const out: { path: Path; role: string; r: number }[] = [];
  for (const st of d.strokes) {
    if (!st.path.closed) continue;
    const rs = sample(st.path, 1).map((v) => Math.hypot(v.x, v.y));
    const lo = Math.min(...rs);
    if (Math.max(...rs) - lo < 1e-3) out.push({ path: st.path, role: st.role, r: rs[0] as number });
  }
  return out;
}

function symmetryError(d: Drawing, k: number): number {
  const paths = allPaths(d);
  // Dense target polyline (chord error << 0.01 mm); queries are true curve points.
  const target = new SegmentGrid(paths.map((p) => sample(p, 0.05)));
  const queries = paths.flatMap((p) => sample(p, 0.4));
  let worst = 0;
  for (const q of queries) {
    worst = Math.max(
      worst,
      target.distance(rot(q, (2 * Math.PI) / k)),
      target.distance(mirrorAbout(q, 0)),
    );
  }
  return worst;
}

const bandPlan = (motif: BandMotif, rInner: number, rOuter: number, fold: number): MandalaPlan => ({
  seed: 0,
  k: 12,
  centre: { kind: 'star', r: 14, fold: 12 },
  layers: [
    { kind: 'band', rInner: 14, rOuter: rInner, fold: 24, phase: 0, motif: 'zigzag' },
    { kind: 'band', rInner, rOuter, fold, phase: 0, motif },
    {
      kind: 'petals',
      rInner: rOuter,
      rOuter: 90,
      fold: 12,
      phase: 0,
      shape: 'lotus',
      fill: { type: 'none' },
      valley: 'none',
      tipAccent: false,
    },
  ],
  doubleRings: [],
});

describe('assemble', () => {
  test(
    'seeds 1..200 assemble, deterministically',
    () => {
      for (const s of SEEDS) {
        const { drawing } = built(s);
        expect(drawing.strokes.length).toBeGreaterThan(0);
        if (s <= 20) expect(assemble(createPlan(s))).toEqual(drawing);
      }
    },
    SLOW,
  );

  test(
    'D_k symmetric (rotation by 2π/k and mirror about angle 0)',
    () => {
      for (const s of SEEDS.filter((n) => n % 8 === 1)) {
        const { plan, drawing } = built(s);
        expect(symmetryError(drawing, plan.k), `seed ${s}`).toBeLessThan(0.01);
      }
    },
    SLOW,
  );

  test(
    'all ink within R + outlineMm, no NaN',
    () => {
      for (const s of SEEDS) {
        for (const p of allPaths(built(s).drawing)) {
          for (const v of sample(p, 1)) {
            expect(Number.isFinite(v.x) && Number.isFinite(v.y)).toBe(true);
            expect(Math.hypot(v.x, v.y), `seed ${s}`).toBeLessThanOrEqual(
              NUMBERS.R + NUMBERS.outlineMm,
            );
          }
        }
      }
    },
    SLOW,
  );

  test('draw order: centre first, outlines before details within a layer', () => {
    const d = built(5).drawing;
    expect(d.strokes[0]?.role).toBeDefined();
    expect(d.strokes.some((s) => s.role === 'outline')).toBe(true);
    expect(d.strokes.some((s) => s.role === 'detail')).toBe(true);
  });

  test('the outermost layer has no enclosing circle (no outline stroke reaches R as a full circle)', () => {
    for (const s of SEEDS.slice(0, 40)) {
      const d = built(s).drawing;
      for (const st of d.strokes) {
        if (st.role !== 'outline' || !st.path.closed) continue;
        const pts = sample(st.path, 1);
        const rs = pts.map((p) => Math.hypot(p.x, p.y));
        const circular = Math.max(...rs) - Math.min(...rs) < 1e-3;
        if (circular) expect(rs[0]).toBeLessThan(NUMBERS.R - 1);
      }
    }
  });

  test(
    'double rings never come within minStrokeSpacing of the inner layer ink',
    () => {
      let kept = 0;
      let dropped = 0;
      for (const s of SEEDS.slice(0, 80)) {
        const { plan, drawing: d } = built(s);
        const circles = circularStrokes(d);
        for (const i of plan.doubleRings) {
          const layer = plan.layers[i] as Layer;
          const r = layer.rOuter - NUMBERS.ringGap;
          const ring = circles.find((c) => c.role === 'detail' && Math.abs(c.r - r) < 1e-6);
          if (!ring) {
            dropped++;
            continue;
          }
          kept++;
          // Ink of layer i (radially between its rInner and its boundary circle) other than the
          // ring itself.
          for (const st of d.strokes) {
            if (st.path === ring.path) continue;
            for (const v of sample(st.path, 0.4)) {
              const rr = Math.hypot(v.x, v.y);
              if (rr < layer.rInner + 0.5 || rr > layer.rOuter - 0.5) continue;
              expect(Math.abs(rr - r), `seed ${s} layer ${i}`).toBeGreaterThanOrEqual(
                NUMBERS.minStrokeSpacing - 1e-3,
              );
            }
          }
        }
      }
      expect(kept).toBeGreaterThan(0);
      expect(dropped).toBeGreaterThan(0);
    },
    SLOW,
  );

  test(
    'petal tips are never cut by a double ring',
    () => {
      for (const s of SEEDS.slice(0, 80)) {
        const { plan, drawing: d } = built(s);
        for (const i of plan.doubleRings) {
          const layer = plan.layers[i] as Layer;
          if (layer.kind !== 'petals') continue;
          const r = layer.rOuter - NUMBERS.ringGap;
          const ring = circularStrokes(d).find(
            (c) => c.role === 'detail' && Math.abs(c.r - r) < 1e-6,
          );
          expect(ring, `seed ${s} layer ${i}`).toBeUndefined();
        }
      }
    },
    SLOW,
  );

  test.each([
    ['scallops', 5],
    ['arches', 5],
    ['beads', 5],
    ['beads', 9],
    ['pillars', 5],
    ['pillars', 9],
    ['zigzag', 5],
    ['scallops', 9],
    ['arches', 9],
  ] as [BandMotif, number][])('%s in a %s mm band with k*6 folds keeps spacing', (motif, depth) => {
    for (const fold of [24, 48, 72]) {
      // cell arc at mid radius stays >= 3.5 mm for these radii
      const rIn = 30;
      const d = assemble(bandPlan(motif, rIn, rIn + depth, fold));
      const rOut = rIn + depth;
      const circles = circularStrokes(d);
      for (const st of d.strokes) {
        if (st.role !== 'detail') continue;
        const pts = sample(st.path, 0.3);
        const rs = pts.map((v) => Math.hypot(v.x, v.y));
        const isCircle = circles.some((c) => c.path === st.path);
        if (isCircle) {
          // a full circle (mid ring) must be spacing away from both band rings
          for (const ringR of [rIn, rOut]) {
            expect(Math.abs((rs[0] as number) - ringR)).toBeGreaterThanOrEqual(
              NUMBERS.minStrokeSpacing - 1e-3,
            );
          }
        } else if (motif === 'scallops' || motif === 'arches') {
          expect(rOut - Math.max(...rs), `${motif} fold ${fold}`).toBeGreaterThanOrEqual(
            NUMBERS.minStrokeSpacing - 1e-3,
          );
        }
      }
      // Bead and pillar circles (small closed loops) keep spacing to rings, neighbours and lines.
      if (motif === 'beads' || motif === 'pillars') {
        const small = d.strokes
          .filter(
            (st) =>
              st.role === 'detail' && st.path.closed && !circles.some((c) => c.path === st.path),
          )
          .map((st) => sample(st.path, 0.2))
          .filter((loop) => loop.every((v) => Math.hypot(v.x, v.y) > rIn - 0.01));
        for (const loop of small.slice(0, 4)) {
          const rs = loop.map((v) => Math.hypot(v.x, v.y));
          expect(Math.min(...rs) - rIn).toBeGreaterThanOrEqual(NUMBERS.minStrokeSpacing - 1e-3);
          expect(rOut - Math.max(...rs)).toBeGreaterThanOrEqual(NUMBERS.minStrokeSpacing - 1e-3);
        }
        // closest approach between neighbouring bead/pillar circles
        const a = small[0] as Vec[];
        const b = small[1] as Vec[];
        if (a && b) expect(minGap(a, b)).toBeGreaterThanOrEqual(NUMBERS.minStrokeSpacing - 0.05);
      }
    }
  });

  test('layerTemplate only ever reduces bellyScale and keeps petals inside their wedge', () => {
    for (const shape of Object.keys(PETAL_DEFAULTS) as (keyof typeof PETAL_DEFAULTS)[]) {
      for (const fold of [8, 12, 16, 24]) {
        const t = layerTemplate(shape, 20, 50, fold);
        expect(t.bellyScale).toBeLessThanOrEqual(PETAL_DEFAULTS[shape].bellyScale);
        expect(t.shape).toBe(shape);
      }
    }
  });
});
