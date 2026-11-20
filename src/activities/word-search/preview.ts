import type { Puzzle } from './types';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** On-screen preview of one puzzle: the letter grid and the word list. */
export function renderPreview(puzzle: Puzzle, container: HTMLElement): void {
  const grid = el('div', 'ws-grid');
  grid.setAttribute('aria-hidden', 'true');
  grid.style.setProperty('--size', String(puzzle.grid.length));
  grid.append(...puzzle.grid.flat().map((letter) => el('span', undefined, letter)));

  const words = el('ul', 'ws-words');
  words.append(...puzzle.words.map((word) => el('li', undefined, word)));

  container.replaceChildren(grid, el('h3', undefined, 'Find these words'), words);
}
