import { describe, expect, it } from 'vitest';
import { parsePackageGrams } from '../src/external/packageSize.js';

import { estimatePackageGrams } from '../src/external/packageSize.js';

describe('estimatePackageGrams', () => {
  it('uses a typical size for the category rather than asking the user', () => {
    expect(estimatePackageGrams('Spices', 2)).toBe(40);
    expect(estimatePackageGrams('Canned Goods', null)).toBe(400);
    expect(estimatePackageGrams('Beverages', null)).toBe(1000);
  });

  it('falls back to roughly a dozen servings', () => {
    expect(estimatePackageGrams(null, 30)).toBe(360);
  });

  it('gives up when it knows nothing at all', () => {
    expect(estimatePackageGrams(null, null)).toBeNull();
  });
});

describe('parsePackageGrams', () => {
  it('prefers a clean numeric quantity, rounded to whole grams', () => {
    expect(parsePackageGrams(453.59237, '16 oz')).toBe(454);
    expect(parsePackageGrams('500', '500 g')).toBe(500);
  });

  it('falls back to the text on the label', () => {
    expect(parsePackageGrams(null, '16 oz')).toBe(454);
    expect(parsePackageGrams(null, '500g')).toBe(500);
    expect(parsePackageGrams(null, '1 L')).toBe(1000);
    expect(parsePackageGrams(null, '1.5 l')).toBe(1500);
    expect(parsePackageGrams(null, '2 lb')).toBe(907);
  });

  it('handles multipacks', () => {
    expect(parsePackageGrams(null, '2 x 200 g')).toBe(400);
    expect(parsePackageGrams(null, '6 × 330 ml')).toBe(1980);
  });

  it('gives up rather than guessing', () => {
    expect(parsePackageGrams(null, null)).toBeNull();
    expect(parsePackageGrams(null, 'family size')).toBeNull();
    expect(parsePackageGrams(0, '')).toBeNull();
  });

  it('never returns a decimal', () => {
    for (const text of ['16 oz', '2 lb', '1.5 l', '3 x 12 oz']) {
      const grams = parsePackageGrams(null, text);
      expect(Number.isInteger(grams)).toBe(true);
    }
  });
});
