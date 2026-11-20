# Dadima Word Search Generator — Spec

Status: v1 — all open questions resolved (2026-11-20)

## 1. Purpose

Generate printable word search puzzles for Dadima, matching the style and difficulty
of the puzzle book she already solves (samples: Puzzles #36, #37, #74, #75).
She solves on paper with a pencil — circling words in the grid and ticking them off the list.

## 2. Users

| Role | Who | Needs |
|---|---|---|
| Solver | Dadima | Large, clear, uncluttered printed puzzles she can do with a pencil |
| Operator | A family member at her home | Open a link, click once, get a PDF, print. No install, no setup, no jargon |
| Maintainer | Nikhil | Small, dependency-light codebase; free static hosting |

## 3. Decisions (settled)

| # | Decision | Choice |
|---|---|---|
| D1 | Medium | Printed on paper only. No interactive play mode |
| D2 | Operator | Family member at her home, so the UI is simple but doesn't need to be idiot-proof |
| D3 | Word source | Built-in word bank only. No custom/themed lists, English only |
| D4 | Difficulty | Matches the book exactly: fixed, no levels |
| D5 | Tool form | Static web page |
| D6 | Output | User picks a count (1..N); one PDF per click |
| D7 | Paper | A4 portrait, one puzzle per page |
| D8 | Word filtering | Common, familiar words only, so nothing obscure like HALCYON |
| D9 | No repeats | No word appears twice within one batch/PDF. No cross-batch memory |
| D10 | Printing | Downloadable PDF generated client-side |
| D11 | Stack | TypeScript static site, client-side PDF, hosted on GitHub Pages / Netlify. No server |
| D12 | Numbering | No puzzle numbers |
| D13 | Answer key | None |
| D14 | Multi-word entries | Banned. Single words only |
| D15 | Word bank source | Seeded from a common-English-words frequency list, then filtered (§6) |
| D16 | Letter size | As large as A4 allows; bigger is better |
| D17 | Printing | Printed at home from the downloaded PDF |
| D18 | Hosting | GitHub Pages (Vercel is an acceptable alternative; no server-side needs either way) |

## 4. Puzzle format (derived from samples)

- **Grid:** 12 × 12, uppercase A–Z.
- **Words per puzzle:** 12.
- **Directions allowed:** 3, no reversed words:
  - Horizontal, left → right
  - Vertical, top → bottom
  - Diagonal, top-left → bottom-right
- **Word length:** 4–12 letters (must fit the grid).
- **Overlaps:** Words may cross where letters match (the samples show some sharing), but
  no word may be entirely contained inside another placed word.
- **Filler:** Uniform random A–Z (the samples include Q, X, Z freely).
- **Word list:** Alphabetical, split into two columns (6 + 6), each word preceded by an
  empty checkbox ☐.

### Grid validity rules
1. Every listed word appears **exactly once** in the grid across the 3 allowed directions
   (filler must not accidentally create a second occurrence).
2. Filler must not accidentally spell an offensive word in any of the 3 directions
   (checked against a small blocklist; regenerate filler if hit).
3. If placement fails after K attempts, restart with a fresh word selection.

## 5. Page layout (A4 portrait)

Top to bottom:
1. Grid: as large as possible. The grid spans the full printable width (A4 at ~15mm margins
   gives ~180mm, so ~15mm per cell) and letters are sized to ~60–65% of the cell height
   (≈ 28–30pt). Generous spacing so pencil circles don't collide. The grid takes roughly the top ~65% of the page.
2. Horizontal rule.
3. Word list: two columns, ☐ checkbox + word, as large as the remaining space allows (target ≥ 20pt).

No header, title, numbering, or decoration. High contrast, black on white, printer-friendly.

## 6. Word bank

**Source:** start from a public, permissively licensed English word-frequency list
(e.g. the top ~10k most common words), then filter at build time into a bundled `words.json`.

**Automated filters (build script, checked into the repo):**
- A–Z only; no spaces, hyphens, apostrophes, or digits.
- Length 4–12 (3-letter words are dropped as they're too trivial and too likely to appear by accident in filler).
- Drop proper nouns, abbreviations, and function words (THE, WHICH, ABOUT, …), using a stopword list.
- Drop words on a profanity/sensitive-word blocklist (the same list is used for the filler check, §4).
- Collapse inflections so the bank keeps one form per lemma (keep WALK, drop WALKS/WALKED)
  to avoid near-duplicates in a puzzle.

**Light manual pass:** skim the output once and add anything odd to a checked-in `exclude.txt`.
Expected to be minutes, not hours; the frequency cutoff already removes obscure words like HALCYON.

**Size target:** ≥ 1,500 words after filtering (a 50-puzzle batch needs 600 unique words).

**Within-puzzle rule:** no two words in one puzzle where one contains the other (e.g. HEART and HEARTH).

## 7. UI (single page)

- One number input: **"How many puzzles?"** (default 10, min 1, max 50).
- One big button: **"Make puzzles"**, which downloads `word-search-YYYY-MM-DD.pdf`.
- Optional small preview of the first page.
- No accounts, no settings, no storage.
- Works in a current Chrome/Safari/Edge on a laptop.

## 8. Non-functional

- Fully client-side; works offline once loaded.
- Generating 50 puzzles in < 5s on an ordinary laptop.
- Deterministic generation from a seed (for testing and reproducing bugs); seed not shown in the UI.
- Unit tests for: placement directions, exactly-once occurrence, no repeats within a batch,
  blocklist check, layout fits on A4.

## 9. Out of scope (v1)

Interactive/on-screen play, answer keys, themes, custom words, Hindi/Devanagari,
difficulty levels, puzzle numbering, cross-batch memory, accounts.

## 10. Open questions

None. Next step: implementation plan.
