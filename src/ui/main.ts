import { MAX_PUZZLES } from '../core/types';
import type { Puzzle } from '../core/types';
import { generatePuzzles } from '../generate';
import { renderPdf } from '../pdf/render';

const MIN_COUNT = 1;
const DEFAULT_COUNT = 10;
const URL_REVOKE_DELAY_MS = 60_000;

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

const countInput = byId<HTMLInputElement>('count');
const minusBtn = byId<HTMLButtonElement>('minus');
const plusBtn = byId<HTMLButtonElement>('plus');
const makeBtn = byId<HTMLButtonElement>('make');
const statusEl = byId<HTMLElement>('status');
const previewEl = byId<HTMLElement>('preview');
const gridEl = byId<HTMLElement>('grid');
const wordsEl = byId<HTMLElement>('words');

function clamp(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_COUNT;
  return Math.min(MAX_PUZZLES, Math.max(MIN_COUNT, Math.round(value)));
}

function readCount(): number {
  return clamp(Number.parseInt(countInput.value, 10));
}

function setStatus(message: string, isError = false): void {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD in the user's local time zone (toISOString would use UTC). */
function localDateStamp(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    // setTimeout fallback: rAF is paused in background tabs.
    const timer = setTimeout(resolve, 100);
    requestAnimationFrame(() => {
      clearTimeout(timer);
      setTimeout(resolve, 0);
    });
  });
}

function showPreview(puzzle: Puzzle): void {
  gridEl.replaceChildren(
    ...puzzle.grid.flat().map((letter) => {
      const cell = document.createElement('span');
      cell.textContent = letter;
      return cell;
    }),
  );
  wordsEl.replaceChildren(
    ...puzzle.words.map((word) => {
      const item = document.createElement('li');
      item.textContent = word;
      return item;
    }),
  );
  previewEl.hidden = false;
}

function download(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
}

async function onMake(): Promise<void> {
  const count = readCount();
  countInput.value = String(count);

  // Must open synchronously inside the click handler or popup blockers refuse it.
  const tab = window.open('', '_blank');
  makeBtn.disabled = true;
  setStatus('Making puzzles…');

  let url: string | null = null;
  try {
    await nextFrame();
    const puzzles = generatePuzzles({ count });
    const pdf = await renderPdf(puzzles);
    url = URL.createObjectURL(new Blob([pdf as BlobPart], { type: 'application/pdf' }));
    showPreview(puzzles[0]!);
    download(url, `word-search-${localDateStamp()}.pdf`);
    if (tab) tab.location.href = url;
    setStatus(
      tab
        ? 'Done! Your PDF has been saved and opened in a new tab, ready to print.'
        : 'Done! Your PDF has been saved. Open it from your Downloads to print.',
    );
    const toRevoke = url;
    setTimeout(() => URL.revokeObjectURL(toRevoke), URL_REVOKE_DELAY_MS);
  } catch (err) {
    console.error(err);
    tab?.close();
    if (url) URL.revokeObjectURL(url);
    setStatus('Something went wrong — please press the button again.', true);
  } finally {
    makeBtn.disabled = false;
  }
}

function step(delta: number): void {
  countInput.value = String(clamp(readCount() + delta));
}

countInput.addEventListener('blur', () => {
  countInput.value = String(readCount());
});
minusBtn.addEventListener('click', () => step(-1));
plusBtn.addEventListener('click', () => step(1));
makeBtn.addEventListener('click', () => void onMake());
