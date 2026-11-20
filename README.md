# Word Search Puzzles for Dadima

A small web page that makes printable word search puzzles as a PDF. Pick how many puzzles (1 to 50),
press **Make puzzles**, then print the PDF. Everything runs in the browser; there is no server.

Live site: https://YOUR-USERNAME.github.io/dadima-wordsearch-generator/ (placeholder, update after the first deploy)

## Local development

```sh
corepack enable
pnpm install
pnpm dev          # dev server
pnpm check        # typecheck + lint + format check + tests
pnpm build        # static site in dist/
pnpm preview      # serve dist/ locally
```

## Deploying

Pushing to `main` runs `.github/workflows/deploy.yml`, which checks, builds and publishes `dist/` to
GitHub Pages.

One-time manual step: in the GitHub repo go to **Settings → Pages** and set **Source** to
**GitHub Actions**.

## Regenerating the word bank

The word bank is built from a frequency list plus the filters in `data/` and the output is committed.
To rebuild it:

```sh
pnpm build:words
```

See `data/SOURCES.md` for the full provenance.

## Attribution

Word-frequency data from `wordfreq` (Robyn Speer, https://github.com/rspeer/wordfreq), which combines
Google Books Ngrams, Wikipedia, OpenSubtitles, SUBTLEX, the Leeds Internet Corpus, ParaCrawl and
others, used under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The derived
`src/words/words.json` is a filtered subset of that list and is shared under the same licence.
