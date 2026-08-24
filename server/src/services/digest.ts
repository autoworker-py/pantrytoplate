/**
 * The daily nudge.
 *
 * Limiting waste is the whole point of the app, but it can only warn you if you
 * happen to open it — and food goes off on its own schedule. This assembles the
 * one message worth interrupting someone for: what dies today or tomorrow, and
 * what they could cook tonight to save it.
 */
import { prisma, type Tx } from '../db.js';
import { expiringSoon } from './inventory.js';
import { searchRecipesForUser } from './recipeMatch.js';
import { predictRunOut } from './forecast.js';

export interface Digest {
  /** short enough for a notification body */
  headline: string | null;
  expiring: Array<{ name: string; daysUntilExpiration: number | null }>;
  rescueRecipes: Array<{ id: string; name: string; uses: string[]; totalMinutes: number | null }>;
  runningOut: Array<{ name: string; daysLeft: number }>;
}

export async function dailyDigest(userId: string, db: Tx = prisma): Promise<Digest> {
  const [expiring, recipes, runOut] = await Promise.all([
    expiringSoon(userId, undefined, db),
    searchRecipesForUser(userId, { limit: 40 }, 40, db),
    predictRunOut(userId, db, 5),
  ]);

  const rescue = recipes
    .filter((recipe) => recipe.canMakeNow && recipe.usesExpiring.length > 0)
    .slice(0, 3)
    .map((recipe) => ({
      id: recipe.id,
      name: recipe.name,
      uses: recipe.usesExpiring,
      totalMinutes: recipe.totalMinutes,
    }));

  const urgent = expiring.filter((item) => (item.daysUntilExpiration ?? 99) <= 1);

  let headline: string | null = null;
  if (urgent.length > 0) {
    const names = urgent.slice(0, 2).map((item) => item.food.name).join(' and ');
    const more = urgent.length > 2 ? ` and ${urgent.length - 2} more` : '';
    headline = rescue[0]
      ? `${names}${more} goes off tomorrow — you could make ${rescue[0].name} tonight.`
      : `${names}${more} goes off tomorrow.`;
  } else if (expiring.length > 0) {
    headline = `${expiring.length} thing${expiring.length === 1 ? '' : 's'} in your fridge to use this week.`;
  }

  return {
    headline,
    expiring: expiring.slice(0, 6).map((item) => ({
      name: item.food.name,
      daysUntilExpiration: item.daysUntilExpiration,
    })),
    rescueRecipes: rescue,
    runningOut: runOut.slice(0, 4).map((item) => ({ name: item.name, daysLeft: item.daysLeft })),
  };
}
