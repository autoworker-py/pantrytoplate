/**
 * "Cook this recipe": the flow the whole product is built around. The user
 * never re-enters what the recipe needs — confirming the cook decrements every
 * matched ingredient and writes the consumption log.
 *
 * Atomicity matters more here than anywhere else in the app: a partial
 * deduction is silent inventory corruption. Everything runs inside one
 * interactive transaction, and the plan is recomputed *inside* that transaction
 * so a concurrent decrement between preview and confirm cannot overdraw a lot.
 */
import { prisma, type Tx } from '../db.js';
import { conflict, notFound } from '../errors.js';
import { loadConvertContexts } from './conversions.js';
import { planDeduction } from './deduction.js';
import { nutritionFor } from './nutrition.js';
import { clampZero, roundQuantity } from './units.js';
import { attachSubstitutes, evaluateRecipes, type RecipeMatch } from './recipeMatch.js';
import { checkLowStock } from './lowStock.js';
import { storeLeftovers, type StoredLeftovers } from './leftovers.js';
import { applySwaps } from './substitutions.js';
import { createId } from '../ids.js';

export interface CookPreview extends RecipeMatch {
  instructions: string;
  servingsCooked: number;
  blocked: boolean;
  blockingReasons: string[];
  estimatedCalories: number | null;
}

async function loadRecipe(recipeId: string, db: Tx, userId?: string) {
  const recipe = await db.recipe.findUnique({
    where: { id: recipeId },
    include: { ingredients: { include: { foodReference: true } } },
  });
  // another person's imported recipe reads as missing, not as forbidden
  if (!recipe || recipe.deletedAt !== null) throw notFound('Recipe not found');
  if (userId !== undefined && recipe.ownerId !== null && recipe.ownerId !== userId) {
    throw notFound('Recipe not found');
  }
  return recipe;
}

/**
 * What the confirmation screen shows: every ingredient, the exact amount to be
 * deducted, and what will be left afterwards.
 */
export async function previewCook(
  userId: string,
  recipeId: string,
  servings: number | null,
  db: Tx = prisma,
  choices: Record<string, string> = {},
  excluded: Set<string> = new Set(),
  swaps: Record<string, string> = {},
): Promise<CookPreview> {
  const loadedRecipe = await loadRecipe(recipeId, db, userId);
  // the swap is what will actually be deducted, so everything downstream —
  // calories, the plan, the diary — has to see the stand-in, not the original
  const recipe = {
    ...loadedRecipe,
    ingredients: await applySwaps(loadedRecipe.ingredients, swaps, db),
  };
  const [match] = await evaluateRecipes(userId, [recipe], servings, db, choices, excluded);
  if (!match) throw notFound('Recipe not found');
  // the cook screen is exactly where "use oil instead" is useful
  await attachSubstitutes(userId, match, db);

  const blockingReasons = match.ingredients
    .filter((i) => i.status !== 'ok')
    .map((i) => {
      if (i.status === 'missing') return `${i.name}: none in inventory`;
      if (i.status === 'short') return `${i.name}: short ${i.shortfall} ${i.requiredUnit}`;
      return `${i.name}: no known conversion to ${i.requiredUnit}`;
    });

  const contexts = await loadConvertContexts(
    recipe.ingredients.map((i) => i.foodReference),
    db,
  );
  let calories: number | null = 0;
  for (const ingredient of match.ingredients) {
    const food = recipe.ingredients.find((i) => i.foodReferenceId === ingredient.foodReferenceId)?.foodReference;
    if (!food || calories === null) continue;
    const totals = nutritionFor(
      ingredient.requiredQuantity,
      ingredient.requiredUnit,
      food,
      contexts.get(food.id) ?? {},
    );
    calories = totals.calories === null ? null : calories + totals.calories;
  }

  return {
    ...match,
    instructions: recipe.instructions,
    servingsCooked: servings ?? recipe.servings,
    blocked: blockingReasons.length > 0,
    blockingReasons,
    estimatedCalories: calories === null ? null : roundQuantity(calories),
  };
}

export interface CookResult {
  cookEventId?: string;
  /** portions put in the fridge rather than eaten now */
  leftovers: StoredLeftovers | null;
  /** anything the cook finished off, now on the shopping list */
  ranOut: Array<{ name: string }>;
  recipeId: string;
  recipeName: string;
  servingsCooked: number;
  deductions: Array<{
    foodReferenceId: string;
    name: string;
    quantityDeducted: number;
    unit: string;
    remaining: number;
    inventoryItemId: string;
    depleted: boolean;
  }>;
  caloriesLogged: number | null;
  consumptionLogIds: string[];
}

/**
 * Apply the cook. Throws HttpError(409) with the full plan attached if anything
 * is short — the caller has already shown a preview, so this is the guard
 * against the inventory changing underneath it.
 */
export async function cookRecipe(
  userId: string,
  recipeId: string,
  servings: number | null,
  mealSlot: string = 'dinner',
  /** ingredient food id -> the inventory lot the user picked */
  choices: Record<string, string> = {},
  /** ingredients left out of this cook */
  excluded: Set<string> = new Set(),
  /**
   * How many of the servings you cooked are going in the fridge rather than
   * onto a plate. The rest is logged as eaten now.
   */
  keepServings: number = 0,
  /** ingredient food id -> stand-in to use, for this cook only */
  swaps: Record<string, string> = {},
): Promise<CookResult> {
  return prisma.$transaction(async (tx) => {
    const loaded = await loadRecipe(recipeId, tx, userId);
    const swapped = await applySwaps(loaded.ingredients, swaps, tx);
    // an excluded ingredient is not deducted and not logged
    const recipe = {
      ...loaded,
      ingredients: swapped.filter((i) => !excluded.has(i.foodReferenceId)),
    };
    const scale = servings ? servings / Math.max(1, recipe.servings) : 1;

    // Match lots either directly or through the generic ingredient they are a
    // version of, so a scanned bottle of olive oil satisfies "olive oil".
    const ingredientIds = recipe.ingredients.map((i) => i.foodReferenceId);
    const lots = await tx.inventoryItem.findMany({
      where: {
        userId,
        quantity: { gt: 0 },
        OR: [
          { foodReferenceId: { in: ingredientIds } },
          { foodReference: { canonicalId: { in: ingredientIds } } },
        ],
      },
      include: { foodReference: { select: { canonicalId: true } } },
    });
    const byFood = new Map<string, typeof lots>();
    for (const lot of lots) {
      const key = lot.foodReference.canonicalId ?? lot.foodReferenceId;
      const list = byFood.get(key) ?? [];
      list.push(lot);
      byFood.set(key, list);
    }

    // contexts for the recipe's ingredients and for the products actually held
    const lotFoods = await tx.foodReference.findMany({
      where: { id: { in: [...new Set(lots.map((lot) => lot.foodReferenceId))] } },
    });
    const contexts = await loadConvertContexts(
      [...recipe.ingredients.map((i) => i.foodReference), ...lotFoods],
      tx,
    );
    const foodById = new Map(lotFoods.map((food) => [food.id, food]));

    /** the right conversion context for whatever this lot actually is */
    const lotContext = (lot: { foodReferenceId?: string }, fallback: string) =>
      contexts.get(lot.foodReferenceId ?? fallback) ?? contexts.get(fallback) ?? {};

    // 1. re-plan every ingredient against the live inventory
    const plans = recipe.ingredients.map((ingredient) => ({
      ingredient,
      plan: planDeduction(
        byFood.get(ingredient.foodReferenceId) ?? [],
        ingredient.quantityRequired * scale,
        ingredient.unitRequired,
        (lot) => lotContext(lot, ingredient.foodReferenceId),
        choices[ingredient.foodReferenceId],
      ),
    }));

    // 2. all-or-nothing: refuse before touching anything
    const blockers = plans.filter((p) => p.plan.status !== 'ok');
    if (blockers.length > 0) {
      throw conflict(
        'Not enough inventory to cook this recipe.',
        'insufficient_inventory',
        blockers.map(({ ingredient, plan }) => ({
          foodReferenceId: ingredient.foodReferenceId,
          name: ingredient.foodReference.name,
          status: plan.status,
          requiredQuantity: roundQuantity(plan.requiredQuantity),
          requiredUnit: plan.requiredUnit,
          available: roundQuantity(plan.available),
          shortfall: roundQuantity(plan.shortfall),
        })),
      );
    }

    // 3. apply. One id ties every row to this cook, so the diary shows the meal
    // rather than each ingredient as its own entry.
    const cookEventId = createId();

    const result: CookResult = {
      cookEventId,
      leftovers: null,
      ranOut: [],
      recipeId: recipe.id,
      recipeName: recipe.name,
      servingsCooked: servings ?? recipe.servings,
      deductions: [],
      caloriesLogged: 0,
      consumptionLogIds: [],
    };

    for (const { ingredient, plan } of plans) {
      const food = ingredient.foodReference;
      const ctx = contexts.get(food.id) ?? {};

      for (const deduction of plan.deductions) {
        const remaining = clampZero(deduction.quantityAfter);
        const lot = lots.find((candidate) => candidate.id === deduction.inventoryItemId);
        // nutrition comes from the product actually used, in its own units
        const usedFood = (lot && foodById.get(lot.foodReferenceId)) ?? food;
        const usedCtx = lot ? lotContext(lot, food.id) : ctx;
        await tx.inventoryItem.update({
          where: { id: deduction.inventoryItemId },
          data: { quantity: remaining },
        });

        const totals = nutritionFor(deduction.quantityDeducted, deduction.unit, usedFood, usedCtx);
        const log = await tx.consumptionLog.create({
          data: {
            userId,
            inventoryItemId: deduction.inventoryItemId,
            // log the product actually used, not the generic ingredient
            foodReferenceId: lot?.foodReferenceId ?? food.id,
            quantityConsumed: deduction.quantityDeducted,
            unit: deduction.unit,
            source: 'recipe',
            recipeId: recipe.id,
            cookEventId,
            mealSlot,
            calories: totals.calories,
            proteinGrams: totals.protein,
            carbsGrams: totals.carbs,
            fatGrams: totals.fat,
          },
        });

        result.consumptionLogIds.push(log.id);
        result.deductions.push({
          foodReferenceId: food.id,
          name: food.name,
          quantityDeducted: roundQuantity(deduction.quantityDeducted),
          unit: deduction.unit,
          remaining: roundQuantity(remaining),
          inventoryItemId: deduction.inventoryItemId,
          depleted: remaining === 0,
        });
        result.caloriesLogged =
          result.caloriesLogged === null || totals.calories === null
            ? null
            : result.caloriesLogged + totals.calories;
      }
    }

    // Portions you are not eating now go in the fridge as their own pantry item,
    // and only what is actually eaten counts towards today's calories.
    const servingsCooked = servings ?? recipe.servings;
    const keep = Math.min(Math.max(0, keepServings), servingsCooked);

    if (keep > 0 && result.caloriesLogged !== null) {
      const perServing = result.caloriesLogged / Math.max(1, servingsCooked);
      result.leftovers = await storeLeftovers(
        userId,
        {
          recipeId: recipe.id,
          recipeName: recipe.name,
          servings: keep,
          caloriesPerServing: roundQuantity(perServing),
        },
        tx,
      );

      // the diary should show the portion eaten, not the whole tray
      const eatenShare = (servingsCooked - keep) / servingsCooked;
      for (const logId of result.consumptionLogIds) {
        const log = await tx.consumptionLog.findUnique({ where: { id: logId } });
        if (!log) continue;
        await tx.consumptionLog.update({
          where: { id: logId },
          data: {
            calories: log.calories === null ? null : log.calories * eatenShare,
            proteinGrams: log.proteinGrams === null ? null : log.proteinGrams * eatenShare,
            carbsGrams: log.carbsGrams === null ? null : log.carbsGrams * eatenShare,
            fatGrams: log.fatGrams === null ? null : log.fatGrams * eatenShare,
          },
        });
      }
      result.caloriesLogged = roundQuantity(result.caloriesLogged * eatenShare);
    }

    // cooking is when things usually run out — put those on the shopping list
    for (const deduction of result.deductions) {
      if (!deduction.depleted) continue;
      const lowStock = await checkLowStock(userId, deduction.inventoryItemId, tx);
      if (lowStock.added && lowStock.name) result.ranOut.push({ name: lowStock.name });
    }

    if (result.caloriesLogged !== null) result.caloriesLogged = roundQuantity(result.caloriesLogged);
    result.cookEventId = cookEventId;
    return result;
  });
}
