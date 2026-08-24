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
import { getRecipeForUser } from './recipeMatch.js';

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export async function listPlan(userId: string, days = 7, db: Tx = prisma) {
  const from = startOfDay(new Date());
  const to = new Date(from);
  to.setDate(to.getDate() + days);

  const entries = await db.mealPlanEntry.findMany({
    where: { userId, plannedFor: { gte: from, lt: to } },
    include: { recipe: true },
    orderBy: [{ plannedFor: 'asc' }, { mealSlot: 'asc' }],
  });

  return entries.map((entry) => ({
    id: entry.id,
    recipeId: entry.recipeId,
    recipeName: entry.recipe.name,
    plannedFor: entry.plannedFor.toISOString().slice(0, 10),
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
      plannedFor: new Date(`${input.plannedFor}T12:00:00`),
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
 * Everything the week needs that the pantry cannot cover.
 *
 * One consolidated answer rather than a shopping trip per recipe — and it adds
 * up across meals, so two recipes each wanting two eggs asks for four.
 */
export async function planShortfall(userId: string, days = 7, db: Tx = prisma) {
  const plan = await listPlan(userId, days, db);
  const pending = plan.filter((entry) => !entry.cooked);

  const needed = new Map<
    string,
    { foodReferenceId: string; name: string; quantity: number; unit: string; forRecipes: string[] }
  >();

  for (const entry of pending) {
    const recipe = await getRecipeForUser(userId, entry.recipeId, entry.servings, db);
    if (!recipe) continue;

    for (const ingredient of recipe.ingredients) {
      if (ingredient.status === 'ok') continue;
      const amount =
        ingredient.status === 'short' && ingredient.shortfall > 0
          ? ingredient.shortfall
          : ingredient.requiredQuantity;

      const existing = needed.get(ingredient.foodReferenceId);
      if (existing && existing.unit === ingredient.requiredUnit) {
        existing.quantity += amount;
        if (!existing.forRecipes.includes(recipe.name)) existing.forRecipes.push(recipe.name);
      } else if (!existing) {
        needed.set(ingredient.foodReferenceId, {
          foodReferenceId: ingredient.foodReferenceId,
          name: ingredient.name,
          quantity: amount,
          unit: ingredient.requiredUnit,
          forRecipes: [recipe.name],
        });
      }
    }
  }

  return { plannedMeals: pending.length, missing: [...needed.values()] };
}
