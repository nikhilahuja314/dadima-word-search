import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { A4 } from '../../../core/page';
import { GRID_SIZE, type Puzzle } from '../types';

/** All layout numbers in points. A4 portrait; pdf-lib origin is bottom-left. */
export const LAYOUT = {
  pageWidth: A4.width,
  pageHeight: A4.height,
  margin: 42.5,
  gridFontSize: 28,
  /** Baseline sits this fraction of the font size below the cell centre. */
  gridBaselineOffset: 0.35,
  ruleThickness: 1,
  ruleGap: 18,
  listGap: 24,
  listFontSize: 22,
  listRows: 6,
  maxRowPitch: 40,
  checkboxStroke: 1.25,
  checkboxSize: 0.6,
  checkboxGap: 0.4,
  /** Minimum clear space between a word's right edge and the next column / right margin. */
  columnClearance: 8,
  /** Cap height of Helvetica as a fraction of font size. */
  capHeight: 0.72,
  /** Smallest font a column may shrink to before we give up shrinking. */
  minListFontSize: 12,
} as const;

export interface Layout {
  contentWidth: number;
  cell: number;
  gridLeft: number;
  gridTop: number;
  gridBottom: number;
  ruleY: number;
  listTop: number;
  /** Baseline of row 0 at the nominal font size. */
  firstBaseline: number;
  rowPitch: number;
  /** Baseline of the last row at the nominal font size (the lowest ink on the page). */
  listBottom: number;
  bottomMargin: number;
  columnX: [number, number];
  /** Width available for checkbox + gap + word in each column, at the nominal font size. */
  columnWidth: number;
}

export function computeLayout(): Layout {
  const L = LAYOUT;
  const contentWidth = L.pageWidth - 2 * L.margin;
  const cell = contentWidth / GRID_SIZE;
  const gridTop = L.pageHeight - L.margin;
  const gridBottom = gridTop - cell * GRID_SIZE;
  const ruleY = gridBottom - L.ruleGap;
  const listTop = ruleY - L.listGap;
  const bottomMargin = L.margin;
  const firstBaseline = listTop - L.capHeight * L.listFontSize;
  const rowPitch = Math.min(L.maxRowPitch, (listTop - bottomMargin) / L.listRows);
  const listBottom = firstBaseline - rowPitch * (L.listRows - 1);
  const columnWidth = contentWidth / 2 - L.columnClearance;
  return {
    contentWidth,
    cell,
    gridLeft: L.margin,
    gridTop,
    gridBottom,
    ruleY,
    listTop,
    firstBaseline,
    rowPitch,
    listBottom,
    bottomMargin,
    columnX: [L.margin, L.margin + contentWidth / 2],
    columnWidth,
  };
}

/**
 * Largest font size <= `nominal` at which `box + gap + widest word` fits in `available`.
 * Pure given a width function, so it is testable without a PDF.
 */
export function fitFontSize(
  widthOf: (text: string, size: number) => number,
  words: readonly string[],
  available: number,
  nominal: number = LAYOUT.listFontSize,
): number {
  const widest = words.reduce((best, w) => (widthOf(w, 1) > widthOf(best, 1) ? w : best), '');
  const perPoint = LAYOUT.checkboxSize + LAYOUT.checkboxGap + widthOf(widest, 1);
  if (perPoint <= 0) return nominal;
  const fit = available / perPoint;
  return Math.max(Math.min(nominal, fit), LAYOUT.minListFontSize);
}

function drawPuzzle(page: PDFPage, puzzle: Puzzle, font: PDFFont): void {
  const L = LAYOUT;
  const g = computeLayout();
  const black = rgb(0, 0, 0);

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const ch = puzzle.grid[r]?.[c] ?? '';
      const w = font.widthOfTextAtSize(ch, L.gridFontSize);
      const cx = g.gridLeft + (c + 0.5) * g.cell;
      const cy = g.gridTop - (r + 0.5) * g.cell;
      page.drawText(ch, {
        x: cx - w / 2,
        y: cy - L.gridBaselineOffset * L.gridFontSize,
        size: L.gridFontSize,
        font,
        color: black,
      });
    }
  }

  page.drawLine({
    start: { x: L.margin, y: g.ruleY },
    end: { x: L.margin + g.contentWidth, y: g.ruleY },
    thickness: L.ruleThickness,
    color: black,
  });

  const widthOf = (t: string, s: number) => font.widthOfTextAtSize(t, s);
  const perCol = L.listRows;
  for (let col = 0; col < 2; col++) {
    const words = puzzle.words.slice(col * perCol, (col + 1) * perCol);
    const size = fitFontSize(widthOf, words, g.columnWidth);
    const box = L.checkboxSize * size;
    const x0 = g.columnX[col] ?? L.margin;
    words.forEach((word, i) => {
      const baseline = g.firstBaseline - i * g.rowPitch;
      // Words are capitals, so centre the box on the cap height rather than the x-height.
      const midY = baseline + (L.capHeight * size) / 2;
      page.drawRectangle({
        x: x0 + L.checkboxStroke / 2,
        y: midY - box / 2,
        width: box,
        height: box,
        borderColor: black,
        borderWidth: L.checkboxStroke,
      });
      page.drawText(word, {
        x: x0 + box + L.checkboxGap * size,
        y: baseline,
        size,
        font,
        color: black,
      });
    });
  }
}

export async function renderPdf(puzzles: readonly Puzzle[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle('Word Search');
  doc.setCreator('Dadima Word Search Generator');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const puzzle of puzzles) {
    const page = doc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
    drawPuzzle(page, puzzle, font);
  }
  return doc.save();
}
