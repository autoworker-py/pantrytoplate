/**
 * Shopping list. Two entry points: gaps found by recipe matching (one tap), and
 * free-text manual additions. Checking an item off can push it straight into
 * inventory, which closes the loop back to "enter it once".
 */
import { prisma } from '../db.js';
import type { Tx } from '../db.js';
import { badRequest, notFound } from '../errors.js';
import { normalizeUnit, roundQuantity } from './units.js';
import { shoppingQuantity } from './shoppingQuantity.js';
import { getRecipeForUser } from './recipeMatch.js';

export async function listShoppingList(userId: string, db: Tx = prisma) {
  const items = await db.shoppingListItem.findMany({
    where: { userId },
    include: { foodReference: true },
    orderBy: [{ isChecked: 'asc' }, { createdAt: 'desc' }],
  });
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    quantityNeeded: roundQuantity(item.quantityNeeded),
    unit: item.unit,
    isChecked: item.isChecked,
    addedFrom: item.addedFrom,
    createdAt: item.createdAt.toISOString(),
    foodReferenceId: item.foodReferenceId,
    food: item.foodReference
      ? { id: item.foodReference.id, name: item.foodReference.name, brand: item.foodReference.brand }
      : null,
  }));
}

export interface AddShoppingItemInput {
  name: string;
  quantityNeeded: number;
  unit: string;
  foodReferenceId?: string | null;
  addedFrom?: 'manual' | 'recipe_gap';
}

export async function addShoppingItem(userId: string, input: AddShoppingItemInput, db: Tx = prisma) {
  if (!input.name.trim()) throw badRequest('Item name is required.');
  return db.shoppingListItem.create({
    data: {
      userId,
      name: input.name.trim(),
      quantityNeeded: input.quantityNeeded > 0 ? input.quantityNeeded : 1,
      unit: normalizeUnit(input.unit),
      foodReferenceId: input.foodReferenceId ?? null,
      addedFrom: input.addedFrom ?? 'manual',
    },
  });
}

/**
 * "Add missing to shopping list" for a recipe. Existing unchecked entries for
 * the same food are raised to the larger quantity rather than duplicated.
 */
export async function addRecipeGaps(
  userId: string,
  recipeId: string,
  servings: number | null,
  db: Tx = prisma,
) {
  const recipe = await getRecipeForUser(userId, recipeId, servings, db);
  if (!recipe) throw notFound('Recipe not found.');

  const gaps = recipe.ingredients.filter((i) => i.status !== 'ok');
  const results: Array<{ name: string; quantity: number; unit: string; action: 'added' | 'raised' }> = [];

  for (const gap of gaps) {
    // for a short ingredient buy the shortfall; for missing/unconvertible buy
    // the full amount the recipe calls for — then round it to something you can
    // actually pick off a shelf
    const raw = gap.status === 'short' && gap.shortfall > 0 ? gap.shortfall : gap.requiredQuantity;
    const unit = normalizeUnit(gap.requiredUnit);
    const needed = shoppingQuantity(raw, unit);

    const existing = await db.shoppingListItem.findFirst({
      where: { userId, isChecked: false, foodReferenceId: gap.foodReferenceId, unit },
    });

    if (existing) {
      if (needed > existing.quantityNeeded) {
        await db.shoppingListItem.update({ where: { id: existing.id }, data: { quantityNeeded: needed } });
        results.push({ name: gap.name, quantity: roundQuantity(needed), unit, action: 'raised' });
      }
      continue;
    }

    await db.shoppingListItem.create({
      data: {
        userId,
        foodReferenceId: gap.foodReferenceId,
        name: gap.name,
        quantityNeeded: needed,
        unit,
        addedFrom: 'recipe_gap',
      },
    });
    results.push({ name: gap.name, quantity: roundQuantity(needed), unit, action: 'added' });
  }

  return { recipeName: recipe.name, added: results };
}

export async function setChecked(userId: string, itemId: string, isChecked: boolean, db: Tx = prisma) {
  const existing = await db.shoppingListItem.findFirst({ where: { id: itemId, userId } });
  if (!existing) throw notFound('Shopping list item not found.');
  return db.shoppingListItem.update({ where: { id: itemId }, data: { isChecked } });
}

export async function removeShoppingItem(userId: string, itemId: string, db: Tx = prisma) {
  const existing = await db.shoppingListItem.findFirst({ where: { id: itemId, userId } });
  if (!existing) throw notFound('Shopping list item not found.');
  await db.shoppingListItem.delete({ where: { id: itemId } });
}

export async function clearChecked(userId: string, db: Tx = prisma) {
  const { count } = await db.shoppingListItem.deleteMany({ where: { userId, isChecked: true } });
  return { removed: count };
}

/**
 * Check off + stock: the item goes into inventory in the same transaction it is
 * marked bought, so the two can never disagree.
 */
export async function checkOffAndStock(
  userId: string,
  itemId: string,
  input: { quantity?: number; unit?: string; expirationDate?: Date | null },
) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.shoppingListItem.findFirst({
      where: { id: itemId, userId },
      include: { foodReference: true },
    });
    if (!item) throw notFound('Shopping list item not found.');

    let foodReferenceId = item.foodReferenceId;
    if (!foodReferenceId) {
      // free-text item: create a manual catalog entry so it can be tracked
      const { findOrCreateFoodByName } = await import('./foodRef.js');
      const created = await findOrCreateFoodByName(
        { name: item.name, defaultUnit: input.unit ?? item.unit },
        tx,
      );
      foodReferenceId = created.food.id;
      await tx.shoppingListItem.update({ where: { id: item.id }, data: { foodReferenceId } });
    }

    // no date given? estimate one from typical shelf life rather than leaving
    // the field empty, which is what makes expiry tracking useless elsewhere
    const food = await tx.foodReference.findUniqueOrThrow({ where: { id: foodReferenceId } });
    let expirationDate = input.expirationDate ?? null;
    let expirationEstimated = false;
    if (!expirationDate) {
      const { estimateShelfLife } = await import('./shelfLife.js');
      const estimate = await estimateShelfLife(food, 'pantry', tx);
      expirationDate = estimate?.expirationDate ?? null;
      expirationEstimated = estimate !== null;
    }

    const inventoryItem = await tx.inventoryItem.create({
      data: {
        userId,
        foodReferenceId,
        quantity: input.quantity && input.quantity > 0 ? input.quantity : item.quantityNeeded,
        unit: normalizeUnit(input.unit ?? item.unit),
        expirationDate,
      },
      include: { foodReference: true },
    });

    await tx.shoppingListItem.update({ where: { id: item.id }, data: { isChecked: true } });

    return {
      shoppingListItemId: item.id,
      inventoryItemId: inventoryItem.id,
      name: inventoryItem.foodReference.name,
      quantity: roundQuantity(inventoryItem.quantity),
      unit: inventoryItem.unit,
      expirationDate: inventoryItem.expirationDate?.toISOString() ?? null,
      expirationEstimated,
    };
  });
}
