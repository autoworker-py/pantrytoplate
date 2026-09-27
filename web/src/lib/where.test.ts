import { describe, expect, it } from 'vitest';
import { whereFor } from './where';

const at = (name: string, category: string | null = null) => whereFor({ name, category });

describe('where a food goes when nobody has said', () => {
  it('puts what spoils in the fridge, even under a vague scanned category', () => {
    expect(at('Great Value Whole Milk, 1 Gallon', 'Beverages')).toBe('fridge');
    expect(at('Orange Juice', 'Beverages')).toBe('fridge');
    expect(at('Cheddar Cheese', 'Cheese')).toBe('fridge');
    expect(at('Plain Greek Yogurt')).toBe('fridge');
    expect(at('Chicken Breast', 'Meat & Seafood')).toBe('fridge');
  });

  it('puts anything frozen in the freezer', () => {
    expect(at('Vanilla Ice Cream', 'Desserts')).toBe('freezer');
    expect(at('Frozen Peas')).toBe('freezer');
  });

  it('keeps what keeps in the cupboard, even with a fridge word in it', () => {
    expect(at('Peanut Butter', 'Condiments')).toBe('pantry');
    expect(at('Chicken Stock', 'Condiments')).toBe('pantry');
    expect(at('Coconut Milk', 'Canned Goods')).toBe('pantry');
    expect(at('Milk Chocolate Bar', 'Snacks')).toBe('pantry');
    expect(at('Tinned Tuna', 'Canned Goods')).toBe('pantry');
    expect(at('Spaghetti', 'Pasta')).toBe('pantry');
  });
});
