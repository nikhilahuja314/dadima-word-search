import { circle, moveTo } from '../geom/path';
import { petalPath } from '../geom/shapes';
import { rotateCopies } from '../geom/symmetry';
import { polar } from '../geom/vec';
import type { Drawing, PetalSpec } from '../types';

/** A fixed lotus petal at angle 0, used by the fixture. */
export const FIXTURE_PETAL: PetalSpec = {
  shape: 'lotus',
  angle: 0,
  rBase: 30,
  rTip: 85,
  halfWidth: Math.PI / 8,
  bellyAt: 0.45,
  bellyScale: 1.25,
};

/** Small solid triangle whose first vertex is exactly `polar(r, 0)`: an orientation marker. */
export function markerAtAngleZero(r: number) {
  const tip = polar(r, 0);
  return moveTo(tip)
    .line({ x: tip.x - 4, y: tip.y + 1.5 })
    .line({ x: tip.x - 4, y: tip.y - 1.5 })
    .close()
    .build();
}

/**
 * Hand-made Drawing for renderer tests and `--fixture` samples: rings, 8 petals (outline) with a
 * detail ring inside, and a marker at angle 0. `fold` rotates the petals so seeds look different.
 */
export function fixtureDrawing(fold = 8): Drawing {
  const petal = petalPath({ ...FIXTURE_PETAL, halfWidth: Math.PI / fold });
  const inner = petalPath({
    ...FIXTURE_PETAL,
    rBase: 34,
    rTip: 78,
    halfWidth: Math.PI / fold - 0.05,
  });
  return {
    strokes: [
      { path: circle({ x: 0, y: 0 }, 15), role: 'outline' },
      { path: circle({ x: 0, y: 0 }, 30), role: 'outline' },
      ...rotateCopies([petal], fold).map((path) => ({ path, role: 'outline' as const })),
      ...rotateCopies([inner], fold).map((path) => ({ path, role: 'detail' as const })),
      { path: circle({ x: 0, y: 0 }, 8), role: 'detail' },
    ],
    fills: [markerAtAngleZero(24)],
  };
}
