/**
 * The conversion engine is the highest-risk logic in the app: a wrong factor
 * here silently corrupts a user's pantry. These tests are deliberately
 * exhaustive about the cases the product actually hits.
 */
import { describe, expect, it } from 'vitest';
import {
  canConvert,
  convert,
  dimensionOf,
  formatQuantity,
  gte,
  isNegligible,
  isCountUnit,
  normalizeUnit,
  roundQuantity,
} from '../src/services/units.js';

const FLOUR = {
  // 1 cup all-purpose flour = 120 g
  edges: [{ fromUnit: 'cup', toUnit: 'g', multiplier: 120, cost: 1 }],
  defaultUnit: 'g',
  servingSizeGrams: 1,
};

const SUGAR = {
  edges: [{ fromUnit: 'cup', toUnit: 'g', multiplier: 200, cost: 1 }],
  defaultUnit: 'g',
  servingSizeGrams: 1,
};

const EGG = { edges: [], defaultUnit: 'count', servingSizeGrams: 50 };

describe('normalizeUnit', () => {
  it('folds aliases, plurals, punctuation and case', () => {
    expect(normalizeUnit('Grams')).toBe('g');
    expect(normalizeUnit('gram')).toBe('g');
    expect(normalizeUnit('OZ')).toBe('oz');
    expect(normalizeUnit('ounces')).toBe('oz');
    expect(normalizeUnit('lbs')).toBe('lb');
    expect(normalizeUnit('Tablespoons')).toBe('tbsp');
    expect(normalizeUnit('tsp.')).toBe('tsp');
    expect(normalizeUnit('fl oz')).toBe('floz');
    expect(normalizeUnit('Cups')).toBe('cup');
    expect(normalizeUnit('millilitres')).toBe('ml');
  });

  it('treats blank / countable words as the count unit', () => {
    expect(normalizeUnit('')).toBe('count');
    expect(normalizeUnit(null)).toBe('count');
    expect(normalizeUnit('each')).toBe('count');
    expect(normalizeUnit('pieces')).toBe('count');
    expect(normalizeUnit('whole')).toBe('count');
  });

  it('keeps container units distinct instead of pretending they are counts', () => {
    expect(normalizeUnit('boxes')).toBe('box');
    expect(normalizeUnit('Bag')).toBe('bag');
    expect(normalizeUnit('cans')).toBe('can');
    expect(normalizeUnit('slices')).toBe('slice');
  });

  it('gives an unknown unit a stable token rather than throwing', () => {
    expect(normalizeUnit('sachets')).toBe('sachet');
  });
});

describe('dimensionOf', () => {
  it('classifies units', () => {
    expect(dimensionOf('kg')).toBe('mass');
    expect(dimensionOf('cup')).toBe('volume');
    expect(dimensionOf('dozen')).toBe('count');
    expect(dimensionOf('box')).toBe('opaque');
    expect(isCountUnit('each')).toBe(true);
    expect(isCountUnit('g')).toBe(false);
  });
});

describe('convert: the simple, common case (discrete countable items)', () => {
  it('is an exact identity for like units — no conversion involved', () => {
    const result = convert(3, 'count', 'count', EGG);
    expect(result.ok && result.value).toBe(3);
  });

  it('subtracts eggs from eggs: 12 - 3 leaves 9', () => {
    const required = convert(3, 'each', 'count', EGG);
    expect(required.ok).toBe(true);
    if (required.ok) expect(12 - required.value).toBe(9);
  });

  it('expands a dozen to twelve', () => {
    const result = convert(1, 'dozen', 'count', EGG);
    expect(result.ok && result.value).toBe(12);
  });
});

describe('convert: within a dimension', () => {
  it('converts mass units exactly', () => {
    expect((convert(1, 'kg', 'g') as { value: number }).value).toBe(1000);
    expect((convert(1, 'lb', 'g') as { value: number }).value).toBeCloseTo(453.59237, 5);
    expect((convert(32, 'oz', 'g') as { value: number }).value).toBeCloseTo(907.18474, 4);
    expect((convert(907.18474, 'g', 'lb') as { value: number }).value).toBeCloseTo(2, 6);
  });

  it('converts volume units exactly', () => {
    expect((convert(1, 'cup', 'ml') as { value: number }).value).toBeCloseTo(236.5882365, 6);
    expect((convert(1, 'cup', 'tbsp') as { value: number }).value).toBeCloseTo(16, 6);
    expect((convert(3, 'tsp', 'tbsp') as { value: number }).value).toBeCloseTo(1, 6);
    expect((convert(1, 'gallon', 'cup') as { value: number }).value).toBeCloseTo(16, 6);
  });

  it('round-trips without drift', () => {
    const there = convert(2.5, 'cup', 'ml');
    expect(there.ok).toBe(true);
    if (!there.ok) return;
    const back = convert(there.value, 'ml', 'cup');
    expect(back.ok && back.value).toBeCloseTo(2.5, 9);
  });
});

describe('convert: the hard case — volume to mass needs a density', () => {
  it('uses the ingredient-specific density (2 cups flour = 240 g)', () => {
    const result = convert(2, 'cups', 'g', FLOUR);
    expect(result.ok && result.value).toBeCloseTo(240, 6);
  });

  it('knows 1 cup flour is not 1 cup sugar', () => {
    const flour = convert(1, 'cup', 'g', FLOUR);
    const sugar = convert(1, 'cup', 'g', SUGAR);
    expect(flour.ok && flour.value).toBeCloseTo(120, 6);
    expect(sugar.ok && sugar.value).toBeCloseTo(200, 6);
  });

  it('chains a density with a unit conversion: 2 cups flour out of a 32 oz bag', () => {
    // recipe needs 2 cups -> 240 g; the bag holds 32 oz -> 907.18 g
    const needed = convert(2, 'cup', 'g', FLOUR);
    const owned = convert(32, 'oz', 'g', FLOUR);
    expect(needed.ok && owned.ok).toBe(true);
    if (!needed.ok || !owned.ok) return;
    expect(owned.value - needed.value).toBeCloseTo(667.18474, 4);
    // and the same subtraction expressed back in cups
    const remainingCups = convert(owned.value - needed.value, 'g', 'cup', FLOUR);
    expect(remainingCups.ok && remainingCups.value).toBeCloseTo(5.559873, 4);
  });

  it('goes the other way too (g -> cup)', () => {
    const result = convert(360, 'g', 'cup', FLOUR);
    expect(result.ok && result.value).toBeCloseTo(3, 6);
  });

  it('reaches tablespoons through the density edge', () => {
    // 1 cup flour = 120 g, so 1 tbsp flour = 7.5 g
    const result = convert(1, 'tbsp', 'g', FLOUR);
    expect(result.ok && result.value).toBeCloseTo(7.5, 6);
  });
});

describe('convert: the serving-size bridge', () => {
  it('turns a count of eggs into grams', () => {
    const result = convert(3, 'count', 'g', EGG);
    expect(result.ok && result.value).toBeCloseTo(150, 6);
  });

  it('is used for grams -> count as well', () => {
    const result = convert(100, 'g', 'count', EGG);
    expect(result.ok && result.value).toBeCloseTo(2, 6);
  });

  it('loses to an ingredient-specific row when both could work', () => {
    // serving bridge says 1 count = 100 g; the explicit row says 1 count = 25 g
    const ctx = {
      edges: [{ fromUnit: 'count', toUnit: 'g', multiplier: 25, cost: 1 }],
      defaultUnit: 'count',
      servingSizeGrams: 100,
    };
    const result = convert(1, 'count', 'g', ctx);
    expect(result.ok && result.value).toBeCloseTo(25, 6);
  });
});

describe('convert: container units', () => {
  it('opens a box once the catalog knows how many are inside', () => {
    const popTarts = {
      edges: [{ fromUnit: 'box', toUnit: 'count', multiplier: 10, cost: 1 }],
      defaultUnit: 'count',
      servingSizeGrams: 48,
    };
    expect((convert(1, 'box', 'count', popTarts) as { value: number }).value).toBeCloseTo(10, 6);
    // and a box can even be weighed, via count -> serving grams
    expect((convert(1, 'box', 'g', popTarts) as { value: number }).value).toBeCloseTo(480, 6);
  });
});

describe('convert: refuses to guess', () => {
  it('will not convert volume to mass without a density', () => {
    const result = convert(2, 'cup', 'g', { edges: [], defaultUnit: 'cup', servingSizeGrams: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('no_conversion');
  });

  it('will not invent the size of an unknown container', () => {
    expect(canConvert('bag', 'g', { edges: [] })).toBe(false);
    expect(canConvert('box', 'count', { edges: [] })).toBe(false);
  });

  it('will not treat a count as a weight without a serving size', () => {
    const result = convert(1, 'count', 'g', { edges: [], defaultUnit: 'count', servingSizeGrams: null });
    expect(result.ok).toBe(false);
  });

  it('ignores nonsensical conversion rows instead of producing Infinity', () => {
    const ctx = { edges: [{ fromUnit: 'cup', toUnit: 'g', multiplier: 0 }] };
    expect(convert(1, 'cup', 'g', ctx).ok).toBe(false);
  });
});

describe('float safety', () => {
  it('gte tolerates representation error', () => {
    expect(gte(0.1 + 0.2, 0.3)).toBe(true);
    expect(gte(0.3, 0.1 + 0.2)).toBe(true);
    expect(gte(0.29, 0.3)).toBe(false);
  });

  it('rounds for display without over-claiming precision', () => {
    expect(roundQuantity(667.18474)).toBe(667);
    expect(roundQuantity(12.3456)).toBe(12.3);
    expect(roundQuantity(2.34567)).toBe(2.35);
    expect(roundQuantity(0.123456)).toBe(0.123);
  });

  it('formats quantities the way a person would read them', () => {
    expect(formatQuantity(9, 'count')).toBe('9');
    expect(formatQuantity(2, 'cup')).toBe('2 cups');
    expect(formatQuantity(1, 'cup')).toBe('1 cup');
    expect(formatQuantity(240, 'g')).toBe('240 g');
  });
});

describe('isNegligible', () => {
  it('treats a conversion remainder as nothing', () => {
    // 0.00025 gallons is about a millilitre; it was sitting in the pantry
    // displayed as "0 gallons"
    expect(isNegligible(0.00025, 'gallon')).toBe(true);
    expect(isNegligible(0.0004, 'l')).toBe(true);
    expect(isNegligible(0.0009, 'kg')).toBe(true);
  });

  it('leaves real stock alone', () => {
    expect(isNegligible(0.25, 'gallon')).toBe(false);
    expect(isNegligible(2, 'g')).toBe(false);
    expect(isNegligible(1, 'count')).toBe(false);
    expect(isNegligible(0.5, 'kg')).toBe(false);
  });

  it('is cautious with a unit it cannot reason about', () => {
    // half a jar is still half a jar; only a float sliver counts as nothing
    expect(isNegligible(0.5, 'jar')).toBe(false);
    expect(isNegligible(1e-12, 'jar')).toBe(true);
  });

  it('treats zero and negatives as nothing', () => {
    expect(isNegligible(0, 'g')).toBe(true);
    expect(isNegligible(-1, 'g')).toBe(true);
  });
});
