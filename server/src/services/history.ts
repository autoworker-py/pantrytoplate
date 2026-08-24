/**
 * What you actually cook, and what you thought of it.
 *
 * A recipe book that never learns is a search engine. Cooking something three
 * times is a stronger signal than any tag, so the things you return to should be
 * one tap away — and a rating you gave should outrank a recipe you have never
 * tried.
 */
import { prisma, type Tx } from '../db.js';

export interface CookedRecipe {
  recipeId: string;
  name: string;
  timesCooked: number;
  lastCookedAt: string;
  rating: number | null;
  totalMinutes: number | null;
  canMakeNow?: boolean;
}

/** Recipes you keep coming back to, most-cooked first. */
export async function frequentRecipes(userId: string, limit = 8, db: Tx = prisma): Promise<CookedRecipe[]> {
  const cooks = await db.consumptionLog.findMany({
    where: { userId, source: 'recipe', recipeId: { not: null } },
    select: { recipeId: true, cookEventId: true, consumedAt: true },
    orderBy: { consumedAt: 'desc' },
    take: 800,
  });

  // one cook, however many ingredient rows it wrote
  const events = new Map<string, { recipeId: string; at: Date }>();
  for (const cook of cooks) {
    if (!cook.recipeId) continue;
    const key = cook.cookEventId ?? `${cook.recipeId}-${cook.consumedAt.toISOString()}`;
    if (!events.has(key)) events.set(key, { recipeId: cook.recipeId, at: cook.consumedAt });
  }

  const byRecipe = new Map<string, { times: number; last: Date }>();
  for (const event of events.values()) {
    const existing = byRecipe.get(event.recipeId);
    if (existing) {
      existing.times += 1;
      if (event.at > existing.last) existing.last = event.at;
    } else {
      byRecipe.set(event.recipeId, { times: 1, last: event.at });
    }
  }
  if (byRecipe.size === 0) return [];

  const ids = [...byRecipe.keys()];
  const [recipes, ratings] = await Promise.all([
    db.recipe.findMany({ where: { id: { in: ids } } }),
    db.recipeRating.findMany({ where: { userId, recipeId: { in: ids } } }),
  ]);
  const ratingBy = new Map(ratings.map((rating) => [rating.recipeId, rating.rating]));

  return recipes
    .map((recipe) => {
      const stats = byRecipe.get(recipe.id)!;
      const total =
        recipe.prepMinutes === null && recipe.cookMinutes === null
          ? null
          : (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);
      return {
        recipeId: recipe.id,
        name: recipe.name,
        timesCooked: stats.times,
        lastCookedAt: stats.last.toISOString(),
        rating: ratingBy.get(recipe.id) ?? null,
        totalMinutes: total,
      };
    })
    .sort((a, b) => b.timesCooked - a.timesCooked || b.lastCookedAt.localeCompare(a.lastCookedAt))
    .slice(0, limit);
}

export async function rateRecipe(userId: string, recipeId: string, rating: number, note?: string | null) {
  const clamped = Math.max(1, Math.min(5, Math.round(rating)));
  return prisma.recipeRating.upsert({
    where: { userId_recipeId: { userId, recipeId } },
    create: { userId, recipeId, rating: clamped, note: note ?? null },
    update: { rating: clamped, note: note ?? null },
  });
}

/** Ratings for a set of recipes, for ranking. */
export async function ratingsFor(userId: string, recipeIds: string[], db: Tx = prisma) {
  if (recipeIds.length === 0) return new Map<string, number>();
  const rows = await db.recipeRating.findMany({ where: { userId, recipeId: { in: recipeIds } } });
  return new Map(rows.map((row) => [row.recipeId, row.rating]));
}
