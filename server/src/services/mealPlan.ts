/**
 * The week ahead.
 *
 * Planning is the layer above "what can I cook tonight": pencil in a few
 * dinners, get one shop instead of five, and — the part that matters — have the
 * app know those ingredients are spoken for, so Tuesday's suggestion does not
 * offer eggs already promised to Thursday.
 */
import { prisma, type Tx } from '../db.js';
import { notFound } from '../errors.js';
import { addDays, localDay } from '../zone.js';
import { getRecipeForUser } from './recipeMatch.js';
import { normalizeUnit, roundQuantity } from './units.js';
import { shoppingQuantity } from './shoppingQuantity.js';

/**
 * A planned meal belongs to a calendar day, not an instant: it is kept at noon
 * UTC of that day, so every time zone reads the same date back.
 */
const atNoon = (day: string) => new Date(`${day}T12:00:00Z`);
const midnight = (day: string) => new Date(`${day}T00:00:00Z`);
const dayOf = (instant: Date) => instant.toISOString().slice(0, 10);

/** How far ahead planned meals put food on the shopping list. */
const SHOP_AHEAD_DAYS = 28;

/** The planned meals from `from` (the person's today, unless given) for `days` days. */
export async function listPlan(userId: string, days = 7, db: Tx = prisma, from = localDay(new Date())) {
  const entries = await db.mealPlanEntry.findMany({
    where: { userId, plannedFor: { gte: midnight(from), lt: midnight(addDays(from, days)) } },
    include: { recipe: true },
    orderBy: [{ plannedFor: 'asc' }, { createdAt: 'asc' }],
  });

  return entries.map((entry) => ({
    id: entry.id,
    recipeId: entry.recipeId,
    recipeName: entry.recipe.name,
    plannedFor: dayOf(entry.plannedFor),
    servings: entry.servings,
    mealSlot: entry.mealSlot,
    cooked: entry.cookedAt !== null,
    totalMinutes:
      entry.recipe.prepMinutes === null && entry.recipe.cookMinutes === null
        ? null
        : (entry.recipe.prepMinutes ?? 0) + (entry.recipe.cookMinutes ?? 0),
  }));
}

export async function addToPlan(
  userId: string,
  input: { recipeId: string; plannedFor: string; servings?: number; mealSlot?: string },
) {
  const recipe = await prisma.recipe.findUnique({ where: { id: input.recipeId } });
  if (!recipe || recipe.deletedAt !== null) throw notFound('Recipe not found.');
  if (recipe.ownerId !== null && recipe.ownerId !== userId) throw notFound('Recipe not found.');

  return prisma.mealPlanEntry.create({
    data: {
      userId,
      recipeId: input.recipeId,
      plannedFor: atNoon(input.plannedFor),
      servings: input.servings ?? recipe.servings,
      mealSlot: input.mealSlot ?? 'dinner',
    },
  });
}

export async function removeFromPlan(userId: string, id: string) {
  const entry = await prisma.mealPlanEntry.findFirst({ where: { id, userId } });
  if (!entry) throw notFound('Planned meal not found.');
  await prisma.mealPlanEntry.delete({ where: { id } });
}

/**
 * Everything the coming days need that the pantry cannot cover.
 *
 * One consolidated answer rather than a shopping trip per recipe. Meals are
 * taken in date order and the pantry is shared out between them: three eggs
 * cover Monday's omelette, so Tuesday's scramble still needs its own.
 */
export async function planShortfall(userId: string, days = 7, db: Tx = prisma, from?: string) {
  const plan = await listPlan(userId, days, db, from);
  const pending = plan.filter((entry) => !entry.cooked);

  const needed = new Map<
    string,
    { foodReferenceId: string; name: string; quantity: number; unit: string; forRecipes: string[] }
  >();
  // how much of each food (in a unit) earlier meals have already been promised
  const promised = new Map<string, number>();

  for (const entry of pending) {
    const recipe = await getRecipeForUser(userId, entry.recipeId, entry.servings, db);
    if (!recipe) continue;

    for (const ingredient of recipe.ingredients) {
      // the pantry has some, in a unit that can't be compared: don't buy more
      if (ingredient.status === 'unknown_conversion') continue;
      const key = `${ingredient.foodReferenceId}|${ingredient.requiredUnit}`;
      const spoken = promised.get(key) ?? 0;
      const free = Math.max(0, ingredient.available - spoken);
      promised.set(key, spoken + Math.min(ingredient.requiredQuantity, free));
      const short = ingredient.requiredQuantity - free;
      if (short <= 0) continue;

      const existing = needed.get(key);
      if (existing) {
        existing.quantity += short;
        if (!existing.forRecipes.includes(recipe.name)) existing.forRecipes.push(recipe.name);
      } else {
        needed.set(key, {
          foodReferenceId: ingredient.foodReferenceId,
          name: ingredient.name,
          quantity: short,
          unit: ingredient.requiredUnit,
          forRecipes: [recipe.name],
        });
      }
    }
  }

  return {
    plannedMeals: pending.length,
    missing: [...needed.values()].map((m) => ({ ...m, quantity: roundQuantity(m.quantity) })),
  };
}

/**
 * Keeps the shopping list in step with the plan. What planned meals still need
 * is on the list, marked as the plan's; a meal taken off takes its food back
 * off. Anything ticked off, added another way, or taken off the list by the
 * person after the plan put it there is left alone.
 */
export async function syncPlanShopping(userId: string, db: Tx = prisma) {
  const { missing } = await planShortfall(userId, SHOP_AHEAD_DAYS, db);
  const want = new Map(
    missing.map((m) => {
      const unit = normalizeUnit(m.unit);
      return [`${m.foodReferenceId}|${unit}`, { ...m, unit, quantity: shoppingQuantity(m.quantity, unit) }];
    }),
  );

  const [list, skips] = await Promise.all([
    db.shoppingListItem.findMany({ where: { userId } }),
    db.planShoppingSkip.findMany({ where: { userId } }),
  ]);
  // food the list already covers some other way, or the person said no to
  const covered = new Set<string>(skips.map((s) => s.foodReferenceId));
  for (const item of list) {
    if (item.foodReferenceId && (item.isChecked || item.addedFrom !== 'meal_plan')) covered.add(item.foodReferenceId);
  }

  for (const item of list.filter((i) => !i.isChecked && i.addedFrom === 'meal_plan')) {
    const key = `${item.foodReferenceId}|${item.unit}`;
    const wanted = want.get(key);
    if (!wanted || (item.foodReferenceId && covered.has(item.foodReferenceId))) {
      await db.shoppingListItem.delete({ where: { id: item.id } });
      continue;
    }
    if (wanted.quantity !== item.quantityNeeded) {
      await db.shoppingListItem.update({ where: { id: item.id }, data: { quantityNeeded: wanted.quantity } });
    }
    want.delete(key);
  }

  for (const wanted of want.values()) {
    if (covered.has(wanted.foodReferenceId)) continue;
    await db.shoppingListItem.create({
      data: {
        userId,
        foodReferenceId: wanted.foodReferenceId,
        name: wanted.name,
        quantityNeeded: wanted.quantity,
        unit: wanted.unit,
        addedFrom: 'meal_plan',
      },
    });
  }

  // a "no thanks" only lasts while some planned meal still wants that food
  const stillWanted = new Set(missing.map((m) => m.foodReferenceId));
  const stale = skips.filter((s) => !stillWanted.has(s.foodReferenceId)).map((s) => s.id);
  if (stale.length) await db.planShoppingSkip.deleteMany({ where: { id: { in: stale } } });

  return { toBuy: await db.shoppingListItem.count({ where: { userId, isChecked: false, addedFrom: 'meal_plan' } }) };
}

/**
 * Cooking a planned recipe crosses it off the plan: the nearest uncooked entry
 * for it, from yesterday to tomorrow, so cooking Tuesday's dinner on Monday
 * night still counts.
 */
export async function markPlanCooked(userId: string, recipeId: string, db: Tx = prisma) {
  const today = localDay(new Date());
  const entry = await db.mealPlanEntry.findFirst({
    where: { userId, recipeId, cookedAt: null, plannedFor: { gte: midnight(addDays(today, -1)), lt: midnight(addDays(today, 2)) } },
    orderBy: { plannedFor: 'asc' },
  });
  if (!entry) return false;
  await db.mealPlanEntry.update({ where: { id: entry.id }, data: { cookedAt: new Date() } });
  return true;
}
