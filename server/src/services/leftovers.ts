/**
 * Leftovers.
 *
 * You cook a lasagne for four and eat one portion. Without this the other three
 * simply vanish from the app — food you own, that it has forgotten, which is a
 * hole straight through the middle of "enter it once".
 *
 * The trick is not to invent a new kind of thing. A cooked dish becomes an
 * ordinary catalog entry measured in servings, and the portions become an
 * ordinary pantry item. Everything that already works then works for them:
 * expiry warnings, eating one, throwing one out, calories, the waste log. Eating
 * one cookie out of twenty-four is the same operation as eating one egg.
 */
import type { Tx } from '../db.js';
import { prisma } from '../db.js';
import { normalizeName } from './matching.js';
import { roundQuantity } from './units.js';

/**
 * How long a cooked dish keeps in the fridge. Deliberately short: leftovers are
 * the thing people most often find furry at the back of a shelf.
 */
const LEFTOVER_FRIDGE_DAYS = 3;

export interface LeftoverInput {
  recipeId: string;
  recipeName: string;
  /** portions going in the fridge, not the ones eaten now */
  servings: number;
  /** calories in ONE serving, already worked out from the ingredients */
  caloriesPerServing: number | null;
  proteinPerServing?: number | null;
  carbsPerServing?: number | null;
  fatPerServing?: number | null;
}

/**
 * The catalog row for a cooked dish. One per recipe, reused every time it is
 * cooked, with the nutrition refreshed from the most recent cook.
 */
export async function cookedDishFood(input: LeftoverInput, db: Tx = prisma) {
  const existing = await db.foodReference.findFirst({
    where: { cookedFromRecipeId: input.recipeId },
  });

  const data = {
    name: input.recipeName,
    nameNorm: normalizeName(input.recipeName),
    source: 'cooked',
    category: 'Leftovers',
    defaultUnit: 'serving',
    caloriesPerUnit: input.caloriesPerServing,
    proteinPerUnit: input.proteinPerServing ?? null,
    carbsPerUnit: input.carbsPerServing ?? null,
    fatPerUnit: input.fatPerServing ?? null,
    cookedFromRecipeId: input.recipeId,
  };

  if (existing) return db.foodReference.update({ where: { id: existing.id }, data });
  return db.foodReference.create({ data });
}

export interface StoredLeftovers {
  inventoryItemId: string;
  name: string;
  servings: number;
  caloriesPerServing: number | null;
  expiresOn: string;
}

/** Put the portions you are not eating now into the fridge. */
export async function storeLeftovers(
  userId: string,
  input: LeftoverInput,
  db: Tx = prisma,
): Promise<StoredLeftovers | null> {
  if (!(input.servings > 0)) return null;

  const food = await cookedDishFood(input, db);

  const expiration = new Date();
  expiration.setHours(12, 0, 0, 0);
  expiration.setDate(expiration.getDate() + LEFTOVER_FRIDGE_DAYS);

  const item = await db.inventoryItem.create({
    data: {
      userId,
      foodReferenceId: food.id,
      quantity: input.servings,
      unit: 'serving',
      expirationDate: expiration,
      storageLocation: 'fridge',
      isLeftover: true,
    },
  });

  return {
    inventoryItemId: item.id,
    name: food.name,
    servings: roundQuantity(input.servings),
    caloriesPerServing: food.caloriesPerUnit === null ? null : roundQuantity(food.caloriesPerUnit),
    expiresOn: expiration.toISOString(),
  };
}

/** Everything currently sitting in the fridge as portions of something cooked. */
export async function listLeftovers(userId: string, db: Tx = prisma) {
  const items = await db.inventoryItem.findMany({
    where: { userId, isLeftover: true, quantity: { gt: 0 } },
    include: { foodReference: true },
    orderBy: { expirationDate: 'asc' },
  });

  return items.map((item) => ({
    id: item.id,
    name: item.foodReference.name,
    servings: roundQuantity(item.quantity),
    caloriesPerServing:
      item.foodReference.caloriesPerUnit === null
        ? null
        : roundQuantity(item.foodReference.caloriesPerUnit),
    expirationDate: item.expirationDate?.toISOString() ?? null,
    recipeId: item.foodReference.cookedFromRecipeId,
  }));
}
