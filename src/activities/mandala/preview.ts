import { drawingToSvg } from './render/svg';
import type { Drawing } from './types';

/** On-screen preview of one mandala page: the drawing as inline SVG on white. */
export function renderPreview(drawing: Drawing, container: HTMLElement): void {
  const box = document.createElement('div');
  box.className = 'md-preview';
  box.setAttribute('role', 'img');
  box.setAttribute('aria-label', 'Preview of the first mandala page');
  box.innerHTML = drawingToSvg(drawing);
  container.replaceChildren(box);
}
