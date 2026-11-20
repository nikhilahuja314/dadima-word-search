/**
 * The contract every printable activity (word search, mandalas, …) implements.
 *
 * The shell owns everything shared: the home screen, routing, the "how many" stepper, the make
 * button, status messages, downloading and opening the PDF. An activity only knows how to make a
 * batch of pages and how to show a preview of one of them.
 */
export interface Activity {
  /** URL slug, used as the route (`#/word-search`) and the PDF filename prefix. Kebab-case. */
  id: string;
  /** Shown on the home tile and as the activity page heading, e.g. "Word search". */
  title: string;
  /** One short sentence for the home tile. */
  tagline: string;
  /** One sentence of instructions under the heading on the activity page. */
  intro: string;
  /** Inline SVG markup for the home tile. Uses `currentColor` so it follows the theme. */
  icon: string;
  /** What one page is called, for labels like "How many puzzles?" and "Make puzzles". */
  noun: { one: string; many: string };
  defaultCount: number;
  maxCount: number;
  /** Generates `count` pages. Should throw on failure; the shell shows a friendly message. */
  make(count: number): Promise<ActivityBatch>;
}

export interface ActivityBatch {
  /** The finished, printable PDF. */
  pdf: Uint8Array;
  /** Heading above the preview, e.g. "Here is the first puzzle". */
  previewTitle: string;
  /** Draws a preview of (usually) the first page into `container`, replacing its contents. */
  renderPreview(container: HTMLElement): void;
}
