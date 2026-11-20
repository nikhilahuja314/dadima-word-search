# Activities for Dadima

A small web page that makes printable activities as a PDF. The home screen lists the activities
(currently word search); pick one, choose how many pages, press the big button, then print the PDF. Everything runs in the browser; there is no server.

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

## Layout

```
src/
  shell/          home screen, hash routing (#/word-search), shared "how many + make + download" page
  core/           activity-agnostic helpers: seeded RNG, A4 page size
  activities/
    types.ts      the Activity contract every activity implements
    registry.ts   list of activities shown on the home screen
    word-search/  everything word-search: words, grid, PDF renderer, preview, styles
```

## Adding an activity

1. Create `src/activities/<id>/index.ts` exporting an `Activity` (see `src/activities/types.ts`):
   id, title, tagline, intro, icon SVG, noun, counts, and `make(count)` returning the PDF bytes plus a
   `renderPreview(container)` function.
2. Keep its generator, PDF renderer, preview and `style.css` (class names prefixed) inside that folder.
3. Add it to `ACTIVITIES` in `src/activities/registry.ts`. The shell does the rest.

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
`src/activities/word-search/words/words.json` is a filtered subset of that list and is shared under the same licence.
