/**
 * What would fit what's left today: things in the pantry and recipes ready to
 * cook that come in under the calories left, best at protein when protein is
 * short, sooner-to-go-off first. Offered only when the gap is worth filling.
 */
import { prisma } from '../db.js';
import { dailySummary } from './diary.js';
import { searchRecipesForUser } from './recipeMatch.js';
import { foodGrade } from './healthScore.js';

/** not things anyone eats on their own */
const NOT_A_SNACK = new Set(['Condiments', 'Spices', 'Baking', 'Oils & Vinegars', 'Sauces', 'Herbs', 'Leftovers', 'Eating out']);
const MIN_GAP_KCAL = 150;

export interface Idea {
  kind: 'food' | 'recipe';
  id: string;
  name: string;
  /** for a food: the portion to log */
  quantity: number | null;
  unit: string | null;
  kcal: number;
  protein: number;
  why: string;
}

export async function suggestions(userId: string, day: string, extraKcal = 0) {
  const summary = await dailySummary(userId, day);
  const kcalLeft = Math.round(summary.caloriesRemaining + extraKcal);
  const proteinLeft = Math.round((summary.targets.protein ?? 0) - summary.macros.protein);
  if (kcalLeft < MIN_GAP_KCAL) return { kcalLeft, proteinLeft, ideas: [] as Idea[] };
  const proteinShort = proteinLeft >= 15;

  const now = new Date();
  const items = await prisma.inventoryItem.findMany({
    where: { userId, quantity: { gt: 0 }, OR: [{ expirationDate: null }, { expirationDate: { gte: now } }] },
    include: { foodReference: true },
  });

  const scored: Array<{ idea: Idea; score: number }> = [];
  for (const item of items) {
    const food = item.foodReference;
    if (food.caloriesPerUnit === null || food.caloriesPerUnit <= 0 || NOT_A_SNACK.has(food.category ?? '')) continue;
    // a portion someone would eat: one of a counted thing, or up to 150 g, 250 ml
    let portion: number;
    if (item.unit === food.defaultUnit && ['count', 'slice', 'serving'].includes(food.defaultUnit)) portion = 1;
    else if (item.unit === food.defaultUnit && (food.defaultUnit === 'g' || food.defaultUnit === 'ml')) {
      const cap = food.defaultUnit === 'g' ? 150 : 250;
      portion = Math.floor(Math.min(cap, item.quantity, (kcalLeft * 0.8) / food.caloriesPerUnit) / 10) * 10;
      if (portion < 30) continue;
    } else continue;
    const kcal = Math.round(food.caloriesPerUnit * portion);
    const protein = Math.round((food.proteinPerUnit ?? 0) * portion);
    if (kcal < 60 || kcal > kcalLeft) continue;
    const days = item.expirationDate ? (item.expirationDate.getTime() - now.getTime()) / 86_400_000 : null;
    const soon = days !== null && days <= 2;
    const grade = foodGrade(food);
    const score = (proteinShort ? (protein / kcal) * 100 : 1 - Math.abs(kcal - kcalLeft * 0.5) / kcalLeft) + (soon ? 0.6 : 0) + (grade === 'A' || grade === 'B' ? 0.25 : 0);
    scored.push({
      idea: {
        kind: 'food',
        id: item.id,
        name: food.name,
        quantity: portion,
        unit: food.defaultUnit,
        kcal,
        protein,
        why: proteinShort && protein >= 12 ? `${protein} g protein` : soon ? 'Goes off soon' : 'Fits what’s left',
      },
      score,
    });
  }

  const recipes = await searchRecipesForUser(userId, { maxGaps: 0, maxCaloriesPerServing: kcalLeft, limit: 12 });
  for (const recipe of recipes) {
    const kcal = recipe.nutrition?.caloriesPerServing;
    if (!kcal || kcal < 100) continue;
    const protein = Math.round(recipe.nutrition?.proteinPerServing ?? 0);
    scored.push({
      idea: { kind: 'recipe', id: recipe.id, name: recipe.name, quantity: null, unit: null, kcal: Math.round(kcal), protein, why: proteinShort && protein >= 15 ? `${protein} g protein` : 'Ready to cook' },
      score: (proteinShort ? (protein / kcal) * 100 : 1 - Math.abs(kcal - kcalLeft * 0.6) / kcalLeft) + 0.1,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  // a mix where there is one: the best two foods and the best recipe
  const foods = scored.filter((s) => s.idea.kind === 'food').slice(0, 2);
  const cooked = scored.filter((s) => s.idea.kind === 'recipe').slice(0, 1);
  const ideas = [...foods, ...cooked].sort((a, b) => b.score - a.score).map((s) => s.idea);
  return { kcalLeft, proteinLeft, ideas };
}
