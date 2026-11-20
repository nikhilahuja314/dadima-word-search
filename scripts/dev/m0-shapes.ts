// Dev-only: renders one example of each petal shape (rows) at several bellyScale values (columns),
// with insets at 1.5 / 3 / 4.5 mm, to docs/mandala/m0-shapes.png.
import { writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { toSvgD, transform } from '../../src/activities/mandala/geom/path';
import { insetPetal, petalPath } from '../../src/activities/mandala/geom/shapes';
import type { PetalShape, PetalSpec } from '../../src/activities/mandala/types';

const SHAPES: PetalShape[] = ['lotus', 'teardrop', 'round', 'arch'];
const BELLY_AT: Record<PetalShape, number> = { lotus: 0.45, teardrop: 0.33, round: 0.6, arch: 0.5 };
const SCALES = [1.0, 1.2, 1.4];
const INSETS: { d: number; colour: string }[] = [
  { d: 1.5, colour: '#d33' },
  { d: 3, colour: '#27c' },
  { d: 4.5, colour: '#2a2' },
];
const CELL_W = 40;
const CELL_H = 52;
const DPI = 150;

const parts: string[] = [];
SHAPES.forEach((shape, row) => {
  SCALES.forEach((bellyScale, col) => {
    const spec: PetalSpec = {
      shape,
      angle: Math.PI / 2, // axis points up the page
      rBase: 20,
      rTip: 60,
      halfWidth: 0.4,
      bellyAt: BELLY_AT[shape],
      bellyScale,
    };
    // Move the base axis point (0, rBase) to the bottom-centre of the cell.
    const dx = CELL_W * (col + 0.5);
    // toSvgD flips y, so the base axis point lands at svg y = -rBase; translate it to the cell bottom.
    const dy = CELL_H * (row + 1) - 4 + spec.rBase;
    const place = (s: PetalSpec) =>
      toSvgD(
        transform(petalPath(s), (v) => ({ x: v.x + dx, y: v.y })),
        true,
      );
    const g: string[] = [`<g transform="translate(0 ${dy})">`];
    g.push(`<path d="${place(spec)}" fill="none" stroke="#000" stroke-width="0.529"/>`);
    for (const { d, colour } of INSETS) {
      const inner = insetPetal(spec, d);
      if (inner)
        g.push(`<path d="${place(inner)}" fill="none" stroke="${colour}" stroke-width="0.353"/>`);
    }
    g.push('</g>');
    parts.push(g.join(''));
  });
});

const W = CELL_W * SCALES.length;
const H = CELL_H * SHAPES.length;
// Grid lines between cells.
const grid: string[] = [];
for (let c = 1; c < SCALES.length; c++)
  grid.push(
    `<line x1="${c * CELL_W}" y1="0" x2="${c * CELL_W}" y2="${H}" stroke="#ccc" stroke-width="0.2"/>`,
  );
for (let r = 1; r < SHAPES.length; r++)
  grid.push(
    `<line x1="0" y1="${r * CELL_H}" x2="${W}" y2="${r * CELL_H}" stroke="#ccc" stroke-width="0.2"/>`,
  );

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>${grid.join('')}${parts.join('')}</svg>`;
const png = new Resvg(svg, { fitTo: { mode: 'zoom', value: DPI / 25.4 } }).render().asPng();
writeFileSync('docs/mandala/m0-shapes.png', png);
console.log(`wrote docs/mandala/m0-shapes.png (${png.length} bytes)`);
