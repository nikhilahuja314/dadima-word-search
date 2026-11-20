import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { generateMandala } from '../src/activities/mandala/generate';
import { fixtureDrawing } from '../src/activities/mandala/render/fixtures';
import { renderPdf } from '../src/activities/mandala/render/pdf';
import { drawingSvgBody, drawingToSvg } from '../src/activities/mandala/render/svg';
import { NUMBERS, type Drawing } from '../src/activities/mandala/types';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function parseSeeds(spec: string): number[] {
  const m = /^(\d+)(?:-(\d+))?$/.exec(spec);
  if (!m) throw new Error(`bad --seeds "${spec}" (use N or A-B)`);
  const a = Number(m[1]);
  const b = Number(m[2] ?? m[1]);
  return Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
}

/** The one place that decides where drawings come from. */
function drawingFor(seed: number, useFixture: boolean): Drawing {
  if (useFixture) return fixtureDrawing(seed % 2 === 0 ? 12 : 8);
  return generateMandala(seed).drawing;
}

function png(svg: string, dpi: number): Uint8Array {
  return new Resvg(svg, { dpi, font: { loadSystemFonts: true } }).render().asPng();
}

const useFixture = process.argv.includes('--fixture');
const seeds = parseSeeds(arg('seeds') ?? '1-24');
const out = arg('out') ?? 'docs/mandala/samples';
mkdirSync(out, { recursive: true });
const drawings = seeds.map((s) => drawingFor(s, useFixture));

// Contact sheet: 6 columns of 180 px tiles at 96 dpi, labelled with the seed.
const TILE = 180;
const LABEL = 16;
const COLS = 6;
const rows = Math.ceil(seeds.length / COLS);
const side = 2 * NUMBERS.R + 4;
const tiles = seeds.map((seed, i) => {
  const x = (i % COLS) * TILE;
  const y = Math.floor(i / COLS) * (TILE + LABEL);
  const d = drawings[i] as Drawing;
  return (
    `<svg x="${x}" y="${y + LABEL}" width="${TILE}" height="${TILE}" viewBox="${-side / 2} ${-side / 2} ${side} ${side}">${drawingSvgBody(d)}</svg>` +
    `<text x="${x + 4}" y="${y + 12}" font-family="sans-serif" font-size="12" fill="#444">seed ${seed}</text>`
  );
});
const sheet =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${COLS * TILE}" height="${rows * (TILE + LABEL)}">` +
  `<rect width="100%" height="100%" fill="#fff"/>${tiles.join('')}</svg>`;
writeFileSync(join(out, 'contact.png'), png(sheet, 96));

seeds.slice(0, 4).forEach((seed, i) => {
  const svg = drawingToSvg(drawings[i] as Drawing, { withPage: true });
  writeFileSync(join(out, `seed-${seed}.png`), png(svg, 150));
});

const pdf = await renderPdf(drawings);
writeFileSync(join(out, 'sample.pdf'), pdf);
console.log(`Wrote ${out}/contact.png, seed-*.png and sample.pdf (${seeds.length} pages)`);
