import { PDFArray, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { A4 } from '../../../core/page';
import type { Drawing } from '../types';
import { fixtureDrawing, markerAtAngleZero } from './fixtures';
import { renderPdf } from './pdf';
import { PT_PER_MM } from './space';

function mul(a: number[], b: number[]): number[] {
  return [
    b[0]! * a[0]! + b[1]! * a[2]!,
    b[0]! * a[1]! + b[1]! * a[3]!,
    b[2]! * a[0]! + b[3]! * a[2]!,
    b[2]! * a[1]! + b[3]! * a[3]!,
    b[4]! * a[0]! + b[5]! * a[2]! + a[4]!,
    b[4]! * a[1]! + b[5]! * a[3]! + a[5]!,
  ];
}

async function contentStreams(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((page) => {
    const contents = page.node.lookup(PDFName.of('Contents'));
    const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
    return refs
      .map((r) => {
        const s = page.node.context.lookup(r);
        if (!(s instanceof PDFRawStream)) throw new Error('unexpected content object');
        return new TextDecoder().decode(decodePDFRawStream(s).decode());
      })
      .join('\n');
  });
}

describe('renderPdf', () => {
  it('writes one A4 page per drawing with metadata', async () => {
    const bytes = await renderPdf([fixtureDrawing(8), fixtureDrawing(12), fixtureDrawing(8)]);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(3);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeCloseTo(A4.width, 1);
    expect(height).toBeCloseTo(A4.height, 1);
    expect(doc.getTitle()).toBe('Mandalas for Dadima');
    expect(doc.getCreator()).toBe('Dadima Word Search Generator');
  });

  it('paints exactly 3 paths per fixture page: 2 strokes, 1 fill', async () => {
    const [content] = await contentStreams(await renderPdf([fixtureDrawing()]));
    const ops = (content ?? '').split('\n').map((l) => l.trim());
    expect(ops.filter((o) => o === 'S')).toHaveLength(2);
    expect(ops.filter((o) => o === 'f')).toHaveLength(1);
    expect(ops.filter((o) => ['B', 'b', 'f*', 'F'].includes(o))).toHaveLength(0);
  });

  it('prints line widths of exactly 1.5 pt and 1 pt (borderWidth is scaled by the CTM)', async () => {
    const [content] = await contentStreams(await renderPdf([fixtureDrawing()]));
    // Effective width = `w` operand * the scale in the preceding `cm` (a * 0 0 -a).
    const lines = (content ?? '').split('\n').map((l) => l.trim());
    const widths: number[] = [];
    let scale = 1;
    for (const l of lines) {
      const cm = /^([\d.-]+) 0 0 ([\d.-]+) 0 0 cm$/.exec(l);
      if (cm) scale = Number(cm[1]);
      const w = /^([\d.]+) w$/.exec(l);
      if (w) widths.push(Number(w[1]) * scale);
    }
    expect(widths).toHaveLength(2);
    expect(widths[0]).toBeCloseTo(1.5, 2);
    expect(widths[1]).toBeCloseTo(1.0, 2);
  });

  it('orientation: angle 0 is the top of the page, mandala centred', async () => {
    const d: Drawing = { strokes: [], fills: [markerAtAngleZero(80)] };
    const [content] = await contentStreams(await renderPdf([d]));
    // Compose every `cm` in order, then map the first `m` point to device space.
    let m = [1, 0, 0, 1, 0, 0];
    let point: [number, number] | undefined;
    for (const raw of (content ?? '').split('\n')) {
      const l = raw.trim();
      const cm = /^(\S+) (\S+) (\S+) (\S+) (\S+) (\S+) cm$/.exec(l);
      if (cm) m = mul(m, cm.slice(1).map(Number));
      const mv = /^(\S+) (\S+) m$/.exec(l);
      if (mv && !point) {
        const x = Number(mv[1]);
        const y = Number(mv[2]);
        point = [m[0]! * x + m[2]! * y + m[4]!, m[1]! * x + m[3]! * y + m[5]!];
      }
    }
    expect(point).toBeDefined();
    const [px, py] = point as [number, number];
    // PDF y is up, so "top of page" means y above the page centre.
    expect(px).toBeCloseTo(A4.width / 2, 1);
    expect(py).toBeCloseTo(A4.height / 2 + 80 * PT_PER_MM, 1);
  });

  it('renders 50 fixture pages in under 1 s', async () => {
    const drawings = Array.from({ length: 50 }, (_, i) => fixtureDrawing(i % 2 ? 12 : 8));
    const t0 = performance.now();
    const doc = await PDFDocument.load(await renderPdf(drawings));
    expect(doc.getPageCount()).toBe(50);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});

describe('renderPdf determinism', () => {
  it('produces byte-identical output for the same drawings across time', async () => {
    const a = await renderPdf([fixtureDrawing(8)]);
    await new Promise((r) => setTimeout(r, 1100));
    const b = await renderPdf([fixtureDrawing(8)]);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
});
