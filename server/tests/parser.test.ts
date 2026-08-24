/**
 * The ingredient-line parser: the bottleneck in importing a recipe from
 * anywhere. Every one of these is a shape that appears on real recipe sites.
 */
import { describe, expect, it } from 'vitest';
import { parseIngredientLine, parseIsoDuration } from '../src/services/ingredientParser.js';

describe('parseIngredientLine', () => {
  it('handles the plain case', () => {
    const result = parseIngredientLine('2 cups flour');
    expect(result).toMatchObject({ quantity: 2, unit: 'cup', name: 'flour', quantityFound: true });
  });

  it('reads fractions, mixed numbers and vulgar fractions', () => {
    expect(parseIngredientLine('1/2 cup sugar').quantity).toBeCloseTo(0.5, 6);
    expect(parseIngredientLine('1 1/2 cups milk').quantity).toBeCloseTo(1.5, 6);
    expect(parseIngredientLine('½ tsp salt').quantity).toBeCloseTo(0.5, 6);
    expect(parseIngredientLine('1½ cups oats').quantity).toBeCloseTo(1.5, 6);
  });

  it('splits the prep note off the food name', () => {
    const result = parseIngredientLine('2 large eggs, lightly beaten');
    expect(result.name).toBe('large eggs');
    expect(result.note).toBe('lightly beaten');
  });

  it('pulls packaging detail out of parentheses', () => {
    const result = parseIngredientLine('1 (14.5 oz) can diced tomatoes, drained');
    expect(result.quantity).toBe(1);
    expect(result.unit).toBe('can');
    expect(result.name).toBe('diced tomatoes');
    expect(result.note).toContain('14.5 oz');
    expect(result.note).toContain('drained');
  });

  it('drops the filler "of"', () => {
    expect(parseIngredientLine('3 cloves of garlic').name).toBe('garlic');
  });

  it('reads number words', () => {
    expect(parseIngredientLine('two tablespoons olive oil')).toMatchObject({ quantity: 2, unit: 'tbsp' });
  });

  it('takes the lower bound of a range', () => {
    expect(parseIngredientLine('2-3 cloves garlic')).toMatchObject({ quantity: 2, name: 'garlic' });
  });

  it('defaults to one countable unit when no quantity is given', () => {
    const result = parseIngredientLine('salt and pepper to taste');
    expect(result.quantity).toBe(1);
    expect(result.unit).toBe('count');
    expect(result.quantityFound).toBe(false);
  });

  it('does not mistake a food word for a unit', () => {
    expect(parseIngredientLine('2 bananas').name).toBe('bananas');
    expect(parseIngredientLine('2 bananas').unit).toBe('count');
  });
});

describe('parseIsoDuration', () => {
  it('reads the durations schema.org uses', () => {
    expect(parseIsoDuration('PT25M')).toBe(25);
    expect(parseIsoDuration('PT1H15M')).toBe(75);
    expect(parseIsoDuration('PT2H')).toBe(120);
    expect(parseIsoDuration('P1DT2H')).toBe(1560);
  });

  it('returns null for nothing usable', () => {
    expect(parseIsoDuration(null)).toBeNull();
    expect(parseIsoDuration('')).toBeNull();
    expect(parseIsoDuration('soon')).toBeNull();
  });
});
