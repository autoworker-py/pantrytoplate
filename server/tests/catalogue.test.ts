import { describe, expect, it } from 'vitest';
import { FOODS } from '../prisma/data/foods.js';
import { SUBSTITUTIONS } from '../prisma/data/substitutions.js';
import { normalizeName } from '../src/services/matching.js';

/**
 * Guards on the catalogue itself.
 *
 * The pantry and the recipe book are joined by name matching, so a duplicated
 * name or a synonym claimed by two foods is not untidiness - it is an
 * ambiguous join, and the wrong tin gets deducted. These ran as one-off scripts
 * while the catalogue was expanded; they belong in the suite, because the next
 * person to add a food will not think to run them.
 */
describe('food catalogue integrity', () => {
  it('has no duplicate keys', () => {
    const seen = new Map<string, number>();
    for (const food of FOODS) seen.set(food.key, (seen.get(food.key) ?? 0) + 1);
    expect([...seen].filter(([, n]) => n > 1).map(([k]) => k)).toEqual([]);
  });

  it('has no duplicate names', () => {
    const seen = new Map<string, number>();
    for (const food of FOODS) seen.set(food.name.toLowerCase(), (seen.get(food.name.toLowerCase()) ?? 0) + 1);
    expect([...seen].filter(([, n]) => n > 1).map(([k]) => k)).toEqual([]);
  });

  it('never lets two foods claim the same name or synonym', () => {
    // the join between pantry and recipe runs through these terms; a term
    // owned by two foods means the match is a coin toss
    const owner = new Map<string, string>();
    const clashes: string[] = [];
    for (const food of FOODS) {
      for (const term of [food.name, ...(food.synonyms ?? [])]) {
        const norm = normalizeName(term);
        const existing = owner.get(norm);
        if (existing && existing !== food.key) clashes.push(`"${term}" claimed by ${existing} and ${food.key}`);
        else owner.set(norm, food.key);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('uses keys without whitespace', () => {
    expect(FOODS.filter((f) => /\s/.test(f.key)).map((f) => f.key)).toEqual([]);
  });

  it('states nutrition for every food', () => {
    expect(FOODS.filter((f) => f.kcal === null || f.gramsPerUnit === null).map((f) => f.key)).toEqual([]);
    expect(FOODS.filter((f) => (f.kcal ?? 0) < 0 || (f.protein ?? 0) < 0 || (f.fat ?? 0) < 0 || (f.carbs ?? 0) < 0)).toEqual([]);
  });

  it('is meaningfully larger than a token list', () => {
    // the complaint that prompted this was "not enough options"
    expect(FOODS.length).toBeGreaterThan(300);
    const terms = FOODS.length + FOODS.reduce((n, f) => n + (f.synonyms?.length ?? 0), 0);
    expect(terms).toBeGreaterThan(500);
  });
});

describe('substitution rules', () => {
  const keys = new Set(FOODS.map((f) => f.key));

  it('only reference foods that exist', () => {
    const missing = [...new Set(SUBSTITUTIONS.flatMap(([a, b]) => [a, b]).filter((k) => !keys.has(k as string)))];
    expect(missing).toEqual([]);
  });

  it('has no duplicate or self-referencing pairs', () => {
    const seen = new Map<string, number>();
    for (const [from, to] of SUBSTITUTIONS) seen.set(`${from}>${to}`, (seen.get(`${from}>${to}`) ?? 0) + 1);
    expect([...seen].filter(([, n]) => n > 1).map(([k]) => k)).toEqual([]);
    expect(SUBSTITUTIONS.filter(([a, b]) => a === b)).toEqual([]);
  });

  it('always states a positive ratio and a note explaining the cost', () => {
    // the note is the difference between a rescued dinner and a nasty surprise
    expect(SUBSTITUTIONS.filter(([, , ratio]) => !(Number(ratio) > 0))).toEqual([]);
    expect(SUBSTITUTIONS.filter(([, , , note]) => !String(note ?? '').trim())).toEqual([]);
  });

  it('covers the bread family, which is the swap people reach for most', () => {
    // reported directly: white bread in the pantry offered nothing for a
    // wholemeal recipe, because no rule existed in either direction
    const pairs = new Set(SUBSTITUTIONS.map(([a, b]) => `${a}>${b}`));
    expect(pairs.has('bread>whitebread')).toBe(true);
    expect(pairs.has('whitebread>bread')).toBe(true);
  });

  it('offers a stand-in for a good share of the catalogue', () => {
    const covered = new Set(SUBSTITUTIONS.map(([from]) => from));
    expect(covered.size).toBeGreaterThan(150);
  });
});
