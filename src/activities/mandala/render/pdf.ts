import { LineCapStyle, PDFDocument, rgb, type PDFPage } from 'pdf-lib';
import { A4 } from '../../../core/page';
import { toSvgD } from '../geom/path';
import { NUMBERS, type Drawing, type Path } from '../types';
import { PT_PER_MM, pathToPageSpace } from './space';

function dOf(paths: readonly Path[]): string {
  return paths.map((p) => toSvgD(pathToPageSpace(p), true)).join(' ');
}

/**
 * pdf-lib finding (checked in node_modules/pdf-lib/cjs/api/operations.js, drawSvgPath): the
 * operator order is `q`, `translate`, `scale(s, -s)`, `w <borderWidth>`, path, paint. The `w`
 * comes AFTER the scale in the CTM, so borderWidth is in the path's own (pre-scale) units and the
 * printed width is borderWidth * scale. With paths in mm and scale 72/25.4, pass the width in mm
 * (pt * 25.4/72), NOT in points, or lines would print 2.83x too thick.
 */
const mmOfPt = (pt: number) => pt / PT_PER_MM;

function drawMandala(page: PDFPage, d: Drawing): void {
  const black = rgb(0, 0, 0);
  const x = A4.width / 2;
  const y = A4.height / 2;
  const strokes = (role: 'outline' | 'detail', pt: number) => {
    const path = dOf(d.strokes.filter((s) => s.role === role).map((s) => s.path));
    if (!path) return;
    page.drawSvgPath(path, {
      x,
      y,
      scale: PT_PER_MM,
      borderWidth: mmOfPt(pt),
      borderColor: black,
      borderLineCap: LineCapStyle.Round,
    });
  };
  strokes('outline', NUMBERS.outlinePt);
  strokes('detail', NUMBERS.detailPt);
  const fills = dOf(d.fills);
  if (fills) page.drawSvgPath(fills, { x, y, scale: PT_PER_MM, color: black });
}

export async function renderPdf(drawings: readonly Drawing[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle('Mandalas for Dadima');
  // Fixed dates: the spec requires byte-identical output for the same input (pdf-lib defaults to now).
  doc.setCreationDate(new Date(0));
  doc.setModificationDate(new Date(0));
  doc.setCreator('Dadima Word Search Generator');
  for (const d of drawings) drawMandala(doc.addPage([A4.width, A4.height]), d);
  return doc.save();
}
