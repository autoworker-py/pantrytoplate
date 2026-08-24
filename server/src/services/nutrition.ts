/**
 * Calories/macros are never entered by the user: they are derived from the
 * food_reference row attached to whatever was consumed. If the consumed unit
 * cannot be converted to the food's nutrition basis we record null rather than
 * inventing a number.
 */
import { convert, type ConvertContext } from './units.js';

export interface NutritionBasis {
  defaultUnit: string;
  caloriesPerUnit: number | null;
  proteinPerUnit: number | null;
  fatPerUnit: number | null;
  carbsPerUnit: number | null;
}

export interface NutritionTotals {
  calories: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
}

export function nutritionFor(
  quantity: number,
  unit: string,
  food: NutritionBasis,
  ctx: ConvertContext,
): NutritionTotals {
  const converted = convert(quantity, unit, food.defaultUnit, ctx);
  if (!converted.ok) return { calories: null, protein: null, fat: null, carbs: null };
  const n = converted.value;
  const scale = (per: number | null) => (per === null || per === undefined ? null : per * n);
  return {
    calories: scale(food.caloriesPerUnit),
    protein: scale(food.proteinPerUnit),
    fat: scale(food.fatPerUnit),
    carbs: scale(food.carbsPerUnit),
  };
}
