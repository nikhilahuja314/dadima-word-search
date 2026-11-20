/* oxlint-disable unicorn/no-thenable -- `then` is the name of a field in the Fill contract (types.ts) */
// Dev-only: renders every M1 fill template in a lotus and a round petal at three sizes to
// docs/mandala/m2-fills.png (rows = templates, columns = shape x depth).
import { writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { renderFill } from '../../src/activities/mandala/fill/fills';
import { toSvgD } from '../../src/activities/mandala/geom/path';
import { petalPath } from '../../src/activities/mandala/geom/shapes';
import type { Fill, PetalShape, PetalSpec } from '../../src/activities/mandala/types';

const inset = (gap: number, then: Fill): Fill => ({ type: 'inset', gap, then });
const none: Fill = { type: 'none' };
const TEMPLATES: { name: string; fill: Fill }[] = [
  {
    name: 'A1',
    fill: inset(2.2, {
      type: 'split',
      at: 0.55,
      lower: { type: 'fan', n: 9 },
      upper: { type: 'innerTeardrop', scale: 0.45, then: inset(1.8, none) },
    }),
  },
  { name: 'A2', fill: inset(2.2, inset(2.0, { type: 'comb', n: 12, depth: 0.35 })) },
  {
    name: 'A3',
    fill: inset(2.2, {
      type: 'split',
      at: 0.6,
      lower: { type: 'comb', n: 12, depth: 0.35 },
      upper: { type: 'beadArc', n: 7 },
    }),
  },
  { name: 'B1', fill: inset(2.0, { type: 'fan', n: 9 }) },
  { name: 'B2', fill: inset(2.0, { type: 'innerTeardrop', scale: 0.5, then: none }) },
  { name: 'B3', fill: { type: 'scallopArc', n: 4 } },
  { name: 'C1', fill: inset(1.8, none) },
];
const SHAPES: { shape: PetalShape; bellyAt: number; bellyScale: number }[] = [
  { shape: 'lotus', bellyAt: 0.45, bellyScale: 1.25 },
  { shape: 'round', bellyAt: 0.6, bellyScale: 1.15 },
];
const DEPTHS = [12, 20, 30];
const FOLD = 12;
const RBASE = 40;
const CELL_W = 48;
const CELL_H = 46;
const DPI = 150;

const parts: string[] = [];
const cols = SHAPES.length * DEPTHS.length;
TEMPLATES.forEach((t, row) => {
  let col = 0;
  for (const sh of SHAPES) {
    for (const depth of DEPTHS) {
      const spec: PetalSpec = {
        shape: sh.shape,
        angle: Math.PI / 2,
        rBase: RBASE,
        rTip: RBASE + depth,
        halfWidth: Math.PI / FOLD,
        bellyAt: sh.bellyAt,
        bellyScale: sh.bellyScale,
      };
      const dx = CELL_W * (col + 0.5);
      const dy = CELL_H * (row + 1) - 3 + RBASE;
      const place = (p: ReturnType<typeof petalPath>) =>
        toSvgD(
          {
            ...p,
            start: { x: p.start.x + dx, y: p.start.y },
            segs: p.segs.map((s) =>
              s.kind === 'L'
                ? { kind: 'L' as const, to: { x: s.to.x + dx, y: s.to.y } }
                : {
                    kind: 'C' as const,
                    c1: { x: s.c1.x + dx, y: s.c1.y },
                    c2: { x: s.c2.x + dx, y: s.c2.y },
                    to: { x: s.to.x + dx, y: s.to.y },
                  },
            ),
          },
          true,
        );
      const g = [`<g transform="translate(0 ${dy})">`];
      g.push(
        `<path d="${place(petalPath(spec))}" fill="none" stroke="#000" stroke-width="0.529" stroke-linejoin="round"/>`,
      );
      const d = renderFill({ kind: 'petal', spec }, t.fill);
      for (const s of d.strokes) {
        g.push(
          `<path d="${place(s.path)}" fill="none" stroke="#000" stroke-width="0.353" stroke-linecap="round" stroke-linejoin="round"/>`,
        );
      }
      g.push('</g>');
      parts.push(g.join(''));
      col++;
    }
  }
  parts.push(`<text x="1" y="${CELL_H * row + 5}" font-size="4" fill="#c33">${t.name}</text>`);
});
const W = CELL_W * cols;
const H = CELL_H * TEMPLATES.length;
const grid: string[] = [];
for (let c = 1; c < cols; c++)
  grid.push(
    `<line x1="${c * CELL_W}" y1="0" x2="${c * CELL_W}" y2="${H}" stroke="#ccc" stroke-width="0.2"/>`,
  );
for (let r = 1; r < TEMPLATES.length; r++)
  grid.push(
    `<line x1="0" y1="${r * CELL_H}" x2="${W}" y2="${r * CELL_H}" stroke="#ccc" stroke-width="0.2"/>`,
  );
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>${grid.join('')}${parts.join('')}</svg>`;
const png = new Resvg(svg, { fitTo: { mode: 'zoom', value: DPI / 25.4 } }).render().asPng();
writeFileSync('docs/mandala/m2-fills.png', png);
console.log(`wrote docs/mandala/m2-fills.png (${png.length} bytes)`);
