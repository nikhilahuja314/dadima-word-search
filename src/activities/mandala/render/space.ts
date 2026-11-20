import type { Path, Vec } from '../types';
import { rot } from '../geom/vec';
import { transform } from '../geom/path';

export const PT_PER_MM = 72 / 25.4;

/**
 * Maths space (mm, y up, angle 0 = +x) to page space (mm, y up, origin at the mandala centre).
 * Rotates by +pi/2 so a feature at angle 0 lands at the top of the page. Shared by the SVG and PDF
 * renderers so they cannot disagree about orientation.
 */
export function toPageSpace(v: Vec): Vec {
  return rot(v, Math.PI / 2);
}

export function pathToPageSpace(p: Path): Path {
  return transform(p, toPageSpace);
}
