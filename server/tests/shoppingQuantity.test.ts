import { describe, expect, it } from 'vitest';
import { shoppingQuantity } from '../src/services/shoppingQuantity.js';

describe('shoppingQuantity', () => {
  it('never asks you to buy a fraction of a countable thing', () => {
    expect(shoppingQuantity(1.43, 'slice')).toBe(2);
    expect(shoppingQuantity(0.5, 'count')).toBe(1);
    expect(shoppingQuantity(2.1, 'count')).toBe(3);
    expect(shoppingQuantity(1, 'can')).toBe(1);
  });

  it('rounds weights up to a sensible shelf amount', () => {
    expect(shoppingQuantity(17.3, 'g')).toBe(20);
    expect(shoppingQuantity(120, 'g')).toBe(150);
    expect(shoppingQuantity(640, 'g')).toBe(700);
    expect(shoppingQuantity(1.2, 'kg')).toBe(1.5);
  });

  it('rounds spoons and cups to half measures', () => {
    expect(shoppingQuantity(0.167, 'cup')).toBe(0.5);
    expect(shoppingQuantity(2.2, 'tbsp')).toBe(2.5);
  });

  it('always rounds up — coming home short is the worse mistake', () => {
    expect(shoppingQuantity(1.01, 'count')).toBe(2);
    expect(shoppingQuantity(101, 'g')).toBe(150);
  });

  it('never returns zero', () => {
    expect(shoppingQuantity(0, 'g')).toBe(1);
    expect(shoppingQuantity(0.0001, 'count')).toBe(1);
  });
});
