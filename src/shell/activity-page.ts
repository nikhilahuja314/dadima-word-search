import type { Activity } from '../activities/types';
import { HOME_TITLE } from './home';
import { clampCount, download, h, localDateStamp, nextFrame } from './util';

const URL_REVOKE_DELAY_MS = 60_000;

/** The shared page every activity gets: back link, count stepper, make button, status, preview. */
export function renderActivityPage(root: HTMLElement, activity: Activity): void {
  const { noun, maxCount, defaultCount } = activity;
  document.title = `${activity.title} · ${HOME_TITLE}`;

  const countInput = h('input', {
    id: 'count',
    type: 'number',
    inputMode: 'numeric',
    min: '1',
    max: String(maxCount),
    value: String(defaultCount),
  });
  const minusBtn = h('button', { type: 'button', className: 'step' }, '−');
  minusBtn.setAttribute('aria-label', `One fewer ${noun.one}`);
  const plusBtn = h('button', { type: 'button', className: 'step' }, '+');
  plusBtn.setAttribute('aria-label', `One more ${noun.one}`);
  const makeBtn = h('button', { type: 'button', className: 'primary' }, `Make ${noun.many}`);
  const statusEl = h('p', { className: 'status', role: 'status' });
  statusEl.setAttribute('aria-live', 'polite');
  const previewTitle = h('h2');
  const previewBody = h('div');
  const previewEl = h('section', { className: 'preview', hidden: true }, previewTitle, previewBody);

  root.replaceChildren(
    h('a', { className: 'back', href: '#/' }, '← All activities'),
    h('h1', {}, activity.title),
    h('p', { className: 'intro' }, activity.intro),
    h(
      'div',
      { className: 'field' },
      h('label', { htmlFor: 'count' }, `How many ${noun.many}?`),
      h('div', { className: 'stepper' }, minusBtn, countInput, plusBtn),
    ),
    makeBtn,
    statusEl,
    previewEl,
  );

  const readCount = () => clampCount(Number.parseInt(countInput.value, 10), maxCount, defaultCount);
  const setStatus = (message: string, isError = false) => {
    statusEl.textContent = message;
    statusEl.classList.toggle('error', isError);
  };
  const step = (delta: number) => {
    countInput.value = String(clampCount(readCount() + delta, maxCount, defaultCount));
  };

  async function onMake(): Promise<void> {
    const count = readCount();
    countInput.value = String(count);

    // Must open synchronously inside the click handler or popup blockers refuse it.
    const tab = window.open('', '_blank');
    makeBtn.disabled = true;
    setStatus(`Making ${noun.many}…`);

    let url: string | null = null;
    try {
      await nextFrame();
      const batch = await activity.make(count);
      url = URL.createObjectURL(new Blob([batch.pdf as BlobPart], { type: 'application/pdf' }));
      previewTitle.textContent = batch.previewTitle;
      batch.renderPreview(previewBody);
      previewEl.hidden = false;
      download(url, `${activity.id}-${localDateStamp()}.pdf`);
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

  countInput.addEventListener('blur', () => {
    countInput.value = String(readCount());
  });
  minusBtn.addEventListener('click', () => step(-1));
  plusBtn.addEventListener('click', () => step(1));
  makeBtn.addEventListener('click', () => void onMake());
}
