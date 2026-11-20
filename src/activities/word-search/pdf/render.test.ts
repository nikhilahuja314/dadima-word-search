import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { GRID_SIZE } from '../types';
import { LAYOUT, computeLayout, fitFontSize, renderPdf } from './render';
import { REALISTIC_WORDS, WIDE_WORDS, fixturePuzzles, makePuzzle } from './render.fixtures';

describe('renderPdf', () => {
  it('produces a one-page A4 PDF', async () => {
    const bytes = await renderPdf([makePuzzle(REALISTIC_WORDS)]);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('%PDF');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect(Math.abs(width - 595.28)).toBeLessThan(0.5);
    expect(Math.abs(height - 841.89)).toBeLessThan(0.5);
    expect(doc.getTitle()).toBe('Word Search');
    expect(doc.getCreator()).toBe('Dadima Word Search Generator');
  });

  it('renders 50 pages for 50 puzzles', async () => {
    const puzzles = Array.from({ length: 50 }, (_, i) => makePuzzle(REALISTIC_WORDS, i));
    const doc = await PDFDocument.load(await renderPdf(puzzles));
    expect(doc.getPageCount()).toBe(50);
  });

  it('renders the fixture set without throwing', async () => {
    const doc = await PDFDocument.load(await renderPdf(fixturePuzzles()));
    expect(doc.getPageCount()).toBe(3);
  });
});

describe('computeLayout', () => {
  const g = computeLayout();

  it('fits the grid within the content width and page', () => {
    expect(g.cell * GRID_SIZE).toBeCloseTo(g.contentWidth, 6);
    expect(g.gridLeft + g.contentWidth).toBeLessThanOrEqual(
      LAYOUT.pageWidth - LAYOUT.margin + 1e-6,
    );
    expect(g.gridTop).toBeCloseTo(LAYOUT.pageHeight - LAYOUT.margin, 6);
  });

  it('stacks grid, rule and list in order and keeps the list above the bottom margin', () => {
    expect(g.gridBottom).toBeGreaterThan(g.ruleY);
    expect(g.ruleY).toBeGreaterThan(g.listTop);
    expect(g.listTop).toBeGreaterThan(g.listBottom);
    expect(g.listBottom).toBeGreaterThanOrEqual(g.bottomMargin);
    expect(g.rowPitch).toBeLessThanOrEqual(LAYOUT.maxRowPitch);
  });
});

describe('fitFontSize', () => {
  it('keeps realistic words at the nominal size and shrinks worst-case words to fit', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const widthOf = (t: string, s: number) => font.widthOfTextAtSize(t, s);
    const g = computeLayout();
    expect(fitFontSize(widthOf, REALISTIC_WORDS.slice(0, 6), g.columnWidth)).toBe(
      LAYOUT.listFontSize,
    );
    for (const words of [['WWWWWWWWWWWW'], WIDE_WORDS]) {
      const size = fitFontSize(widthOf, words, g.columnWidth);
      expect(size).toBeLessThan(LAYOUT.listFontSize);
      const used =
        size * (LAYOUT.checkboxSize + LAYOUT.checkboxGap) + widthOf('WWWWWWWWWWWW', size);
      expect(used).toBeLessThanOrEqual(g.columnWidth + 1e-6);
    }
  });
});
