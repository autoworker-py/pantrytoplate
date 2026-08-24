/**
 * Per-serving nutrition for a recipe, computed from its ingredients — never
 * entered by hand. Used for the calorie/protein figures on recipe cards and
 * for goal-aware ranking.
 *
 * If any ingredient has no usable nutrition data the total is reported as
 * partial, so the UI can say "at least 420 kcal" rather than pretending to a
 * precision it does not have.
 */
import type { FoodReference, RecipeIngredient } from '@prisma/client';
import { loadConvertContexts } from './conversions.js';
import { nutritionFor } from './nutrition.js';
import { roundQuantity } from './units.js';
import type { Tx } from '../db.js';

export interface RecipeNutrition {
  caloriesPerServing: number | null;
  proteinPerServing: number | null;
  carbsPerServing: number | null;
  fatPerServing: number | null;
  /** true when at least one ingredient contributed nothing */
  partial: boolean;
}

type IngredientWithFood = RecipeIngredient & { foodReference: FoodReference };

export async function nutritionForRecipes(
  recipes: Array<{ id: string; servings: number; ingredients: IngredientWithFood[] }>,
  db: Tx,
): Promise<Map<string, RecipeNutrition>> {
  const foods = new Map<string, FoodReference>();
  for (const recipe of recipes) {
    for (const ingredient of recipe.ingredients) foods.set(ingredient.foodReferenceId, ingredient.foodReference);
  }
  const contexts = await loadConvertContexts([...foods.values()], db);

  const out = new Map<string, RecipeNutrition>();
  for (const recipe of recipes) {
    let calories = 0;
    let protein = 0;
    let carbs = 0;
    let fat = 0;
    let partial = false;

    for (const ingredient of recipe.ingredients) {
      const totals = nutritionFor(
        ingredient.quantityRequired,
        ingredient.unitRequired,
        ingredient.foodReference,
        contexts.get(ingredient.foodReferenceId) ?? {},
      );
      if (totals.calories === null) {
        partial = true;
        continue;
      }
      calories += totals.calories;
      protein += totals.protein ?? 0;
      carbs += totals.carbs ?? 0;
      fat += totals.fat ?? 0;
    }

    const servings = Math.max(1, recipe.servings);
    out.set(recipe.id, {
      caloriesPerServing: roundQuantity(calories / servings),
      proteinPerServing: roundQuantity(protein / servings),
      carbsPerServing: roundQuantity(carbs / servings),
      fatPerServing: roundQuantity(fat / servings),
      partial,
    });
  }
  return out;
}

/**
 * How well a recipe suits the user's goal, 0..1.
 *
 * Cutting: favour lower calories and high protein per calorie (protein is what
 * keeps you full and preserves muscle in a deficit).
 * Gaining: favour calorie-dense meals.
 * Maintaining: no strong preference, so everything scores flat.
 */
export function goalFit(
  nutrition: RecipeNutrition | undefined,
  goal: 'lose' | 'maintain' | 'gain',
): number {
  if (!nutrition || nutrition.caloriesPerServing === null || nutrition.caloriesPerServing <= 0) return 0.5;
  const kcal = nutrition.caloriesPerServing;
  const protein = nutrition.proteinPerServing ?? 0;

  if (goal === 'maintain') return 0.5;

  if (goal === 'lose') {
    // 400 kcal or under scores full marks; 900+ scores nothing
    const calorieScore = Math.max(0, Math.min(1, (900 - kcal) / 500));
    // 10 g protein per 100 kcal is an excellent ratio
    const proteinScore = Math.max(0, Math.min(1, (protein / kcal) * 10));
    return calorieScore * 0.6 + proteinScore * 0.4;
  }

  // gain: reward density, still rewarding protein
  const calorieScore = Math.max(0, Math.min(1, (kcal - 200) / 600));
  const proteinScore = Math.max(0, Math.min(1, (protein / kcal) * 8));
  return calorieScore * 0.6 + proteinScore * 0.4;
}
