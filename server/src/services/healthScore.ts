/**
 * A health grade, A to E, the Nutri-Score way (the 2017 algorithm for foods):
 * points against for energy, sugar, saturated fat and sodium per 100 g, points
 * for fiber, protein, and fruit, vegetables, pulses and nuts; fewer points is
 * better. Drinks are graded on their own scale, water and plain tea and coffee
 * are A, and alcohol is not graded at all, as Nutri-Score leaves it out.
 *
 * It is a way to compare foods with each other, not advice about any one of
 * them, and a food without its sugar, saturated fat and sodium has no grade
 * rather than a guessed one.
 */

export type Grade = 'A' | 'B' | 'C' | 'D' | 'E';

/** categories counted as fruit, vegetables, pulses and nuts */
const PLANTS = new Set(['Produce', 'Fruit', 'Herbs', 'Nuts & Seeds', 'Legumes']);
const ALCOHOL = /\b(beer|wine|cider|ale|lager|stout|spirits?|vodka|gin|rum|whisk(e)?y|tequila|liqueur|prosecco|champagne)\b/i;
const KJ_PER_KCAL = 4.184;

export interface GradedFood {
  name: string;
  category: string | null;
  defaultUnit: string;
  servingSizeGrams: number | null;
  caloriesPerUnit: number | null;
  proteinPerUnit: number | null;
  fiberPerUnit?: number | null;
  sugarPerUnit?: number | null;
  satFatPerUnit?: number | null;
  sodiumPerUnit?: number | null;
}

/** How many thresholds a value is over. */
const over = (value: number, thresholds: number[]) => thresholds.filter((t) => value > t).length;

/**
 * Nutri-Score points for a food, or null when it can't be graded: no weight to
 * work per 100 g from, no sugar, saturated fat or sodium on record, or alcohol.
 */
export function foodPoints(food: GradedFood): number | null {
  if (ALCOHOL.test(food.name)) return null;
  const grams = food.defaultUnit === 'g' || food.defaultUnit === 'ml' ? 1 : food.servingSizeGrams;
  if (!grams || food.caloriesPerUnit === null) return null;
  if (food.sugarPerUnit == null && food.satFatPerUnit == null && food.sodiumPerUnit == null) return null;
  const per100 = (value: number | null | undefined) => ((value ?? 0) * 100) / grams;

  const kj = per100(food.caloriesPerUnit) * KJ_PER_KCAL;
  const sugar = per100(food.sugarPerUnit);

  if (food.category === 'Beverages') {
    // water, plain tea and coffee: nothing in them to count against
    if (kj < 4.2 && sugar < 0.5) return -10;
    // the drinks scale (B up to 1, C up to 5, D up to 9, then E), given as the
    // solid scale's points for the same letter so drinks and food can be mixed
    const points = over(kj, [0, 30, 60, 90, 120, 150, 180, 210, 240, 270]) + over(sugar, [0, 1.5, 3, 4.5, 6, 7.5, 9, 10.5, 12, 13.5]);
    return points <= 1 ? 1 : points <= 5 ? 6 : points <= 9 ? 14 : 20;
  }

  const against =
    over(kj, [335, 670, 1005, 1340, 1675, 2010, 2345, 2680, 3015, 3350]) +
    over(sugar, [4.5, 9, 13.5, 18, 22.5, 27, 31, 36, 40, 45]) +
    over(per100(food.satFatPerUnit), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) +
    over(per100(food.sodiumPerUnit), [90, 180, 270, 360, 450, 540, 630, 720, 810, 900]);
  const fiber = over(per100(food.fiberPerUnit), [0.9, 1.9, 2.8, 3.7, 4.7]);
  const protein = over(per100(food.proteinPerUnit), [1.6, 3.2, 4.8, 6.4, 8.0]);
  const plants = food.category && PLANTS.has(food.category) ? 5 : 0;
  // a food heavy on the bad side doesn't get to buy its way back with protein, except cheese, as Nutri-Score has it
  return against >= 11 && plants < 5 && food.category !== 'Cheese' ? against - fiber - plants : against - fiber - protein - plants;
}

/** The letter for some points, on the food scale (drinks are given points on it above). */
export function gradeOf(points: number | null): Grade | null {
  if (points === null) return null;
  if (points <= -1) return 'A';
  if (points <= 2) return 'B';
  if (points <= 10) return 'C';
  if (points <= 18) return 'D';
  return 'E';
}

export const foodGrade = (food: GradedFood): Grade | null => gradeOf(foodPoints(food));

/**
 * A grade for several foods together, a meal or a day or a month: their
 * points averaged by how much each brought, so the burger counts for more than
 * the pickle. Weights are calories; anything without a grade is left out.
 */
export function mixedGrade(parts: Array<{ points: number | null; weight: number | null }>): Grade | null {
  let sum = 0;
  let total = 0;
  for (const part of parts) {
    if (part.points === null || !part.weight || part.weight <= 0) continue;
    sum += part.points * part.weight;
    total += part.weight;
  }
  return total > 0 ? gradeOf(Math.round(sum / total)) : null;
}
