import './style.css';
import type { Activity } from '../types';
import { generateBatch } from './generate';
import { renderPreview } from './preview';
import { renderPdf } from './render/pdf';

const ICON = `<svg viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round">
  <g id="md-icon-petal"><path d="M24 17C20.5 12 20.5 7 24 3C27.5 7 27.5 12 24 17Z"/></g>
  <use href="#md-icon-petal" transform="rotate(45 24 24)"/>
  <use href="#md-icon-petal" transform="rotate(90 24 24)"/>
  <use href="#md-icon-petal" transform="rotate(135 24 24)"/>
  <use href="#md-icon-petal" transform="rotate(180 24 24)"/>
  <use href="#md-icon-petal" transform="rotate(225 24 24)"/>
  <use href="#md-icon-petal" transform="rotate(270 24 24)"/>
  <use href="#md-icon-petal" transform="rotate(315 24 24)"/>
  <circle cx="24" cy="24" r="4.5"/>
</svg>`;

export const mandala: Activity = {
  id: 'mandala',
  title: 'Colouring mandalas',
  tagline: 'Patterns to colour in with pencils.',
  intro: 'Choose how many pages, press the button, then print the PDF.',
  icon: ICON,
  noun: { one: 'page', many: 'pages' },
  defaultCount: 10,
  maxCount: 50,
  async make(count) {
    const drawings = generateBatch(count, Date.now() >>> 0).map((g) => g.drawing);
    const pdf = await renderPdf(drawings);
    const first = drawings[0]!;
    return {
      pdf,
      previewTitle: 'Here is the first page',
      renderPreview: (container) => renderPreview(first, container),
    };
  },
};
