import './style.css';
import type { Activity } from '../types';
import { generatePuzzles } from './generate';
import { renderPdf } from './pdf/render';
import { renderPreview } from './preview';
import { MAX_PUZZLES } from './types';

const ICON = `<svg viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5">
  <rect x="5" y="5" width="38" height="38" rx="3"/>
  <path d="M5 17.7h38M5 30.3h38M17.7 5v38M30.3 5v38"/>
  <rect x="7.5" y="20" width="33" height="8.5" rx="4.25" stroke-width="3"/>
</svg>`;

export const wordSearch: Activity = {
  id: 'word-search',
  title: 'Word search',
  tagline: 'Find the hidden words in a grid of letters.',
  intro: 'Choose how many puzzles, press the button, then print the PDF.',
  icon: ICON,
  noun: { one: 'puzzle', many: 'puzzles' },
  defaultCount: 10,
  maxCount: MAX_PUZZLES,
  async make(count) {
    const puzzles = generatePuzzles({ count });
    const pdf = await renderPdf(puzzles);
    const first = puzzles[0]!;
    return {
      pdf,
      previewTitle: 'Here is the first puzzle',
      renderPreview: (container) => renderPreview(first, container),
    };
  },
};
