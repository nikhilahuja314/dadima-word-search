import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { mandala } from './index';

describe('mandala activity', () => {
  it('makes a 10-page PDF and an svg preview', { timeout: 60_000 }, async () => {
    const batch = await mandala.make(10);
    const doc = await PDFDocument.load(batch.pdf);
    expect(doc.getPageCount()).toBe(10);

    const shell = { innerHTML: '' };
    const container = {
      replaceChildren(node: { innerHTML: string }) {
        shell.innerHTML = node.innerHTML;
      },
    } as unknown as HTMLElement;
    const fakeDocument = {
      createElement: () => ({ innerHTML: '', className: '', setAttribute() {} }),
    };
    (globalThis as { document?: unknown }).document = fakeDocument;
    try {
      batch.renderPreview(container);
    } finally {
      delete (globalThis as { document?: unknown }).document;
    }
    expect(shell.innerHTML).toContain('<svg');
  });
});
