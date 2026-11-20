/**
 * Word bank build pipeline (PLAN.md S2). Run with `pnpm build:words`.
 * Reads only committed files under data/, so output is deterministic and needs no network.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_WORD_LEN, MIN_WORD_LEN } from '../src/core/types.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW_FILE = 'data/raw/wordfreq-en-top20000.txt';

/** Only source words ranked within the first CUTOFF lines are considered (tuned for ~1,500-3,000). */
export const CUTOFF = 8300;

/**
 * Words that look inflected but are distinct everyday words; never dropped by lemma collapse,
 * even when their apparent stem is also in the list.
 */
const NO_COLLAPSE = new Set([
  // -ING words that are nouns in their own right
  'BUILDING',
  'CLOTHING',
  'EVENING',
  'MORNING',
  'WEDDING',
  'PAINTING',
  'MEETING',
  'FEELING',
  'MEANING',
  'CEILING',
  'SAVINGS',
  'WRITING',
  'READING',
  'PARKING',
  'SHOPPING',
  'LIGHTING',
  'SPRING',
  'STRING',
  'DRESSING',
  'FILLING',
  'ENGINEERING',
  'HOUSING',
  'EARNINGS',
  'FINDINGS',
  // -ER words whose stem is a different word (FLOWER/FLOW, BROTHER/BROTH, ...)
  'BROTHER',
  'SISTER',
  'MOTHER',
  'FATHER',
  'FLOWER',
  'WATER',
  'PAPER',
  'WINTER',
  'SUMMER',
  'DINNER',
  'LETTER',
  'CORNER',
  'COVER',
  'MASTER',
  'POWER',
  'TOWER',
  'LOWER',
  'NUMBER',
  'DRAWER',
  'FARMER',
  'BUTTER',
  'COPPER',
  'LADDER',
  'FINGER',
  'SHOULDER',
  'CHAPTER',
  'WONDER',
  'THUNDER',
  'LEADER',
  'FEATHER',
  'WEATHER',
  'GATHER',
  'BETTER',
  'SINGER',
  'DAUGHTER',
  'LAUGHTER',
  'OFFICER',
  'SILVER',
  'RIVER',
  'CUSTOMER',
  'COUNTER',
  'ENGINEER',
  'PRISONER',
  'BARRIER',
  'STRANGER',
  'TREASURER',
  'TRAILER',
  'BROKER',
  'CHARTER',
  'RANGER',
  'STRIKER',
  'FOUNDER',
  'CONSUMER',
  'COMMANDER',
  'MANAGER',
  'PRINTER',
  'PAINTER',
  'REMINDER',
  // -LY words that are not simple adverbs of the stem
  'FRIENDLY',
  'MONTHLY',
  'ELDERLY',
  'QUARTERLY',
  'FAMILY',
  'EARLY',
  'LOVELY',
  'LONELY',
  'SPECIALLY',
  'FRANKLY',
  'LIVELY',
  'UGLY',
  'SILLY',
  'HOLIDAY',
  // plurals that are the usual word
  'CLOTHES',
  'GLASSES',
  'SCISSORS',
  'GOODS',
  'PANTS',
  'SHORTS',
]);

/** Irregular forms mapped to their base (base may be short, in which case the form is just dropped). */
const IRREGULAR: Record<string, string> = {
  BROUGHT: 'BRING',
  BOUGHT: 'BUY',
  TAUGHT: 'TEACH',
  THOUGHT: 'THINK',
  CAUGHT: 'CATCH',
  FOUGHT: 'FIGHT',
  SOUGHT: 'SEEK',
  STOLE: 'STEAL',
  STOLEN: 'STEAL',
  BROKE: 'BREAK',
  BROKEN: 'BREAK',
  CHOSE: 'CHOOSE',
  CHOSEN: 'CHOOSE',
  FORGOT: 'FORGET',
  FORGOTTEN: 'FORGET',
  GOTTEN: 'GET',
  BEGAN: 'BEGIN',
  BEGUN: 'BEGIN',
  DROVE: 'DRIVE',
  DRIVEN: 'DRIVE',
  EATEN: 'EAT',
  FALLEN: 'FALL',
  FELL: 'FALL',
  WROTE: 'WRITE',
  WRITTEN: 'WRITE',
  SPOKE: 'SPEAK',
  SPOKEN: 'SPEAK',
  KNEW: 'KNOW',
  KNOWN: 'KNOW',
  GROWN: 'GROW',
  GREW: 'GROW',
  THREW: 'THROW',
  THROWN: 'THROW',
  BLEW: 'BLOW',
  BLOWN: 'BLOW',
  DRAWN: 'DRAW',
  DREW: 'DRAW',
  WORN: 'WEAR',
  WORE: 'WEAR',
  FLEW: 'FLY',
  HIDDEN: 'HIDE',
  SHOWN: 'SHOW',
  TAKEN: 'TAKE',
  TOOK: 'TAKE',
  GIVEN: 'GIVE',
  GAVE: 'GIVE',
  SLEPT: 'SLEEP',
  SPENT: 'SPEND',
  SENT: 'SEND',
  BUILT: 'BUILD',
  HELD: 'HOLD',
  KEPT: 'KEEP',
  FELT: 'FEEL',
  MEANT: 'MEAN',
  TOLD: 'TELL',
  SOLD: 'SELL',
  STOOD: 'STAND',
  UNDERSTOOD: 'UNDERSTAND',
  MADE: 'MAKE',
  CAME: 'COME',
  BECAME: 'BECOME',
  PAID: 'PAY',
  HEARD: 'HEAR',
  DEALT: 'DEAL',
  LAID: 'LAY',
  RODE: 'RIDE',
  RIDDEN: 'RIDE',
  SHOOK: 'SHAKE',
  SHAKEN: 'SHAKE',
  RISEN: 'RISE',
  SUNG: 'SING',
  SANG: 'SING',
  SWUNG: 'SWING',
  SWORE: 'SWEAR',
  TORE: 'TEAR',
  TORN: 'TEAR',
  WOKE: 'WAKE',
  WOKEN: 'WAKE',
  STRUCK: 'STRIKE',
  STUCK: 'STICK',
  SPUN: 'SPIN',
  LEARNT: 'LEARN',
  BURNT: 'BURN',
  WORSE: 'BAD',
  WORST: 'BAD',
  GOES: 'GO',
  WENT: 'GO',
  GONE: 'GO',
  DOES: 'DO',
  SEEN: 'SEE',
  EATING: 'EAT',
  DYING: 'DIE',
  LYING: 'LIE',
  TYING: 'TIE',
  DIED: 'DIE',
  DIES: 'DIE',
};

function readLines(rel: string): string[] {
  return readFileSync(resolve(ROOT, rel), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*/, '').trim().toUpperCase())
    .filter((l) => l.length > 0);
}

const doubled = (s: string) => s.length > 1 && s[s.length - 1] === s[s.length - 2];

const undouble = (s: string) => (doubled(s) ? s.slice(0, -1) : null);

/** Candidate stems for an inflected word. Callers check them against the kept set. */
export function stemsOf(w: string): string[] {
  const out: string[] = [];
  const n = w.length;
  const add = (s: string | null, minLen = 3) => {
    if (s !== null && s.length >= minLen) out.push(s);
  };
  // Plurals / 3rd-person -S: the stem must be a bank-length word, so DOGS and CATS survive
  // (DOG/CAT are too short for the bank) while HOUSES collapses into HOUSE.
  if (w.endsWith('IES')) add(w.slice(0, n - 3) + 'Y', MIN_WORD_LEN);
  if (w.endsWith('S') && !w.endsWith('SS')) add(w.slice(0, -1), MIN_WORD_LEN);
  if (w.endsWith('OES')) add(w.slice(0, -2), MIN_WORD_LEN); // POTATOES -> POTATO
  if (/(S|X|Z|CH|SH)ES$/.test(w)) add(w.slice(0, -2), MIN_WORD_LEN);
  // Verb forms: the stem may be a short word (ACTED -> ACT), which is dropped from the bank anyway.
  if (w.endsWith('IED')) add(w.slice(0, n - 3) + 'Y', MIN_WORD_LEN);
  if (w.endsWith('ED')) {
    add(w.slice(0, -2));
    add(w.slice(0, -1), MIN_WORD_LEN); // LIKED -> LIKE (the "-D" rule); not SEED -> SEE
    add(undouble(w.slice(0, -2))); // STOPPED -> STOP
  }
  if (w.endsWith('ING')) {
    const b = w.slice(0, -3);
    add(b);
    add(b + 'E'); // MAKING -> MAKE
    add(undouble(b)); // STOPPING -> STOP
  }
  // Comparative / agent / adverb forms: stricter (stem >= 5 letters) to avoid FLOWER->FLOW etc.
  if (w.endsWith('IER') || w.endsWith('IEST')) {
    add(w.slice(0, w.endsWith('IER') ? n - 3 : n - 4) + 'Y', 5);
  }
  if (w.endsWith('ER')) {
    add(w.slice(0, -2), 5);
    add(w.slice(0, -1), 5); // LARGER -> LARGE
    const u = undouble(w.slice(0, -2));
    if (u !== null) add(u, 5);
  }
  if (w.endsWith('EST')) {
    add(w.slice(0, -3), 5);
    add(w.slice(0, -2), 5);
    const u = undouble(w.slice(0, -3));
    if (u !== null) add(u, 5);
  }
  if (w.endsWith('ILY')) add(w.slice(0, n - 3) + 'Y', 5);
  if (w.endsWith('LY')) add(w.slice(0, -2), 5);
  return out;
}

export interface BuildResult {
  words: string[];
  blocklist: string[];
  stats: Array<[string, number]>;
  collapsed: Array<[string, string]>;
}

export function build(): BuildResult {
  const stats: Array<[string, number]> = [];
  const log = (stage: string, before: number, after: number) => stats.push([stage, before - after]);

  const stopwords = new Set(readLines('data/stopwords.txt'));
  const exclude = new Set(readLines('data/exclude.txt'));
  const blocklist = [...new Set(readLines('data/blocklist.txt'))].toSorted();
  const longBlock = blocklist.filter((b) => b.length >= 4);
  const blockSet = new Set(blocklist);

  const raw = readFileSync(resolve(ROOT, RAW_FILE), 'utf8').split(/\r?\n/);
  const sourceCount = raw.length;

  // 0. Frequency cutoff (by source rank).
  let words = raw.slice(0, CUTOFF);
  log(`cutoff (rank > ${CUTOFF})`, sourceCount, words.length);

  // 1. Uppercase, trim, dedupe (first occurrence wins).
  let before = words.length;
  words = [...new Set(words.map((w) => w.trim().toUpperCase()).filter((w) => w.length > 0))];
  log('uppercase/trim/dedupe', before, words.length);

  // 2. A-Z only.
  before = words.length;
  words = words.filter((w) => /^[A-Z]+$/.test(w));
  log('non A-Z', before, words.length);

  // 3. Length.
  before = words.length;
  words = words.filter((w) => w.length >= MIN_WORD_LEN && w.length <= MAX_WORD_LEN);
  log(`length outside ${MIN_WORD_LEN}-${MAX_WORD_LEN}`, before, words.length);

  // 4. Stopwords, blocklist, exclude.
  before = words.length;
  words = words.filter((w) => !stopwords.has(w));
  log('stopwords', before, words.length);
  before = words.length;
  words = words.filter((w) => !blockSet.has(w));
  log('blocklist (exact)', before, words.length);
  before = words.length;
  words = words.filter((w) => !exclude.has(w));
  log('exclude.txt', before, words.length);

  // 5. Blocklist substrings (entries >= 4 letters).
  before = words.length;
  words = words.filter((w) => !longBlock.some((b) => w.includes(b)));
  log('contains blocklist entry (>=4)', before, words.length);

  // 6. Lemma collapse against the whole raw list (not just survivors).
  //    Each inflected word is resolved to its root. If the root is a clean word (passes every
  //    filter above, whatever its rank) the root is emitted instead; otherwise the word is dropped.
  before = words.length;
  const rawAll = new Set(
    raw.map((w) => w.trim().toUpperCase()).filter((w) => /^[A-Z]{3,}$/.test(w)),
  );
  const isClean = (w: string) =>
    w.length >= MIN_WORD_LEN &&
    w.length <= MAX_WORD_LEN &&
    !stopwords.has(w) &&
    !blockSet.has(w) &&
    !exclude.has(w) &&
    !longBlock.some((b) => w.includes(b));
  const resolveRoot = (start: string): string => {
    let w = start;
    for (let i = 0; i < 5; i++) {
      if (NO_COLLAPSE.has(w)) break;
      const irregular = IRREGULAR[w];
      const stem = irregular ?? stemsOf(w).find((s) => rawAll.has(s) && s !== w);
      if (stem === undefined) break;
      w = stem;
    }
    return w;
  };
  const kept = new Set<string>();
  const collapsed: Array<[string, string]> = [];
  for (const w of words) {
    const root = resolveRoot(w);
    if (root === w) {
      kept.add(w);
      continue;
    }
    collapsed.push([w, isClean(root) ? root : `(dropped: ${root})`]);
    if (isClean(root)) kept.add(root);
  }
  words = [...kept];
  log('lemma collapse (net)', before, words.length);

  return { words: [...words].toSorted(), blocklist, stats, collapsed };
}

function main(): void {
  const { words, blocklist, stats } = build();
  for (const [stage, dropped] of stats) console.log(`${stage.padEnd(36)} -${dropped}`);
  writeFileSync(resolve(ROOT, 'src/words/words.json'), JSON.stringify(words, null, 2) + '\n');
  writeFileSync(
    resolve(ROOT, 'src/grid/blocklist.json'),
    JSON.stringify(blocklist, null, 2) + '\n',
  );
  console.log(`final word count: ${words.length}`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
