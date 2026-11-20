import { describe, expect, it } from 'vitest';
import blocklist from '../grid/blocklist.json';
import { MAX_WORD_LEN, MIN_WORD_LEN } from '../core/types.ts';
import { WORD_BANK } from './bank.ts';

const bank = new Set(WORD_BANK);

describe('WORD_BANK', () => {
  it('has at least 1,500 words', () => {
    expect(WORD_BANK.length).toBeGreaterThanOrEqual(1500);
  });

  it('contains only 4-12 letter uppercase A-Z words', () => {
    const pattern = new RegExp(`^[A-Z]{${MIN_WORD_LEN},${MAX_WORD_LEN}}$`);
    expect(WORD_BANK.filter((w) => !pattern.test(w))).toEqual([]);
  });

  it('has no duplicates', () => {
    expect(bank.size).toBe(WORD_BANK.length);
  });

  it('is sorted', () => {
    expect(WORD_BANK.toSorted()).toEqual([...WORD_BANK]);
  });

  it('contains no blocklisted word or word containing a blocklist entry of 4+ letters', () => {
    const long = blocklist.filter((b) => b.length >= MIN_WORD_LEN);
    const bad = WORD_BANK.filter((w) => blocklist.includes(w) || long.some((b) => w.includes(b)));
    expect(bad).toEqual([]);
  });

  it('contains common words, including ones with innocent 3-letter blocklist substrings', () => {
    for (const w of ['HOUSE', 'GARDEN', 'FAMILY', 'WINTER', 'CLASS', 'GRASS'])
      expect(bank.has(w)).toBe(true);
  });

  it('excludes obscure words, function words and collapsed inflections', () => {
    for (const w of ['HALCYON', 'THE', 'ABOUT', 'WHICH', 'WOULD', 'THEIR']) {
      expect(bank.has(w)).toBe(false);
    }
    if (bank.has('WALK')) expect(bank.has('WALKED')).toBe(false);
    if (bank.has('HOUSE')) expect(bank.has('HOUSES')).toBe(false);
  });
});

describe('blocklist.json', () => {
  it('is deduped, uppercase A-Z and includes 3-letter entries (filler-only)', () => {
    expect(new Set(blocklist).size).toBe(blocklist.length);
    expect(blocklist.every((b) => /^[A-Z]{3,}$/.test(b))).toBe(true);
    expect(blocklist.some((b) => b.length === 3)).toBe(true);
  });
});
