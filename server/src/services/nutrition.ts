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
  /** grams per unit; sodium in milligrams. Missing on older shapes, which means unknown */
  fiberPerUnit?: number | null;
  sugarPerUnit?: number | null;
  satFatPerUnit?: number | null;
  sodiumPerUnit?: number | null;
}

export interface NutritionTotals {
  calories: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
  fiber: number | null;
  sugar: number | null;
  satFat: number | null;
  /** milligrams */
  sodium: number | null;
}

const UNKNOWN: NutritionTotals = { calories: null, protein: null, fat: null, carbs: null, fiber: null, sugar: null, satFat: null, sodium: null };

export function nutritionFor(
  quantity: number,
  unit: string,
  food: NutritionBasis,
  ctx: ConvertContext,
): NutritionTotals {
  const converted = convert(quantity, unit, food.defaultUnit, ctx);
  if (!converted.ok) return { ...UNKNOWN };
  const n = converted.value;
  const scale = (per: number | null | undefined) => (per === null || per === undefined ? null : per * n);
  return {
    calories: scale(food.caloriesPerUnit),
    protein: scale(food.proteinPerUnit),
    fat: scale(food.fatPerUnit),
    carbs: scale(food.carbsPerUnit),
    fiber: scale(food.fiberPerUnit),
    sugar: scale(food.sugarPerUnit),
    satFat: scale(food.satFatPerUnit),
    sodium: scale(food.sodiumPerUnit),
  };
}

/** A diary row's nutrition columns. */
export interface NutritionColumns {
  calories: number | null;
  proteinGrams: number | null;
  carbsGrams: number | null;
  fatGrams: number | null;
  fiberGrams: number | null;
  sugarGrams: number | null;
  satFatGrams: number | null;
  sodiumMg: number | null;
}

/** Totals, as the columns a diary row stores them in. */
export function nutritionColumns(totals: NutritionTotals): NutritionColumns {
  return {
    calories: totals.calories,
    proteinGrams: totals.protein,
    carbsGrams: totals.carbs,
    fatGrams: totals.fat,
    fiberGrams: totals.fiber,
    sugarGrams: totals.sugar,
    satFatGrams: totals.satFat,
    sodiumMg: totals.sodium,
  };
}

/** A diary row's nutrition times a factor: the share of it eaten, or that undone. */
export function scaleColumns(row: NutritionColumns, factor: number): NutritionColumns {
  const times = (value: number | null) => (value === null ? null : value * factor);
  return {
    calories: times(row.calories),
    proteinGrams: times(row.proteinGrams),
    carbsGrams: times(row.carbsGrams),
    fatGrams: times(row.fatGrams),
    fiberGrams: times(row.fiberGrams),
    sugarGrams: times(row.sugarGrams),
    satFatGrams: times(row.satFatGrams),
    sodiumMg: times(row.sodiumMg),
  };
}
