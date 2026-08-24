/**
 * Deciding what a scanned product *is*.
 *
 * The two cases that started this are the first two tests: a real olive oil and
 * a sauce that merely contains olive oil. Getting the first wrong makes the app
 * claim you are missing something you own; getting the second wrong makes it
 * cook with a garlic sauce when the recipe asked for oil.
 */
import { describe, expect, it } from 'vitest';
import { suggestCanonical, caloriesPerGram, type CanonicalTerm } from '../src/services/canonical.js';
import { normalizeName } from '../src/services/matching.js';

const term = (name: string, foodId: string, kcalPerGram: number | null): CanonicalTerm => ({
  term: normalizeName(name),
  foodId,
  foodName: name,
  caloriesPerGram: kcalPerGram,
});

const CATALOG: CanonicalTerm[] = [
  term('Olive Oil', 'oliveoil', 8.84),
  term('Vegetable Oil', 'vegoil', 8.84),
  term('Whole Milk', 'milk', 0.61),
  term('Coconut Milk', 'coconutmilk', 1.97),
  term('Unsalted Butter', 'butter', 7.17),
  term('Cheddar Cheese', 'cheddar', 4.03),
  term('Tomato Salsa', 'salsa', 0.36),
  { term: 'butter', foodId: 'butter', foodName: 'Unsalted Butter', caloriesPerGram: 7.17 },
  { term: 'milk', foodId: 'milk', foodName: 'Whole Milk', caloriesPerGram: 0.61 },
  { term: 'olive oil', foodId: 'oliveoil', foodName: 'Olive Oil', caloriesPerGram: 8.84 },
  { term: 'cheese', foodId: 'cheddar', foodName: 'Cheddar Cheese', caloriesPerGram: 4.03 },
];

const product = (name: string, kcalPerGram: number | null) => ({
  name,
  caloriesPerUnit: kcalPerGram,
  defaultUnit: 'g',
  servingSizeGrams: 1,
});

describe('the two products that exposed this', () => {
  it('recognises a real olive oil as olive oil', () => {
    const result = suggestCanonical(product('ORGANIC EXTRA VIRGIN OLIVE OIL', 8.84), CATALOG);
    expect(result?.foodId).toBe('oliveoil');
    expect(result?.method).toBe('head_noun');
  });

  it('refuses to call a garlic sauce olive oil', () => {
    // it contains the words "olive oil" but it is a sauce, and cooking with it
    // where a recipe asked for oil would be wrong
    const result = suggestCanonical(product('Organic Olive Oil, Basil & Garlic Sauce', 2.5), CATALOG);
    expect(result).toBeNull();
  });
});

describe('head-noun matching', () => {
  it('matches on the end of the name, not anywhere in it', () => {
    expect(suggestCanonical(product('Kerrygold Pure Irish Butter', 7.2), CATALOG)?.foodId).toBe('butter');
    expect(suggestCanonical(product('Mature Cheddar Cheese', 4.1), CATALOG)?.foodId).toBe('cheddar');
    expect(suggestCanonical(product('Butter Chicken Sauce', 1.4), CATALOG)).toBeNull();
    expect(suggestCanonical(product('Olive Oil Mayonnaise', 6.8), CATALOG)).toBeNull();
  });

  it('prefers the longest match, so coconut milk is not milk', () => {
    const result = suggestCanonical(product('Organic Coconut Milk', 1.9), CATALOG);
    expect(result?.foodId).toBe('coconutmilk');
  });

  it('matches an exact name outright', () => {
    const result = suggestCanonical(product('Olive Oil', 8.84), CATALOG);
    expect(result?.method).toBe('exact');
    expect(result?.foodId).toBe('oliveoil');
  });

  it('gives a reason a person can read', () => {
    const result = suggestCanonical(product('Spanish Extra Virgin Olive Oil', 8.84), CATALOG);
    expect(result?.reason).toContain('olive oil');
    expect(result?.reason).toContain('Olive Oil');
  });
});

describe('packaging noise around the head noun', () => {
  const withEgg: CanonicalTerm[] = [
    ...CATALOG,
    { term: 'egg', foodId: 'egg', foodName: 'Egg', caloriesPerGram: 1.44 },
  ];

  it('sees past grading and pack-size text', () => {
    // a real label from a scan: the head noun is buried behind "GRADE AA LARGE"
    expect(suggestCanonical(product('CAGE-FREE EGGS GRADE AA LARGE', 1.44), withEgg)?.foodId).toBe('egg');
    expect(suggestCanonical(product('Cheddar Cheese 400 g', 4.03), withEgg)?.foodId).toBe('cheddar');
    expect(suggestCanonical(product('Whole Milk 2 L', 0.61), withEgg)?.foodId).toBe('milk');
  });

  it('never strips a word that could name a food', () => {
    // "sauce" and "spread" identify the product, so they are not noise
    expect(suggestCanonical(product('Olive Oil Sauce 500 g', 2.5), withEgg)).toBeNull();
    expect(suggestCanonical(product('Cheese Spread 200 g', 2.9), withEgg)).toBeNull();
  });
});

describe('the nutrition guard', () => {
  it('rejects a head noun that lies about the food', () => {
    // ends in "milk" but has a sixth of the calories — not dairy
    expect(suggestCanonical(product('Unsweetened Almond Milk', 0.15), CATALOG)).toBeNull();
    // "butter" with almost no fat is not butter
    expect(suggestCanonical(product('Low Fat Spreadable Butter', 1.2), CATALOG)).toBeNull();
  });

  it('allows a sweetened version when the whole name is the ingredient', () => {
    // "Almondmilk" IS almond milk — sweetened, so nearly three times the
    // calories of the unsweetened figure, but the same ingredient
    const withAlmond: CanonicalTerm[] = [
      ...CATALOG,
      { term: 'almondmilk', foodId: 'almondmilk', foodName: 'Almond Milk', caloriesPerGram: 0.15 },
    ];
    expect(suggestCanonical(product('Almondmilk', 0.4), withAlmond)?.foodId).toBe('almondmilk');

    // but a qualified name still gets the tight check: this is not dairy milk
    expect(suggestCanonical(product('Sweetened Almond Milk Drink', 0.4), CATALOG)).toBeNull();
  });

  it('tolerates the variation between real versions of the same thing', () => {
    // semi-skimmed is genuinely milk, just lighter
    expect(suggestCanonical(product('Semi Skimmed Milk', 0.5), CATALOG)?.foodId).toBe('milk');
    // light olive oil is still olive oil
    expect(suggestCanonical(product('Light Olive Oil', 8.2), CATALOG)?.foodId).toBe('oliveoil');
  });

  it('still matches when the product has no nutrition data at all', () => {
    expect(suggestCanonical(product('Waitrose Olive Oil', null), CATALOG)?.foodId).toBe('oliveoil');
  });
});

describe('caloriesPerGram', () => {
  it('normalises whichever unit the food is stored in', () => {
    expect(caloriesPerGram({ caloriesPerUnit: 8.84, defaultUnit: 'g', servingSizeGrams: 1 })).toBeCloseTo(8.84, 4);
    // 72 kcal per egg, 50 g per egg
    expect(caloriesPerGram({ caloriesPerUnit: 72, defaultUnit: 'count', servingSizeGrams: 50 })).toBeCloseTo(1.44, 4);
    expect(caloriesPerGram({ caloriesPerUnit: null, defaultUnit: 'g', servingSizeGrams: 1 })).toBeNull();
  });
});

describe('it declines rather than guessing', () => {
  it('leaves an unrecognisable product unlinked', () => {
    expect(suggestCanonical(product('Haribo Starmix', 3.4), CATALOG)).toBeNull();
    expect(suggestCanonical(product('Frosted Strawberry Toaster Pastries', 4.2), CATALOG)).toBeNull();
  });
});
