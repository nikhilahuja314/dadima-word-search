import { Resvg } from '@resvg/resvg-js';
import { describe, expect, it } from 'vitest';
import { fixtureDrawing, markerAtAngleZero } from './fixtures';
import { drawingToSvg } from './svg';
import { toPageSpace } from './space';

describe('toPageSpace', () => {
  it('sends angle 0 (+x) to the top of the page (+y, y up)', () => {
    const p = toPageSpace({ x: 10, y: 0 });
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.y).toBeCloseTo(10, 9);
  });
});

describe('drawingToSvg', () => {
  it('has exactly three paths, with round joins/caps and mm widths', () => {
    const svg = drawingToSvg(fixtureDrawing());
    expect(svg.match(/<path /g)).toHaveLength(3);
    expect(svg.match(/stroke-linejoin="round"/g)).toHaveLength(2);
    expect(svg.match(/stroke-linecap="round"/g)).toHaveLength(2);
    expect(svg).toContain('stroke-width="0.529"');
    expect(svg).toContain('stroke-width="0.353"');
    expect(svg).not.toContain('NaN');
  });

  it('matches the fixture snapshot', () => {
    expect(drawingToSvg(fixtureDrawing(8))).toMatchSnapshot();
    expect(drawingToSvg(fixtureDrawing(8), { withPage: true }).slice(0, 300)).toMatchSnapshot();
  });

  it('orientation: a marker at angle 0 rasterises at the top of the page', () => {
    const d = { strokes: [], fills: [markerAtAngleZero(80)] };
    const svg = drawingToSvg(d, { withPage: true });
    const img = new Resvg(svg, { fitTo: { mode: 'width', value: 210 } }).render();
    const { width, height, pixels } = img;
    expect(height).toBe(297);
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if ((pixels[(y * width + x) * 4] ?? 255) < 128) {
          sx += x;
          sy += y;
          n++;
        }
      }
    }
    expect(n).toBeGreaterThan(0);
    // Marker sits ~78 mm above the page centre (row 148.5), horizontally centred.
    expect(Math.abs(sx / n + 0.5 - 105)).toBeLessThan(0.75);
    expect(sy / n).toBeLessThan(148.5 - 70);
  });
});
