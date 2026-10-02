/**
 * Eating out: calories that never touch the pantry.
 *
 * A Costco hot dog is not inventory — you never owned it, and logging it must
 * not create a pantry item you then have to delete. So these write a
 * consumption log with no inventory_item_id, which the schema already allows.
 *
 * Quick manual entries ("Diner burger, 850 kcal") are saved as the person's own
 * foods, so the second time it is one tap from Recents rather than another
 * round of typing. They are nobody else's: what you ate out and what you
 * guessed it weighed in at is yours alone.
 */
import { prisma, type Tx } from '../db.js';
import { badRequest, notFound } from '../errors.js';
import { loadConvertContext } from './conversions.js';
import { nutritionColumns, nutritionFor } from './nutrition.js';
import { normalizeName } from './matching.js';
import { normalizeUnit, roundQuantity } from './units.js';
import { searchLocalFoods } from './foodRef.js';
import { createId } from '../ids.js';

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
    // the person's own entry first, then the shared catalog; never someone else's,
    // and not the meals-out others typed in before these became private
    const existing =
      (await db.foodReference.findFirst({ where: { nameNorm, ownerId: userId } })) ??
      (await db.foodReference.findFirst({ where: { nameNorm, ownerId: null, NOT: { category: 'Eating out' } } }));

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
          ownerId: userId,
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
      ...nutritionColumns(totals),
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

export interface PlateLine {
  name: string;
  /** what the photo reader judged it weighed; 0 when it couldn't say */
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number | null;
  sugar?: number | null;
  satFat?: number | null;
  /** milligrams */
  sodium?: number | null;
}

/**
 * A plate eaten out, logged item by item under one meal name, so the diary can
 * show it as one meal and the person can say they left the fries. Each item
 * becomes the person's own food, measured by the gram where the reader gave a
 * weight, so anything they take home goes in the fridge with its nutrition.
 */
export async function logEatOutMeal(userId: string, input: { name: string; mealSlot?: string; items: PlateLine[] }, db: Tx = prisma) {
  if (!input.items.length) throw badRequest('There is nothing on that plate to log.');
  const mealId = createId();
  const mealSlot = input.mealSlot ?? 'snack';
  const ids: string[] = [];

  for (const item of input.items) {
    const byWeight = item.grams > 0;
    const per = (value: number | null | undefined) => (value === null || value === undefined ? null : byWeight ? value / item.grams : value);
    const nutrition = {
      defaultUnit: byWeight ? 'g' : 'serving',
      caloriesPerUnit: per(item.calories),
      proteinPerUnit: per(item.protein),
      carbsPerUnit: per(item.carbs),
      fatPerUnit: per(item.fat),
      fiberPerUnit: per(item.fiber),
      sugarPerUnit: per(item.sugar),
      satFatPerUnit: per(item.satFat),
      sodiumPerUnit: per(item.sodium),
    };
    const nameNorm = normalizeName(item.name);
    // the person's own food of that name, kept to the latest reading of it
    const own = await db.foodReference.findFirst({ where: { nameNorm, ownerId: userId } });
    const food = own
      ? await db.foodReference.update({ where: { id: own.id }, data: nutrition })
      : await db.foodReference.create({
          data: { name: item.name.trim(), nameNorm, source: 'manual', category: 'Eating out', ownerId: userId, ...nutrition },
        });

    const log = await db.consumptionLog.create({
      data: {
        userId,
        inventoryItemId: null,
        foodReferenceId: food.id,
        quantityConsumed: byWeight ? item.grams : 1,
        unit: byWeight ? 'g' : 'serving',
        source: 'eating_out',
        mealSlot,
        cookEventId: mealId,
        mealName: input.name.trim(),
        calories: item.calories,
        proteinGrams: item.protein,
        carbsGrams: item.carbs,
        fatGrams: item.fat,
        fiberGrams: item.fiber ?? null,
        sugarGrams: item.sugar ?? null,
        satFatGrams: item.satFat ?? null,
        sodiumMg: item.sodium ?? null,
      },
    });
    ids.push(log.id);
  }

  return {
    id: mealId,
    name: input.name.trim(),
    calories: roundQuantity(input.items.reduce((sum, item) => sum + item.calories, 0)),
    items: ids.length,
    mealSlot,
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
export async function searchEatOutFoods(query: string, limit = 12, db: Tx = prisma, userId?: string) {
  const foods = await searchLocalFoods(query, limit * 2, db, userId);
  const scored = foods
    // meals out others typed in before those became private stay out of sight
    .filter((food) => !(food.ownerId === null && food.category === 'Eating out'))
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
