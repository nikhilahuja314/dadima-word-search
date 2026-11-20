import { WORDS_PER_PUZZLE } from '../types';
import type { Rng } from '../types';
import { shuffle } from '../../../core/rng';

export interface WordPool {
  /** Draw a valid set of WORDS_PER_PUZZLE words, never returning a word used earlier in this pool. */
  drawSet(rng: Rng): string[];
  /** Return words from a failed puzzle attempt so they can be redrawn. */
  release(words: readonly string[]): void;
  remaining(): number;
}

/** Rule 3: at most this many words of length >= LONG_LEN. */
const MAX_LONG_WORDS = 3;
const LONG_LEN = 9;
/** Rule 3: at least this many words of length <= SHORT_LEN. */
const MIN_SHORT_WORDS = 4;
const SHORT_LEN = 6;
/** Rule 4: total letters in a set. */
const MAX_TOTAL_LETTERS = 90;
/** Shortest possible word, used to bound the letters still needed by empty slots. */
const MIN_LEN = 4;
const MAX_TRIES = 50;

export function wordsNeeded(puzzleCount: number): number {
  return puzzleCount * WORDS_PER_PUZZLE;
}

/**
 * Greedily builds one set from a pre-shuffled candidate list. Each word is accepted only if
 * rules 2-4 stay satisfiable for the remaining slots. Returns null if the pass falls short.
 */
function greedyPass(candidates: readonly string[]): string[] | null {
  const chosen: string[] = [];
  let letters = 0;
  let longCount = 0;
  let shortCount = 0;

  for (const word of candidates) {
    const len = word.length;
    const isLong = len >= LONG_LEN;
    const isShort = len <= SHORT_LEN;

    if (isLong && longCount >= MAX_LONG_WORDS) continue;

    const slotsLeft = WORDS_PER_PUZZLE - chosen.length - 1;
    // Remaining slots must still be able to reach the short-word minimum...
    if (MIN_SHORT_WORDS - (shortCount + (isShort ? 1 : 0)) > slotsLeft) continue;
    // ...and stay within the letter budget (every empty slot needs at least MIN_LEN letters).
    if (letters + len + slotsLeft * MIN_LEN > MAX_TOTAL_LETTERS) continue;

    // Rule 2: only compare against the (at most 11) words already chosen.
    let clash = false;
    for (const other of chosen) {
      if (other.includes(word) || word.includes(other)) {
        clash = true;
        break;
      }
    }
    if (clash) continue;

    chosen.push(word);
    letters += len;
    if (isLong) longCount++;
    if (isShort) shortCount++;
    if (chosen.length === WORDS_PER_PUZZLE) return chosen;
  }
  return null;
}

export function createWordPool(bank: readonly string[]): WordPool {
  const known = new Set(bank);
  let available: string[] = [...known];

  return {
    drawSet(rng) {
      if (available.length >= WORDS_PER_PUZZLE) {
        for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
          const set = greedyPass(shuffle(rng, available));
          if (set) {
            const taken = new Set(set);
            available = available.filter((w) => !taken.has(w));
            return set;
          }
        }
      }
      throw new Error('Word pool exhausted');
    },

    release(words) {
      const present = new Set(available);
      for (const w of words) {
        if (known.has(w) && !present.has(w)) {
          present.add(w);
          available.push(w);
        }
      }
    },

    remaining() {
      return available.length;
    },
  };
}
