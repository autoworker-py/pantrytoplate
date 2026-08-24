/**
 * "What is this for?"
 *
 * A shopping list that says "Unsalted Butter — 1.4 tbsp" is precise and useless:
 * you buy a pack of butter, not a tablespoon. What actually helps in a shop is
 * knowing *why* it is on the list and what else it unlocks — so the row shows
 * the name, and opening it explains "1 tbsp for Scrambled Eggs on Toast", plus
 * the other things you could make with it.
 *
 * Also powers scanning a product in a shop to see what it is good for.
 */
import { prisma, type Tx } from '../db.js';
import { roundQuantity } from './units.js';
import { visibleToUser } from './recipeMatch.js';

export interface IngredientUse {
  recipeId: string;
  recipeName: string;
  quantity: number;
  unit: string;
  totalMinutes: number | null;
  /** how many other ingredients this recipe still needs */
  otherGaps: number;
  canMakeWithThis: boolean;
}

export interface IngredientUses {
  foodReferenceId: string;
  foodName: string;
  /** recipes that put this on your list, most relevant first */
  uses: IngredientUse[];
  totalRecipes: number;
}

/**
 * Recipes that call for a food, ranked by how close buying it gets you to
 * actually cooking them.
 */
export async function ingredientUses(
  userId: string,
  foodReferenceId: string,
  limit = 8,
  db: Tx = prisma,
): Promise<IngredientUses | null> {
  const food = await db.foodReference.findUnique({ where: { id: foodReferenceId } });
  if (!food) return null;

  // a branded product is used wherever its generic ingredient is
  const ingredientId = food.canonicalId ?? food.id;

  const rows = await db.recipeIngredient.findMany({
    where: { foodReferenceId: ingredientId, recipe: visibleToUser(userId) },
    include: { recipe: { include: { ingredients: true } } },
    take: 60,
  });
  if (rows.length === 0) {
    return { foodReferenceId: ingredientId, foodName: food.name, uses: [], totalRecipes: 0 };
  }

  // what the user already owns, so "what else do I need" is answerable
  const lots = await db.inventoryItem.findMany({
    where: { userId, quantity: { gt: 0 } },
    select: { foodReferenceId: true, foodReference: { select: { canonicalId: true } } },
  });
  const owned = new Set(lots.map((lot) => lot.foodReference.canonicalId ?? lot.foodReferenceId));
  // buying this one is the premise of the question
  owned.add(ingredientId);

  const uses: IngredientUse[] = rows.map((row) => {
    const otherGaps = row.recipe.ingredients.filter((i) => !owned.has(i.foodReferenceId)).length;
    const total =
      row.recipe.prepMinutes === null && row.recipe.cookMinutes === null
        ? null
        : (row.recipe.prepMinutes ?? 0) + (row.recipe.cookMinutes ?? 0);

    return {
      recipeId: row.recipeId,
      recipeName: row.recipe.name,
      quantity: roundQuantity(row.quantityRequired),
      unit: row.unitRequired,
      totalMinutes: total,
      otherGaps,
      canMakeWithThis: otherGaps === 0,
    };
  });

  // the ones this purchase actually completes come first
  uses.sort((a, b) => a.otherGaps - b.otherGaps || a.recipeName.localeCompare(b.recipeName));

  return {
    foodReferenceId: ingredientId,
    foodName: (await db.foodReference.findUnique({ where: { id: ingredientId } }))?.name ?? food.name,
    uses: uses.slice(0, limit),
    totalRecipes: rows.length,
  };
}
