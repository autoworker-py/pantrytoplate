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
import type { FoodReference } from '@prisma/client';
import { badRequest, notFound } from '../errors.js';
import { roundQuantity } from './units.js';
import { scaleColumns, type NutritionColumns } from './nutrition.js';
import { getSettings } from './settings.js';
import { foodPoints, gradeOf, mixedGrade, type Grade } from './healthScore.js';
import { addDays, dayStart, localDay } from '../zone.js';

export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

/** A calendar day on the person's own clock (see zone.ts), as the instants it runs between. */
function dayBounds(day: string) {
  return { start: dayStart(day), end: dayStart(addDays(day, 1)) };
}

export interface DiaryTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

type Nutrients = Pick<NutritionColumns, 'fiberGrams' | 'sugarGrams' | 'satFatGrams' | 'sodiumMg'>;

/** Fiber, sugar, saturated fat (grams) and sodium (milligrams) added up; null when nothing logged says. */
export function nutrientsOf(logs: Nutrients[]) {
  const sum = (pick: (log: Nutrients) => number | null) =>
    logs.every((log) => pick(log) === null) ? null : roundQuantity(logs.reduce((total, log) => total + (pick(log) ?? 0), 0));
  return {
    fiber: sum((log) => log.fiberGrams),
    sugar: sum((log) => log.sugarGrams),
    satFat: sum((log) => log.satFatGrams),
    sodium: sum((log) => log.sodiumMg),
  };
}

/**
 * What the day's fiber, saturated fat and sodium are measured against, from the
 * Dietary Guidelines for Americans: 14 g of fiber per 1,000 kcal eaten, under
 * 10% of calories from saturated fat, under 2,300 mg of sodium. Sugar has no
 * line: the guideline is for added sugar, which a food's label total can't
 * separate out.
 */
export function nutrientGuides(calorieTarget: number) {
  return {
    fiber: Math.round((calorieTarget / 1000) * 14),
    satFat: Math.round((calorieTarget * 0.1) / 9),
    sodium: 2300,
  };
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

export async function dailySummary(userId: string, day = localDay(new Date()), db: Tx = prisma) {
  const { start, end } = dayBounds(day);
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
  const nutrients = nutrientsOf(logs);

  /**
   * A cook writes one row per ingredient, and a snapped plate one row per item.
   * Nobody thinks of dinner as six separate foods, so rows sharing a
   * cookEventId collapse into one meal entry; the parts are still there when
   * you open it.
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
    /** A to E, the Nutri-Score way; null when the food's figures can't say */
    grade: Grade | null;
  }

  const entries: Entry[] = [];
  const mealsByEvent = new Map<string, Entry>();
  // each meal's parts, so it can be graded as a whole
  const mealParts = new Map<string, Array<{ points: number | null; weight: number | null }>>();
  const dayParts: Array<{ points: number | null; weight: number | null }> = [];

  for (const log of logs) {
    const points = foodPoints(log.foodReference);
    dayParts.push({ points, weight: log.calories });
    const mealName = log.recipe?.name ?? log.mealName;
    if (log.cookEventId && mealName) {
      mealParts.set(log.cookEventId, [...(mealParts.get(log.cookEventId) ?? []), { points, weight: log.calories }]);
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
        name: mealName,
        brand: null,
        quantity: 1,
        unit: log.recipe ? 'serving' : 'meal',
        calories: log.calories,
        protein: log.proteinGrams ?? 0,
        carbs: log.carbsGrams ?? 0,
        fat: log.fatGrams ?? 0,
        source: log.recipe ? 'recipe' : log.source,
        mealSlot: log.mealSlot,
        recipeId: log.recipe ? log.recipeId : null,
        recipeName: log.recipe?.name ?? null,
        ingredientCount: 1,
        consumedAt: log.consumedAt.toISOString(),
        grade: null,
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
      grade: gradeOf(points),
    });
  }

  for (const meal of mealsByEvent.values()) {
    meal.grade = mixedGrade(mealParts.get(meal.id) ?? []);
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
    date: day,
    totalCalories: roundQuantity(totals.calories),
    macros: {
      protein: roundQuantity(totals.protein),
      carbs: roundQuantity(totals.carbs),
      fat: roundQuantity(totals.fat),
    },
    macroSplit: macroSplit(totals),
    nutrients,
    nutrientGuides: nutrientGuides(settings.dailyCalorieTarget),
    /** the day's food as a whole, A to E */
    grade: mixedGrade(dayParts),
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
    const totals = {
      consumedAt: first.consumedAt.toISOString(),
      calories: roundQuantity(sum((log) => log.calories)),
      macros: {
        protein: roundQuantity(sum((log) => log.proteinGrams)),
        carbs: roundQuantity(sum((log) => log.carbsGrams)),
        fat: roundQuantity(sum((log) => log.fatGrams)),
      },
      nutrients: nutrientsOf(mealLogs),
    };

    // a meal eaten out, logged item by item: the items are the receipt's lines
    if (!first.recipe) {
      const lines = mealLogs.map(lineOf).sort((a, b) => (b.fullCalories ?? 0) - (a.fullCalories ?? 0));
      return {
        id,
        kind: 'meal' as const,
        name: first.mealName ?? 'Meal out',
        brand: null,
        quantity: 1,
        unit: 'meal',
        source: first.source,
        mealSlot: first.mealSlot,
        ...totals,
        nutritionBasis: 'an estimate for each item',
        canUndo: false,
        recipe: null,
        lines,
      };
    }

    return {
      id,
      kind: 'meal' as const,
      name: first.recipe.name,
      brand: null,
      quantity: roundQuantity(first.servings ?? 1),
      unit: 'serving',
      source: 'recipe',
      mealSlot: first.mealSlot,
      ...totals,
      nutritionBasis: 'the ingredients this recipe used',
      canUndo: mealLogs.some((log) => log.inventoryItemId !== null),
      recipe: {
        id: first.recipeId ?? '',
        name: first.recipe.name,
        servings: first.recipe.servings,
        totalCalories: roundQuantity(sum((log) => log.calories)),
        ingredients: mealLogs.map((log) => ({
          name: log.foodReference.name,
          quantity: roundQuantity(log.quantityConsumed),
          unit: log.unit,
          calories: log.calories === null ? null : roundQuantity(log.calories),
          protein: log.proteinGrams === null ? null : roundQuantity(log.proteinGrams),
        })),
      },
      lines: null,
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
    nutrients: nutrientsOf([log]),
    nutritionBasis:
      log.foodReference.caloriesPerUnit === null
        ? null
        : `${roundQuantity(log.foodReference.caloriesPerUnit)} kcal per ${log.foodReference.defaultUnit}`,
    canUndo: log.inventoryItemId !== null,
    recipe: null,
    // something eaten out is a receipt of one line, so less of it can be eaten too
    lines: log.source === 'eating_out' && !log.inventoryItemId ? [lineOf(log)] : null,
  };
}

/** The line as first logged, kept once the person said they ate less of it. */
interface AsLogged extends NutritionColumns {
  quantityConsumed: number;
}
const asLoggedOf = (log: { asLogged: string | null }): AsLogged | null => (log.asLogged ? (JSON.parse(log.asLogged) as AsLogged) : null);
const columnsOf = (log: NutritionColumns): NutritionColumns => ({
  calories: log.calories,
  proteinGrams: log.proteinGrams,
  carbsGrams: log.carbsGrams,
  fatGrams: log.fatGrams,
  fiberGrams: log.fiberGrams,
  sugarGrams: log.sugarGrams,
  satFatGrams: log.satFatGrams,
  sodiumMg: log.sodiumMg,
});

/** One line of a receipt: what it was, what of it was eaten, and where the rest went. */
function lineOf(log: NutritionColumns & { id: string; quantityConsumed: number; unit: string; eatenShare: number | null; restTo: string | null; asLogged: string | null; foodReference: { name: string } }) {
  const before = asLoggedOf(log);
  const full = before ? before.calories : log.calories;
  return {
    id: log.id,
    name: log.foodReference.name,
    quantity: roundQuantity(before?.quantityConsumed ?? log.quantityConsumed),
    unit: log.unit,
    calories: log.calories === null ? null : roundQuantity(log.calories),
    fullCalories: full === null ? null : roundQuantity(full),
    share: log.eatenShare ?? 1,
    restTo: (log.restTo as 'pantry' | 'bin' | null) ?? null,
  };
}

/** Take back where a line's rest went: the leftover, if nobody has eaten from it, or the waste record. */
async function takeBackRest(tx: Tx, userId: string, log: { restTo: string | null; restRef: string | null }) {
  if (!log.restRef) return;
  if (log.restTo === 'pantry') {
    const eatenFrom = await tx.consumptionLog.count({ where: { inventoryItemId: log.restRef } });
    if (eatenFrom === 0) await tx.inventoryItem.deleteMany({ where: { id: log.restRef, userId, isLeftover: true } });
  } else if (log.restTo === 'bin') {
    await tx.inventoryRemoval.deleteMany({ where: { id: log.restRef, userId } });
  }
}

/**
 * Eat less of something eaten out: a share of the line (none of the fries,
 * half the burger) and where the rest went. The pantry gets it as a leftover
 * in the fridge; the bin records it as waste. It always works from the line
 * as first logged, so changing your mind just sets it again, and all of it
 * puts the line back as it was.
 */
export async function eatLess(userId: string, id: string, ate: number, rest: 'pantry' | 'bin') {
  if (!(ate >= 0 && ate <= 1)) throw badRequest('Say how much you ate, from none of it to all of it.');
  const { leftoverExpiry } = await import('./leftovers.js');
  return prisma.$transaction(async (tx) => {
    const log = await tx.consumptionLog.findFirst({ where: { id, userId }, include: { foodReference: true } });
    if (!log) throw notFound('Diary entry not found.');
    if (log.source !== 'eating_out' || log.inventoryItemId) {
      throw badRequest('This came from your pantry: say how much you finished from the meal instead.', 'not_eaten_out');
    }
    const before: AsLogged = asLoggedOf(log) ?? { quantityConsumed: log.quantityConsumed, ...columnsOf(log) };
    await takeBackRest(tx, userId, log);

    if (ate === 1) {
      await tx.consumptionLog.update({
        where: { id },
        data: { quantityConsumed: before.quantityConsumed, ...columnsOf(before), eatenShare: null, restTo: null, restRef: null, asLogged: null },
      });
      return { name: log.foodReference.name, ate, restTo: null, leftover: null };
    }

    const restAmount = before.quantityConsumed * (1 - ate);
    let restRef: string;
    let leftover: { inventoryItemId: string; quantity: number; unit: string } | null = null;
    if (rest === 'pantry') {
      const item = await tx.inventoryItem.create({
        data: {
          userId,
          foodReferenceId: log.foodReferenceId,
          quantity: restAmount,
          unit: log.unit,
          expirationDate: leftoverExpiry(),
          storageLocation: 'fridge',
          isLeftover: true,
        },
      });
      restRef = item.id;
      leftover = { inventoryItemId: item.id, quantity: roundQuantity(restAmount), unit: log.unit };
    } else {
      const removal = await tx.inventoryRemoval.create({
        data: { userId, foodReferenceId: log.foodReferenceId, quantity: restAmount, unit: log.unit, reason: 'wasted' },
      });
      restRef = removal.id;
    }

    await tx.consumptionLog.update({
      where: { id },
      data: {
        quantityConsumed: before.quantityConsumed * ate,
        ...scaleColumns(before, ate),
        eatenShare: ate,
        restTo: rest,
        restRef,
        asLogged: JSON.stringify(before),
      },
    });
    return { name: log.foodReference.name, ate, restTo: rest, leftover };
  });
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

    for (const log of logs) await takeBackRest(tx, userId, log);
    await tx.consumptionLog.deleteMany({ where: { id: { in: logs.map((log) => log.id) } } });

    const first = logs[0]!;
    const isMeal = mealLogs.length > 0;

    return {
      undone: true,
      name: isMeal ? first.recipe?.name ?? first.mealName ?? 'Cooked meal' : first.foodReference.name,
      caloriesRemoved: roundQuantity(caloriesRemoved),
      restoredToPantry: isMeal ? null : (restored[0] ?? null),
      restoredItems: restored,
    };
  });
}

/** Last N days of calorie totals, oldest first, by the person's own calendar days. */
export async function calorieHistory(userId: string, days = 7, db: Tx = prisma) {
  const first = addDays(localDay(new Date()), -(days - 1));

  const logs = await db.consumptionLog.findMany({
    where: { userId, consumedAt: { gte: dayStart(first) } },
    select: { consumedAt: true, calories: true, proteinGrams: true },
  });

  const buckets = new Map<string, { calories: number; protein: number }>();
  for (let i = 0; i < days; i += 1) buckets.set(addDays(first, i), { calories: 0, protein: 0 });
  for (const log of logs) {
    const bucket = buckets.get(localDay(new Date(log.consumedAt)));
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

/**
 * "I only ate half of it." What was logged shrinks to what was eaten, and the
 * rest goes somewhere real: a cooked meal's rest becomes leftovers in the
 * fridge; a food from the pantry goes back to the lot it came from. Meals
 * cooked before servings were recorded count as one portion.
 */
export async function saveRest(userId: string, id: string, ate: number, rest: 'keep' | 'bin' = 'keep') {
  if (!(ate > 0 && ate < 1)) throw badRequest('Say how much you ate: some of it, but not all.');
  const { cookedDishFood, storeLeftovers } = await import('./leftovers.js');
  return prisma.$transaction(async (tx) => {
    const meal = await mealOf(tx, userId, id);
    if (meal) {
      const { logs, recipe } = meal;
      const servings = logs[0]!.servings ?? 1;
      const total = (pick: (log: (typeof logs)[number]) => number | null) =>
        logs.every((log) => pick(log) === null) ? null : logs.reduce((sum, log) => sum + (pick(log) ?? 0), 0);
      const perServing = (value: number | null) => (value === null ? null : value / servings);
      const calories = total((log) => log.calories);
      const dish = {
        recipeId: recipe.id,
        recipeName: recipe.name,
        servings: servings * (1 - ate),
        caloriesPerServing: perServing(calories),
        proteinPerServing: perServing(total((log) => log.proteinGrams)),
        carbsPerServing: perServing(total((log) => log.carbsGrams)),
        fatPerServing: perServing(total((log) => log.fatGrams)),
        fiberPerServing: perServing(total((log) => log.fiberGrams)),
        sugarPerServing: perServing(total((log) => log.sugarGrams)),
        satFatPerServing: perServing(total((log) => log.satFatGrams)),
        sodiumPerServing: perServing(total((log) => log.sodiumMg)),
      };
      // the rest in the fridge as leftovers, or in the bin, counted as waste
      const leftover = rest === 'keep' ? await storeLeftovers(userId, dish, tx) : null;
      const binned =
        rest === 'bin'
          ? await tx.inventoryRemoval.create({
              data: { userId, foodReferenceId: (await cookedDishFood(dish, tx)).id, quantity: dish.servings, unit: 'serving', reason: 'wasted' },
            })
          : null;
      for (const log of logs) await scaleLog(tx, log, ate, true);
      return {
        kind: 'meal' as const,
        name: recipe.name,
        ate,
        calories: calories === null ? null : roundQuantity(calories * ate),
        leftover,
        restored: null,
        binnedId: binned?.id ?? null,
      };
    }

    const log = await tx.consumptionLog.findFirst({ where: { id, userId }, include: { foodReference: true, inventoryItem: true } });
    if (!log) throw notFound('Diary entry not found.');
    if (!log.inventoryItem) throw badRequest('This did not come from your pantry, so there is nowhere to put the rest back.', 'not_from_pantry');
    const restAmount = log.quantityConsumed * (1 - ate);
    const back = rest === 'keep' ? await moveToLot(tx, log, restAmount, 1) : null;
    const binned =
      rest === 'bin'
        ? await tx.inventoryRemoval.create({
            data: { userId, inventoryItemId: log.inventoryItem.id, foodReferenceId: log.foodReferenceId, quantity: restAmount, unit: log.unit, reason: 'wasted' },
          })
        : null;
    await scaleLog(tx, log, ate, false);
    return {
      kind: 'food' as const,
      name: log.foodReference.name,
      ate,
      calories: log.calories === null ? null : roundQuantity(log.calories * ate),
      leftover: null,
      restored: back,
      binnedId: binned?.id ?? null,
    };
  });
}

/** Undo "I only ate some": the leftovers go, or the pantry gives the rest back, and the diary shows it all again. */
export async function undoSaveRest(userId: string, id: string, ate: number, leftoverItemId?: string | null, binnedId?: string | null) {
  if (!(ate > 0 && ate < 1)) throw badRequest('Say how much was eaten.');
  return prisma.$transaction(async (tx) => {
    // binned: the waste record goes, and nothing went back to the pantry to take out again
    if (binnedId) await tx.inventoryRemoval.deleteMany({ where: { id: binnedId, userId } });
    const meal = await mealOf(tx, userId, id);
    if (meal) {
      if (leftoverItemId) await tx.inventoryItem.deleteMany({ where: { id: leftoverItemId, userId, isLeftover: true } });
      for (const log of meal.logs) await scaleLog(tx, log, 1 / ate, true);
      return { undone: true };
    }
    const log = await tx.consumptionLog.findFirst({ where: { id, userId }, include: { foodReference: true, inventoryItem: true } });
    if (!log || !log.inventoryItem) throw notFound('Diary entry not found.');
    // the log holds what was eaten; the rest was ate-to-(1-ate) of that
    if (!binnedId) await moveToLot(tx, log, (log.quantityConsumed / ate) * (1 - ate), -1);
    await scaleLog(tx, log, 1 / ate, false);
    return { undone: true };
  });
}

async function mealOf(tx: Tx, userId: string, id: string) {
  let logs = await tx.consumptionLog.findMany({ where: { userId, cookEventId: id }, include: { recipe: true } });
  if (logs.length === 0) {
    const one = await tx.consumptionLog.findFirst({ where: { id, userId }, select: { cookEventId: true } });
    if (!one?.cookEventId) return null;
    logs = await tx.consumptionLog.findMany({ where: { userId, cookEventId: one.cookEventId }, include: { recipe: true } });
  }
  const recipe = logs[0]?.recipe;
  if (!recipe) return null;
  return { logs, recipe };
}

/** The diary's share of a log: its nutrition, and for a food its amount, times a factor. */
async function scaleLog(
  tx: Tx,
  log: NutritionColumns & { id: string; quantityConsumed: number; servings: number | null },
  factor: number,
  meal: boolean,
) {
  await tx.consumptionLog.update({
    where: { id: log.id },
    data: {
      ...(meal ? { servings: (log.servings ?? 1) * factor } : { quantityConsumed: log.quantityConsumed * factor }),
      ...scaleColumns(log, factor),
    },
  });
}

/** Put an amount (in the log's unit) back into the lot it came from, or take it out again (direction -1). */
async function moveToLot(
  tx: Tx,
  log: { unit: string; foodReference: FoodReference; inventoryItem: { id: string; unit: string; quantity: number } | null },
  amount: number,
  direction: 1 | -1,
) {
  if (!log.inventoryItem) return null;
  const { loadConvertContext } = await import('./conversions.js');
  const { convert } = await import('./units.js');
  const ctx = await loadConvertContext(log.foodReference, tx);
  const inLot = convert(amount, log.unit, log.inventoryItem.unit, ctx);
  if (!inLot.ok) throw badRequest('That amount is in a unit the pantry cannot put back.', 'unit_mismatch');
  const lot = await tx.inventoryItem.findUnique({ where: { id: log.inventoryItem.id } });
  if (!lot) return null;
  const updated = await tx.inventoryItem.update({
    where: { id: lot.id },
    data: { quantity: Math.max(0, lot.quantity + direction * inLot.value) },
  });
  return { inventoryItemId: updated.id, name: log.foodReference.name, quantity: roundQuantity(updated.quantity), unit: updated.unit };
}
