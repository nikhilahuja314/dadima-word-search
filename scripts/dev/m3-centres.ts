// Dev-only: renders every centre kind (rows) at k = 8 / 12 and r = 11 / 14 / 16 mm (columns), plus
// a strip of accent examples, to docs/mandala/m3-centres.png.
import { writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import {
  tipTeardrop,
  valleyDot,
  valleySmallPetal,
  type PetalTemplate,
} from '../../src/activities/mandala/accent/accents';
import { renderCentre } from '../../src/activities/mandala/centre/centre';
import { toSvgD, transform } from '../../src/activities/mandala/geom/path';
import { insetPetal, petalPath } from '../../src/activities/mandala/geom/shapes';
import type { CentreKind, Path, PetalSpec } from '../../src/activities/mandala/types';

const KINDS: CentreKind[] = ['rosette', 'sunburst', 'star'];
const COLS = [
  { k: 8, r: 11 },
  { k: 8, r: 14 },
  { k: 8, r: 16 },
  { k: 12, r: 11 },
  { k: 12, r: 14 },
  { k: 12, r: 16 },
];
const CELL = 40;
const DPI = 200;
const OUTLINE = 0.529;
const DETAIL = 0.353;

const parts: string[] = [];
const path = (p: Path, dx: number, dy: number, attrs: string) =>
  `<path d="${toSvgD(
    transform(p, (v) => ({ x: v.x + dx, y: v.y })),
    true,
  )}" transform="translate(0 ${dy})" ${attrs}/>`;

// The page rotates the maths frame by +pi/2 (angle 0 = up); do the same here.
const upright = (p: Path): Path => transform(p, (v) => ({ x: -v.y, y: v.x }));

KINDS.forEach((kind, row) => {
  COLS.forEach(({ k, r }, col) => {
    const fold = kind === 'star' ? k : col % 2 === 0 ? 2 * k : k;
    const d = renderCentre({ kind, r, fold });
    const dx = CELL * (col + 0.5);
    const dy = CELL * (row + 0.5);
    for (const s of d.strokes) {
      const w = s.role === 'outline' ? OUTLINE : DETAIL;
      parts.push(
        path(
          upright(s.path),
          dx,
          dy,
          `fill="none" stroke="#000" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`,
        ),
      );
    }
  });
});

// Accent strip: three layers of petals with accents, 80 x 80 mm each at half scale.
const TEMPLATES: { t: PetalTemplate; fold: number; what: string }[] = [
  { t: { shape: 'lotus', bellyAt: 0.45, bellyScale: 1.25 }, fold: 12, what: 'dots+tips' },
  { t: { shape: 'teardrop', bellyAt: 0.33, bellyScale: 1.3 }, fold: 8, what: 'small petals' },
  { t: { shape: 'round', bellyAt: 0.6, bellyScale: 1.15 }, fold: 12, what: 'dots' },
];
const stripY = CELL * KINDS.length;
const SCALE = 0.5;
TEMPLATES.forEach(({ t, fold, what }, i) => {
  const rBase = 30;
  const rTip = 56;
  const cx = 60 * i + 30;
  const g: string[] = [];
  const mk = (p: Path) => upright(p);
  const specs: PetalSpec[] = [];
  for (let n = 0; n < fold; n++) {
    specs.push({
      shape: t.shape,
      angle: (2 * Math.PI * n) / fold,
      rBase,
      rTip,
      halfWidth: Math.PI / fold,
      bellyAt: t.bellyAt,
      bellyScale: t.bellyScale,
    });
  }
  for (const s of specs) {
    g.push(
      path(mk(petalPath(s)), 0, 0, `fill="none" stroke="#000" stroke-width="${OUTLINE / SCALE}"`),
    );
    const inner = insetPetal(s, 2.2);
    if (inner)
      g.push(
        path(
          mk(petalPath(inner)),
          0,
          0,
          `fill="none" stroke="#000" stroke-width="${DETAIL / SCALE}"`,
        ),
      );
    if (what === 'dots+tips') {
      const td = tipTeardrop(s, 2.2);
      if (td) g.push(path(mk(td), 0, 0, 'fill="#000"'));
    }
  }
  const valley =
    what === 'small petals'
      ? valleySmallPetal(rBase, rTip, fold, 0, t)
      : valleyDot(rBase, rTip, fold, 0, t);
  for (const v of valley) {
    g.push(
      path(
        mk(v),
        0,
        0,
        what === 'small petals'
          ? `fill="none" stroke="#000" stroke-width="${DETAIL / SCALE}"`
          : 'fill="#000"',
      ),
    );
  }
  parts.push(
    `<g transform="translate(${cx + 30} ${stripY + 30}) scale(${SCALE})">${g.join('')}</g>`,
  );
});

const W = CELL * COLS.length;
const H = stripY + 62;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>${parts.join('')}</svg>`;
const png = new Resvg(svg, { fitTo: { mode: 'zoom', value: DPI / 25.4 } }).render().asPng();
writeFileSync('docs/mandala/m3-centres.png', png);
console.log(`wrote docs/mandala/m3-centres.png (${png.length} bytes)`);
