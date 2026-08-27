import type { ExpiryStatus, IngredientStatus } from './types';

/**
 * Mirrors the server's rounding: show enough precision to be useful without
 * implying we know a pantry to the milligram ("49.7 g", not "49.713 g").
 */
function round(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const abs = Math.abs(value);
  const decimals = abs >= 100 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 2 : 3;
  return Number(value.toFixed(decimals));
}

/** "count" is an implementation detail; people say "9 eggs", not "9 count eggs". */
export function formatAmount(quantity: number, unit: string): string {
  const rounded = round(quantity);
  if (unit === 'count') return `${rounded}`;
  const plural = rounded === 1 || NO_PLURAL.has(unit) ? unit : `${unit}s`;
  return `${rounded} ${plural}`;
}

const NO_PLURAL = new Set(['g', 'kg', 'mg', 'ml', 'l', 'oz', 'lb', 'tsp', 'tbsp', 'floz', 'dozen']);

export function expiryLabel(days: number | null, status: ExpiryStatus): string {
  if (status === 'unknown' || days === null) return 'No date';
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return 'Expires today';
  if (days === 1) return 'Expires tomorrow';
  return `${days} days left`;
}

export const STATUS_LABEL: Record<IngredientStatus, string> = {
  ok: 'Have it',
  short: 'Short',
  missing: 'Missing',
  unknown_conversion: 'Check units',
};

export function formatDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}
