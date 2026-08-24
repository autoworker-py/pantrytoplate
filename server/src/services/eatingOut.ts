/**
 * Eating out: calories that never touch the pantry.
 *
 * A Costco hot dog is not inventory — you never owned it, and logging it must
 * not create a pantry item you then have to delete. So these write a
 * consumption log with no inventory_item_id, which the schema already allows.
 *
 * Quick manual entries ("Diner burger, 850 kcal") are saved to the catalog as
 * manual foods, so the second time it is one tap from Recents rather than
 * another round of typing.
 */
import { prisma, type Tx } from '../db.js';
import { badRequest, notFound } from '../errors.js';
import { loadConvertContext } from './conversions.js';
import { nutritionFor } from './nutrition.js';
import { normalizeName } from './matching.js';
import { normalizeUnit, roundQuantity } from './units.js';
import { searchLocalFoods } from './foodRef.js';

export interface EatOutInput {
  foodReferenceId?: string;
  /** free-text name, for a food not in any catalog */
  name?: string;
  quantity?: number;
  unit?: string;
  mealSlot?: string;
  /** only used when creating a brand new manual entry */
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
}

export async function logEatingOut(userId: string, input: EatOutInput, db: Tx = prisma) {
  const quantity = input.quantity ?? 1;
  if (!(quantity > 0)) throw badRequest('Quantity must be greater than zero.');

  let foodReferenceId = input.foodReferenceId;

  if (!foodReferenceId) {
    if (!input.name?.trim()) throw badRequest('Provide a food to log, or a name and calories.');

    const nameNorm = normalizeName(input.name);
    const existing = await db.foodReference.findFirst({ where: { nameNorm } });

    if (existing) {
      foodReferenceId = existing.id;
    } else {
      if (input.calories === undefined || input.calories === null) {
        throw badRequest(
          `We don't have nutrition for "${input.name}". Add the calories and we'll remember it next time.`,
          'calories_required',
        );
      }
      // one "serving" is whatever the user just ate
      const created = await db.foodReference.create({
        data: {
          name: input.name.trim(),
          nameNorm,
          source: 'manual',
          category: 'Eating out',
          defaultUnit: 'serving',
          caloriesPerUnit: input.calories,
          proteinPerUnit: input.protein ?? null,
          carbsPerUnit: input.carbs ?? null,
          fatPerUnit: input.fat ?? null,
        },
      });
      foodReferenceId = created.id;
    }
  }

  const food = await db.foodReference.findUnique({ where: { id: foodReferenceId } });
  if (!food) throw notFound('Food not found.');

  const unit = normalizeUnit(input.unit ?? food.defaultUnit);
  const ctx = await loadConvertContext(food, db);
  const totals = nutritionFor(quantity, unit, food, ctx);

  const log = await db.consumptionLog.create({
    data: {
      userId,
      inventoryItemId: null,
      foodReferenceId: food.id,
      quantityConsumed: quantity,
      unit,
      source: 'eating_out',
      mealSlot: input.mealSlot ?? 'snack',
      calories: totals.calories,
      proteinGrams: totals.protein,
      carbsGrams: totals.carbs,
      fatGrams: totals.fat,
    },
  });

  return {
    id: log.id,
    name: food.name,
    brand: food.brand,
    quantity: roundQuantity(quantity),
    unit,
    calories: totals.calories === null ? null : roundQuantity(totals.calories),
    macros: {
      protein: totals.protein === null ? null : roundQuantity(totals.protein),
      carbs: totals.carbs === null ? null : roundQuantity(totals.carbs),
      fat: totals.fat === null ? null : roundQuantity(totals.fat),
    },
    mealSlot: log.mealSlot,
  };
}

/** Most recently eaten-out foods, so the repeat order is one tap. */
export async function recentEatingOut(userId: string, limit = 8, db: Tx = prisma) {
  const logs = await db.consumptionLog.findMany({
    where: { userId, source: 'eating_out' },
    include: { foodReference: true },
    orderBy: { consumedAt: 'desc' },
    take: 60,
  });

  const seen = new Map<string, (typeof logs)[number]>();
  for (const log of logs) {
    if (!seen.has(log.foodReferenceId)) seen.set(log.foodReferenceId, log);
  }

  return [...seen.values()].slice(0, limit).map((log) => ({
    foodReferenceId: log.foodReferenceId,
    name: log.foodReference.name,
    brand: log.foodReference.brand,
    quantity: roundQuantity(log.quantityConsumed),
    unit: log.unit,
    calories: log.calories === null ? null : roundQuantity(log.calories),
    lastEaten: log.consumedAt.toISOString(),
  }));
}

/**
 * Search for something you ate out. Branded and restaurant foods rank above
 * raw ingredients — nobody eating out is looking for "Egg, whole, raw".
 */
export async function searchEatOutFoods(query: string, limit = 12, db: Tx = prisma) {
  const foods = await searchLocalFoods(query, limit * 2, db);
  const scored = foods
    .map((food) => ({
      food,
      rank: food.brand ? 0 : food.category === 'Eating out' ? 0 : food.barcode ? 1 : 2,
    }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit);

  return scored.map(({ food }) => ({
    id: food.id,
    name: food.name,
    brand: food.brand,
    category: food.category,
    defaultUnit: food.defaultUnit,
    caloriesPerUnit: food.caloriesPerUnit === null ? null : roundQuantity(food.caloriesPerUnit),
  }));
}
