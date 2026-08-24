/**
 * The food diary — calories and macros for a day.
 *
 * Everything here is a *read* over consumption_logs. The user never types a
 * calorie number: it was computed from the food's nutrition data at the moment
 * they logged it. Entries whose unit could not be converted to the food's
 * nutrition basis are reported separately rather than being counted as zero,
 * because silently treating unknown as zero is how a calorie tracker lies.
 */
import { prisma, type Tx } from '../db.js';
import { notFound } from '../errors.js';
import { roundQuantity } from './units.js';
import { getSettings } from './settings.js';

export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

function dayBounds(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export interface DiaryTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** Share of calories from each macro — what the donut chart draws. */
export function macroSplit(totals: DiaryTotals) {
  const fromProtein = totals.protein * 4;
  const fromCarbs = totals.carbs * 4;
  const fromFat = totals.fat * 9;
  const sum = fromProtein + fromCarbs + fromFat;
  if (sum <= 0) return { protein: 0, carbs: 0, fat: 0, hasData: false };
  return {
    protein: Math.round((fromProtein / sum) * 100),
    carbs: Math.round((fromCarbs / sum) * 100),
    fat: Math.round((fromFat / sum) * 100),
    hasData: true,
  };
}

export async function dailySummary(userId: string, date = new Date(), db: Tx = prisma) {
  const { start, end } = dayBounds(date);
  const [logs, settings] = await Promise.all([
    db.consumptionLog.findMany({
      where: { userId, consumedAt: { gte: start, lt: end } },
      include: { foodReference: true, recipe: true },
      orderBy: { consumedAt: 'desc' },
    }),
    getSettings(userId),
  ]);

  const totals: DiaryTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  let unknownCalorieEntries = 0;
  for (const log of logs) {
    if (log.calories === null) unknownCalorieEntries += 1;
    else totals.calories += log.calories;
    totals.protein += log.proteinGrams ?? 0;
    totals.carbs += log.carbsGrams ?? 0;
    totals.fat += log.fatGrams ?? 0;
  }

  /**
   * A cook writes one row per ingredient. Nobody thinks of dinner as six
   * separate foods, so rows sharing a cookEventId collapse into one meal entry;
   * the ingredients are still there when you open it.
   */
  interface Entry {
    id: string;
    kind: 'item' | 'meal';
    name: string;
    brand: string | null;
    quantity: number;
    unit: string;
    calories: number | null;
    protein: number | null;
    carbs: number | null;
    fat: number | null;
    source: string;
    mealSlot: string;
    recipeId: string | null;
    recipeName: string | null;
    ingredientCount: number;
    consumedAt: string;
  }

  const entries: Entry[] = [];
  const mealsByEvent = new Map<string, Entry>();

  for (const log of logs) {
    if (log.cookEventId && log.recipe) {
      const existing = mealsByEvent.get(log.cookEventId);
      if (existing) {
        existing.calories =
          existing.calories === null || log.calories === null ? existing.calories : existing.calories + log.calories;
        existing.protein = (existing.protein ?? 0) + (log.proteinGrams ?? 0);
        existing.carbs = (existing.carbs ?? 0) + (log.carbsGrams ?? 0);
        existing.fat = (existing.fat ?? 0) + (log.fatGrams ?? 0);
        existing.ingredientCount += 1;
        continue;
      }
      const meal: Entry = {
        id: log.cookEventId,
        kind: 'meal',
        name: log.recipe.name,
        brand: null,
        quantity: 1,
        unit: 'serving',
        calories: log.calories,
        protein: log.proteinGrams ?? 0,
        carbs: log.carbsGrams ?? 0,
        fat: log.fatGrams ?? 0,
        source: 'recipe',
        mealSlot: log.mealSlot,
        recipeId: log.recipeId,
        recipeName: log.recipe.name,
        ingredientCount: 1,
        consumedAt: log.consumedAt.toISOString(),
      };
      mealsByEvent.set(log.cookEventId, meal);
      entries.push(meal);
      continue;
    }

    entries.push({
      id: log.id,
      kind: 'item',
      name: log.foodReference.name,
      brand: log.foodReference.brand,
      quantity: roundQuantity(log.quantityConsumed),
      unit: log.unit,
      calories: log.calories === null ? null : roundQuantity(log.calories),
      protein: log.proteinGrams === null ? null : roundQuantity(log.proteinGrams),
      carbs: log.carbsGrams === null ? null : roundQuantity(log.carbsGrams),
      fat: log.fatGrams === null ? null : roundQuantity(log.fatGrams),
      source: log.source,
      mealSlot: log.mealSlot,
      recipeId: log.recipeId,
      recipeName: log.recipe?.name ?? null,
      ingredientCount: 1,
      consumedAt: log.consumedAt.toISOString(),
    });
  }

  for (const meal of mealsByEvent.values()) {
    meal.calories = meal.calories === null ? null : roundQuantity(meal.calories);
    meal.protein = meal.protein === null ? null : roundQuantity(meal.protein);
    meal.carbs = meal.carbs === null ? null : roundQuantity(meal.carbs);
    meal.fat = meal.fat === null ? null : roundQuantity(meal.fat);
  }

  // group by meal slot so the day reads like a diary rather than a ledger
  const meals = MEAL_SLOTS.map((slot) => {
    const slotEntries = entries.filter((entry) => entry.mealSlot === slot);
    return {
      slot,
      entries: slotEntries,
      calories: roundQuantity(slotEntries.reduce((sum, e) => sum + (e.calories ?? 0), 0)),
    };
  });

  return {
    date: start.toISOString().slice(0, 10),
    totalCalories: roundQuantity(totals.calories),
    macros: {
      protein: roundQuantity(totals.protein),
      carbs: roundQuantity(totals.carbs),
      fat: roundQuantity(totals.fat),
    },
    macroSplit: macroSplit(totals),
    targets: {
      calories: settings.dailyCalorieTarget,
      protein: settings.proteinTargetGrams,
      carbs: settings.carbsTargetGrams,
      fat: settings.fatTargetGrams,
    },
    caloriesRemaining: roundQuantity(settings.dailyCalorieTarget - totals.calories),
    entryCount: entries.length,
    unknownCalorieEntries,
    meals,
    entries,
  };
}

/**
 * One diary entry, broken down.
 *
 * `id` is either a single consumption log or a cookEventId — the diary shows a
 * cooked meal as one row, so opening it has to work from the meal's id and show
 * every ingredient that went into it.
 */
export async function entryDetail(userId: string, id: string, db: Tx = prisma) {
  const mealLogs = await db.consumptionLog.findMany({
    where: { userId, cookEventId: id },
    include: { foodReference: true, recipe: true, inventoryItem: true },
    orderBy: { calories: 'desc' },
  });

  if (mealLogs.length > 0) {
    const first = mealLogs[0]!;
    const sum = (pick: (log: (typeof mealLogs)[number]) => number | null) =>
      mealLogs.reduce((total, log) => total + (pick(log) ?? 0), 0);

    return {
      id,
      kind: 'meal' as const,
      name: first.recipe?.name ?? 'Cooked meal',
      brand: null,
      quantity: 1,
      unit: 'serving',
      source: 'recipe',
      mealSlot: first.mealSlot,
      consumedAt: first.consumedAt.toISOString(),
      calories: roundQuantity(sum((log) => log.calories)),
      macros: {
        protein: roundQuantity(sum((log) => log.proteinGrams)),
        carbs: roundQuantity(sum((log) => log.carbsGrams)),
        fat: roundQuantity(sum((log) => log.fatGrams)),
      },
      nutritionBasis: 'the ingredients this recipe used',
      canUndo: mealLogs.some((log) => log.inventoryItemId !== null),
      recipe: {
        id: first.recipeId ?? '',
        name: first.recipe?.name ?? 'Cooked meal',
        servings: first.recipe?.servings ?? 1,
        totalCalories: roundQuantity(sum((log) => log.calories)),
        ingredients: mealLogs.map((log) => ({
          name: log.foodReference.name,
          quantity: roundQuantity(log.quantityConsumed),
          unit: log.unit,
          calories: log.calories === null ? null : roundQuantity(log.calories),
          protein: log.proteinGrams === null ? null : roundQuantity(log.proteinGrams),
        })),
      },
    };
  }

  const log = await db.consumptionLog.findFirst({
    where: { id, userId },
    include: { foodReference: true, recipe: true, inventoryItem: true },
  });
  if (!log) throw notFound('Diary entry not found.');

  // an individual row from a cook still belongs to a meal — show the meal
  if (log.cookEventId) return entryDetail(userId, log.cookEventId, db);

  return {
    id: log.id,
    kind: 'item' as const,
    name: log.foodReference.name,
    brand: log.foodReference.brand,
    quantity: roundQuantity(log.quantityConsumed),
    unit: log.unit,
    source: log.source,
    mealSlot: log.mealSlot,
    consumedAt: log.consumedAt.toISOString(),
    calories: log.calories === null ? null : roundQuantity(log.calories),
    macros: {
      protein: log.proteinGrams === null ? null : roundQuantity(log.proteinGrams),
      carbs: log.carbsGrams === null ? null : roundQuantity(log.carbsGrams),
      fat: log.fatGrams === null ? null : roundQuantity(log.fatGrams),
    },
    nutritionBasis:
      log.foodReference.caloriesPerUnit === null
        ? null
        : `${roundQuantity(log.foodReference.caloriesPerUnit)} kcal per ${log.foodReference.defaultUnit}`,
    canUndo: log.inventoryItemId !== null,
    recipe: null,
  };
}

/**
 * Undo a diary entry: delete the log(s) and put the food back.
 *
 * Undoing a cooked meal undoes the whole meal — you did not half-cook it — and
 * the restore runs in one transaction so the diary and pantry cannot disagree.
 */
export interface UndoResult {
  undone: boolean;
  name: string;
  caloriesRemoved: number;
  restoredToPantry: { name: string; quantity: number; unit: string } | null;
  restoredItems: Array<{ name: string; quantity: number; unit: string }>;
}

export async function undoEntry(userId: string, id: string): Promise<UndoResult> {
  return prisma.$transaction(async (tx) => {
    const mealLogs = await tx.consumptionLog.findMany({
      where: { userId, cookEventId: id },
      include: { foodReference: true, inventoryItem: true, recipe: true },
    });

    // undoing one row of a cook undoes the whole meal — you did not half-cook it
    const single =
      mealLogs.length > 0
        ? null
        : await tx.consumptionLog.findFirst({ where: { id, userId }, select: { cookEventId: true } });
    if (single?.cookEventId) return undoEntry(userId, single.cookEventId);

    const logs =
      mealLogs.length > 0
        ? mealLogs
        : await tx.consumptionLog
            .findFirst({
              where: { id, userId },
              include: { foodReference: true, inventoryItem: true, recipe: true },
            })
            .then((log) => (log ? [log] : []));

    if (logs.length === 0) throw notFound('Diary entry not found.');

    const { loadConvertContext } = await import('./conversions.js');
    const { convert } = await import('./units.js');

    const restored: Array<{ name: string; quantity: number; unit: string }> = [];
    let caloriesRemoved = 0;

    for (const log of logs) {
      caloriesRemoved += log.calories ?? 0;
      if (!log.inventoryItem) continue;

      // the log holds the amount in the unit it was logged in; the lot was
      // decremented in the lot's own unit, so convert back the same way
      const ctx = await loadConvertContext(log.foodReference, tx);
      const inLotUnits = convert(log.quantityConsumed, log.unit, log.inventoryItem.unit, ctx);
      if (!inLotUnits.ok) continue;

      const updated = await tx.inventoryItem.update({
        where: { id: log.inventoryItem.id },
        data: { quantity: log.inventoryItem.quantity + inLotUnits.value },
      });
      restored.push({
        name: log.foodReference.name,
        quantity: roundQuantity(updated.quantity),
        unit: updated.unit,
      });
    }

    await tx.consumptionLog.deleteMany({ where: { id: { in: logs.map((log) => log.id) } } });

    const first = logs[0]!;
    const isMeal = mealLogs.length > 0;

    return {
      undone: true,
      name: isMeal ? first.recipe?.name ?? 'Cooked meal' : first.foodReference.name,
      caloriesRemoved: roundQuantity(caloriesRemoved),
      restoredToPantry: isMeal ? null : (restored[0] ?? null),
      restoredItems: restored,
    };
  });
}

/** Last N days of calorie totals, oldest first. */
export async function calorieHistory(userId: string, days = 7, db: Tx = prisma) {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));

  const logs = await db.consumptionLog.findMany({
    where: { userId, consumedAt: { gte: since } },
    select: { consumedAt: true, calories: true, proteinGrams: true },
  });

  const buckets = new Map<string, { calories: number; protein: number }>();
  for (let i = 0; i < days; i += 1) {
    const day = new Date(since);
    day.setDate(day.getDate() + i);
    buckets.set(day.toISOString().slice(0, 10), { calories: 0, protein: 0 });
  }
  for (const log of logs) {
    const key = new Date(log.consumedAt).toISOString().slice(0, 10);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.calories += log.calories ?? 0;
      bucket.protein += log.proteinGrams ?? 0;
    }
  }

  return [...buckets.entries()].map(([date, totals]) => ({
    date,
    totalCalories: roundQuantity(totals.calories),
    protein: roundQuantity(totals.protein),
  }));
}
