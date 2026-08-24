/**
 * Deduction planning: which lots get drawn down, in what order, and when the
 * app must stop and ask instead of guessing.
 */
import { describe, expect, it } from 'vitest';
import { planDeduction, sortLotsFefo, type LotInput } from '../src/services/deduction.js';

const day = (offset: number) => {
  const date = new Date('2026-01-01T12:00:00Z');
  date.setDate(date.getDate() + offset);
  return date;
};

const lot = (over: Partial<LotInput> & Pick<LotInput, 'id' | 'quantity' | 'unit'>): LotInput => ({
  expirationDate: null,
  createdAt: day(0),
  ...over,
});

const EGG_CTX = { edges: [], defaultUnit: 'count', servingSizeGrams: 50 };
const FLOUR_CTX = {
  edges: [{ fromUnit: 'cup', toUnit: 'g', multiplier: 120, cost: 1 }],
  defaultUnit: 'g',
  servingSizeGrams: 1,
};

describe('FEFO ordering', () => {
  it('draws from the soonest-expiring lot first, undated lots last', () => {
    const lots = [
      lot({ id: 'none', quantity: 5, unit: 'count' }),
      lot({ id: 'late', quantity: 5, unit: 'count', expirationDate: day(30) }),
      lot({ id: 'soon', quantity: 5, unit: 'count', expirationDate: day(2) }),
    ];
    expect(sortLotsFefo(lots).map((l) => l.id)).toEqual(['soon', 'late', 'none']);
  });
});

describe('planDeduction: countable items', () => {
  it('deducts 3 eggs from a dozen and leaves 9', () => {
    const plan = planDeduction([lot({ id: 'a', quantity: 12, unit: 'count' })], 3, 'count', EGG_CTX);
    expect(plan.status).toBe('ok');
    expect(plan.deductions).toHaveLength(1);
    expect(plan.deductions[0]!.quantityDeducted).toBe(3);
    expect(plan.deductions[0]!.quantityAfter).toBe(9);
  });

  it('spreads a deduction across lots, oldest expiry first', () => {
    const plan = planDeduction(
      [
        lot({ id: 'fresh', quantity: 6, unit: 'count', expirationDate: day(20) }),
        lot({ id: 'older', quantity: 4, unit: 'count', expirationDate: day(3) }),
      ],
      8,
      'count',
      EGG_CTX,
    );
    expect(plan.status).toBe('ok');
    expect(plan.deductions.map((d) => [d.inventoryItemId, d.quantityDeducted])).toEqual([
      ['older', 4],
      ['fresh', 4],
    ]);
  });

  it('reports a shortfall instead of going negative', () => {
    const plan = planDeduction([lot({ id: 'a', quantity: 2, unit: 'count' })], 3, 'count', EGG_CTX);
    expect(plan.status).toBe('short');
    expect(plan.shortfall).toBe(1);
    expect(plan.deductions).toHaveLength(0);
  });

  it('reports missing when the user owns none', () => {
    const plan = planDeduction([], 3, 'count', EGG_CTX);
    expect(plan.status).toBe('missing');
    expect(plan.shortfall).toBe(3);
  });

  it('depletes a lot exactly, with no floating-point sliver left', () => {
    const plan = planDeduction([lot({ id: 'a', quantity: 0.3, unit: 'cup' })], 0.1 + 0.2, 'cup', FLOUR_CTX);
    expect(plan.status).toBe('ok');
    expect(plan.deductions[0]!.quantityAfter).toBe(0);
  });
});

describe('planDeduction: cross-unit', () => {
  it('takes 2 cups of flour out of a 32 oz bag', () => {
    const plan = planDeduction([lot({ id: 'bag', quantity: 32, unit: 'oz' })], 2, 'cup', FLOUR_CTX);
    expect(plan.status).toBe('ok');
    expect(plan.available).toBeCloseTo(7.559873, 4);
    const deduction = plan.deductions[0]!;
    expect(deduction.unit).toBe('oz');
    expect(deduction.quantityDeducted).toBeCloseTo(8.466, 2);
    expect(deduction.quantityAfter).toBeCloseTo(23.534, 2);
  });

  it('sums availability across differently-united lots', () => {
    const plan = planDeduction(
      [lot({ id: 'g', quantity: 240, unit: 'g' }), lot({ id: 'cups', quantity: 1, unit: 'cup' })],
      3,
      'cup',
      FLOUR_CTX,
    );
    expect(plan.status).toBe('ok');
    expect(plan.available).toBeCloseTo(3, 6);
  });
});

describe('planDeduction: refuses to guess', () => {
  it('flags an unconvertible lot instead of silently ignoring or consuming it', () => {
    const plan = planDeduction([lot({ id: 'bag', quantity: 1, unit: 'bag' })], 2, 'cup', FLOUR_CTX);
    expect(plan.status).toBe('unknown_conversion');
    expect(plan.deductions).toHaveLength(0);
    expect(plan.unconvertibleLots).toEqual([{ inventoryItemId: 'bag', quantity: 1, unit: 'bag' }]);
  });

  it('still proceeds when the convertible lots alone cover the requirement', () => {
    const plan = planDeduction(
      [lot({ id: 'known', quantity: 500, unit: 'g' }), lot({ id: 'bag', quantity: 1, unit: 'bag' })],
      2,
      'cup',
      FLOUR_CTX,
    );
    expect(plan.status).toBe('ok');
    expect(plan.deductions.map((d) => d.inventoryItemId)).toEqual(['known']);
    expect(plan.unconvertibleLots).toHaveLength(1);
  });
});
