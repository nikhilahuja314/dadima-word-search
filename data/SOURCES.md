# Word bank sources

## Raw frequency list: `data/raw/wordfreq-en-top20000.txt`

- **Source:** `wordfreq` by Robyn Speer, https://github.com/rspeer/wordfreq (PyPI: `wordfreq`).
- **Version used:** 3.1.1
- **Retrieved:** 2026-11-20
- **Generated with:**
  ```
  pip install --break-system-packages wordfreq==3.1.1
  python3 -I -c "import wordfreq; l = wordfreq.top_n_list('en', 20000); open('data/raw/wordfreq-en-top20000.txt', 'w').write('\n'.join(l) + '\n')"
  ```
  One lowercase word per line, in descending frequency order (20,000 lines).
- **Licence:** The data is under Creative Commons Attribution-ShareAlike 4.0. Quoted from the
  `License` section of the installed package's README (METADATA):
  > `wordfreq` is freely redistributable under the Apache license (see `LICENSE.txt`), and it
  > includes data files that may be redistributed under a Creative Commons Attribution-ShareAlike 4.0
  > license (<https://creativecommons.org/licenses/by-sa/4.0/>).
- **Attribution:** Word-frequency data from `wordfreq` (Robyn Speer, https://github.com/rspeer/wordfreq),
  which combines Google Books Ngrams, Wikipedia, OpenSubtitles, SUBTLEX, the Leeds Internet Corpus,
  ParaCrawl and others, used under CC BY-SA 4.0. The derived `src/words/words.json` is a filtered
  subset of that list and is shared under the same licence.

## Not used

`google-10000-english` was evaluated and rejected: its LICENSE.md permits only "educational and
personal/research use" and recommends against commercial use without an LDC licence, which is not a
clear grant to redistribute.

## Derived files

Built by `pnpm build:words` (`scripts/build-words.ts`) from the raw list plus `data/stopwords.txt`,
`data/exclude.txt` and `data/blocklist.txt`:

- `src/words/words.json`: the word bank.
- `src/grid/blocklist.json`: the blocklist (3+ letters) used by the filler check.
