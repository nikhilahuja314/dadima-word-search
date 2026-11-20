import { toSvgD } from '../geom/path';
import { NUMBERS, type Drawing, type Path } from '../types';
import { pathToPageSpace } from './space';

const PAGE_MM = { width: 210, height: 297 } as const;

function dOf(paths: readonly Path[]): string {
  return paths.map((p) => toSvgD(pathToPageSpace(p), true)).join(' ');
}

function stroke(d: string, w: number): string {
  return `<path d="${d}" fill="none" stroke="#000" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`;
}

/** The three merged elements (outline strokes, detail strokes, fills), in mandala-centred mm. */
export function drawingSvgBody(d: Drawing): string {
  const outline = dOf(d.strokes.filter((s) => s.role === 'outline').map((s) => s.path));
  const detail = dOf(d.strokes.filter((s) => s.role === 'detail').map((s) => s.path));
  const fills = dOf(d.fills);
  return [
    stroke(outline, NUMBERS.outlineMm),
    stroke(detail, NUMBERS.detailMm),
    `<path d="${fills}" fill="#000"/>`,
  ].join('');
}

export interface SvgOptions {
  /** Side of the square viewBox, mm. Default 2R + 4. Ignored with `withPage`. */
  sizeMm?: number;
  /** A4 210 x 297 mm white page with the mandala centred. */
  withPage?: boolean;
}

export function drawingToSvg(d: Drawing, opts: SvgOptions = {}): string {
  const body = drawingSvgBody(d);
  if (opts.withPage) {
    const { width: w, height: h } = PAGE_MM;
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">` +
      `<rect width="${w}" height="${h}" fill="#fff"/>` +
      `<g transform="translate(${w / 2} ${h / 2})">${body}</g></svg>`
    );
  }
  const s = opts.sizeMm ?? 2 * NUMBERS.R + 4;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s}mm" height="${s}mm" viewBox="${-s / 2} ${-s / 2} ${s} ${s}">` +
    body +
    `</svg>`
  );
}
