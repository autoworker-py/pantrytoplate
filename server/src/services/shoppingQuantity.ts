/**
 * Turning "you are short 1.43 slices" into something you can actually buy.
 *
 * A shopping list is read in a shop, so the numbers have to be roundable to a
 * purchase. Nobody buys 1.43 slices of bread or 17.3 g of chocolate chips —
 * they buy 2 slices and a bag. Always rounds *up*: coming home still short is
 * worse than buying slightly too much.
 */
import { dimensionOf, normalizeUnit } from './units.js';

/** Round up to the nearest `step`, avoiding float dust like 2.0000000004. */
function ceilTo(value: number, step: number): number {
  return Math.round(Math.ceil(value / step - 1e-9) * step * 1000) / 1000;
}

export function shoppingQuantity(quantity: number, unit: string): number {
  if (!(quantity > 0)) return 1;
  const normalized = normalizeUnit(unit);
  const dimension = dimensionOf(normalized);

  // you cannot buy a fraction of a thing
  if (dimension === 'count' || dimension === 'opaque') return Math.max(1, Math.ceil(quantity - 1e-9));

  if (dimension === 'mass') {
    if (normalized === 'g') {
      if (quantity <= 100) return ceilTo(quantity, 10);
      if (quantity <= 500) return ceilTo(quantity, 50);
      return ceilTo(quantity, 100);
    }
    return ceilTo(quantity, quantity <= 5 ? 0.5 : 1);
  }

  if (dimension === 'volume') {
    if (normalized === 'ml') {
      if (quantity <= 100) return ceilTo(quantity, 10);
      if (quantity <= 500) return ceilTo(quantity, 50);
      return ceilTo(quantity, 100);
    }
    // spoons and cups: half measures are as fine as a shop gets
    return ceilTo(quantity, 0.5);
  }

  return ceilTo(quantity, 0.5);
}
