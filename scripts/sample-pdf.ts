import { writeFileSync } from 'node:fs';
import { renderPdf } from '../src/activities/word-search/pdf/render';
import { fixturePuzzles } from '../src/activities/word-search/pdf/render.fixtures';

const bytes = await renderPdf(fixturePuzzles());
writeFileSync('sample.pdf', bytes);
console.log(`Wrote sample.pdf (${bytes.length} bytes, ${fixturePuzzles().length} pages)`);
