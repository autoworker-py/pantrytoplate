/**
 * Leftovers, substitutions, forecasting, planning and the rest.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';

let app: FastifyInstance;
let token: string;
let userId: string;
const userEmail = `newfeat-${Date.now()}@example.test`;

async function api(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  payload?: Record<string, unknown>,
) {
  const response = await app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${token}` },
    ...(payload === undefined ? {} : { payload }),
  });
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : null };
}

const foodId = async (name: string) =>
  (await prisma.foodReference.findFirstOrThrow({ where: { name } })).id;

async function stock(name: string, quantity: number, unit: string) {
  const result = await api('POST', '/api/inventory', {
    foodReferenceId: await foodId(name),
    quantity,
    unit,
  });
  expect(result.status).toBe(201);
  return result.body.item;
}

async function reset() {
  await prisma.consumptionLog.deleteMany({ where: { userId } });
  await prisma.inventoryRemoval.deleteMany({ where: { userId } });
  await prisma.inventoryItem.deleteMany({ where: { userId } });
  await prisma.shoppingListItem.deleteMany({ where: { userId } });
  await prisma.mealPlanEntry.deleteMany({ where: { userId } });
  await prisma.recipeRating.deleteMany({ where: { userId } });
}

beforeAll(async () => {
  app = await buildApp();
  const registered = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: userEmail, password: 'testpassword' },
  });
  token = JSON.parse(registered.body).token;
  userId = JSON.parse(registered.body).user.id;
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('leftovers', () => {
  beforeEach(async () => {
    await reset();
    await stock('Egg', 24, 'count');
    await stock('Unsalted Butter', 400, 'g');
    await stock('Table Salt', 500, 'g');
    await stock('Black Pepper', 100, 'g');
  });

  it('puts the portions you did not eat into the fridge', async () => {
    const omelette = await prisma.recipe.findFirstOrThrow({ where: { name: 'Classic French Omelette' } });
    const cooked = await api('POST', `/api/recipes/${omelette.id}/cook`, { servings: 4, keepServings: 3 });

    expect(cooked.status).toBe(200);
    expect(cooked.body.result.leftovers).toMatchObject({ name: 'Classic French Omelette', servings: 3 });

    const leftovers = await api('GET', '/api/planning/leftovers');
    expect(leftovers.body.leftovers).toHaveLength(1);
    expect(leftovers.body.leftovers[0].servings).toBe(3);
    expect(leftovers.body.leftovers[0].caloriesPerServing).toBeGreaterThan(0);
  });

  it('only counts the portion you actually ate towards today', async () => {
    const omelette = await prisma.recipe.findFirstOrThrow({ where: { name: 'Classic French Omelette' } });

    const all = await api('POST', `/api/recipes/${omelette.id}/cook`, { servings: 4 });
    const eatenAll = all.body.result.caloriesLogged;

    await reset();
    await stock('Egg', 24, 'count');
    await stock('Unsalted Butter', 400, 'g');
    await stock('Table Salt', 500, 'g');
    await stock('Black Pepper', 100, 'g');

    const kept = await api('POST', `/api/recipes/${omelette.id}/cook`, { servings: 4, keepServings: 3 });

    // ate one of four portions. Allow a kcal either way: each ingredient row is
    // rounded for display before the total is taken.
    const quarter = eatenAll / 4;
    expect(Math.abs(kept.body.result.caloriesLogged - quarter)).toBeLessThanOrEqual(1);

    const today = await api('GET', '/api/consumption/today');
    expect(Math.abs(today.body.totalCalories - quarter)).toBeLessThanOrEqual(1);
  });

  it('lets you eat one portion later, like any other pantry item', async () => {
    const cookies = await prisma.recipe.findFirstOrThrow({ where: { name: 'Chocolate Chip Cookies' } });
    await stock('All-Purpose Flour', 1000, 'g');
    await stock('Granulated Sugar', 1000, 'g');
    await stock('Brown Sugar', 1000, 'g');
    await stock('Vanilla Extract', 100, 'g');
    await stock('Semisweet Chocolate Chips', 500, 'g');
    await stock('Baking Powder', 100, 'g');

    // 24 cookies, keep them all
    const cooked = await api('POST', `/api/recipes/${cookies.id}/cook`, { keepServings: 24 });
    expect(cooked.body.result.leftovers.servings).toBe(24);

    const leftovers = await api('GET', '/api/planning/leftovers');
    const batch = leftovers.body.leftovers[0];

    // eat exactly one cookie
    const eaten = await api('POST', `/api/inventory/${batch.id}/consume`, { quantity: 1, unit: 'serving' });
    expect(eaten.status).toBe(200);
    expect(eaten.body.result.remaining).toBe(23);
    expect(eaten.body.result.calories).toBeGreaterThan(0);
  });

  it('gives leftovers a short fridge life, because that is the truth', async () => {
    const omelette = await prisma.recipe.findFirstOrThrow({ where: { name: 'Classic French Omelette' } });
    await api('POST', `/api/recipes/${omelette.id}/cook`, { servings: 4, keepServings: 2 });

    const inventory = await api('GET', '/api/inventory');
    const portion = inventory.body.items.find((i: { food: { name: string } }) => i.food.name === 'Classic French Omelette');
    expect(portion.daysUntilExpiration).toBeLessThanOrEqual(3);
    expect(portion.storageLocation).toBe('fridge');
  });
});

describe('substitutions', () => {
  beforeEach(reset);

  it('offers something you own when an ingredient is missing', async () => {
    // everything for an omelette except butter, but there is oil
    await stock('Egg', 12, 'count');
    await stock('Olive Oil', 400, 'g');
    await stock('Table Salt', 500, 'g');
    await stock('Black Pepper', 100, 'g');

    const omelette = await prisma.recipe.findFirstOrThrow({ where: { name: 'Classic French Omelette' } });
    const detail = await api('GET', `/api/recipes/${omelette.id}`);
    const butter = detail.body.recipe.ingredients.find((i: { name: string }) => i.name === 'Unsalted Butter');

    expect(butter.status).not.toBe('ok');
    expect(butter.substitutes.length).toBeGreaterThan(0);
    expect(butter.substitutes[0].substituteName).toBe('Olive Oil');
    expect(butter.substitutes[0].enough).toBe(true);
    expect(butter.substitutes[0].note).toBeTruthy();
  });

  it('applies the ratio rather than swapping one for one', async () => {
    await stock('Egg', 12, 'count');
    await stock('Olive Oil', 400, 'g');
    await stock('Table Salt', 500, 'g');
    await stock('Black Pepper', 100, 'g');

    const omelette = await prisma.recipe.findFirstOrThrow({ where: { name: 'Classic French Omelette' } });
    const detail = await api('GET', `/api/recipes/${omelette.id}`);
    const butter = detail.body.recipe.ingredients.find((i: { name: string }) => i.name === 'Unsalted Butter');

    // butter -> oil is 0.75, so 1 tbsp of butter becomes 0.75 tbsp of oil
    expect(butter.substitutes[0].quantity).toBeCloseTo(0.75, 2);
  });

  it('offers them on the cook screen too, which is where they are needed', async () => {
    await stock('Egg', 12, 'count');
    await stock('Olive Oil', 400, 'g');
    await stock('Table Salt', 500, 'g');
    await stock('Black Pepper', 100, 'g');

    const omelette = await prisma.recipe.findFirstOrThrow({ where: { name: 'Classic French Omelette' } });
    const preview = await api('GET', `/api/recipes/${omelette.id}/cook-preview`);
    const butter = preview.body.preview.ingredients.find((i: { name: string }) => i.name === 'Unsalted Butter');
    expect(butter.substitutes[0].substituteName).toBe('Olive Oil');
  });

  it('never suggests something you do not have', async () => {
    await stock('Egg', 12, 'count');
    const omelette = await prisma.recipe.findFirstOrThrow({ where: { name: 'Classic French Omelette' } });
    const detail = await api('GET', `/api/recipes/${omelette.id}`);
    const butter = detail.body.recipe.ingredients.find((i: { name: string }) => i.name === 'Unsalted Butter');
    expect(butter.substitutes).toEqual([]);
  });
});

describe('running out', () => {
  beforeEach(reset);

  it('says nothing until there is enough history to mean it', async () => {
    const eggs = await stock('Egg', 12, 'count');
    await api('POST', `/api/inventory/${eggs.id}/consume`, { quantity: 2 });

    const result = await api('GET', '/api/planning/run-out');
    expect(result.body.predictions).toEqual([]);
  });

  it('predicts from how fast you actually get through something', async () => {
    const eggs = await stock('Egg', 12, 'count');
    for (let i = 0; i < 4; i += 1) {
      await api('POST', `/api/inventory/${eggs.id}/consume`, { quantity: 2 });
    }

    const result = await api('GET', '/api/planning/run-out');
    const egg = result.body.predictions.find((p: { name: string }) => p.name === 'Egg');
    expect(egg).toBeDefined();
    expect(egg.remaining).toBe(4);
    expect(egg.basedOn).toBeGreaterThanOrEqual(3);
    expect(egg.daysLeft).toBeGreaterThanOrEqual(0);
  });
});

describe('meal planning', () => {
  beforeEach(reset);

  it('adds up what the week needs across meals', async () => {
    const omelette = await prisma.recipe.findFirstOrThrow({ where: { name: 'Classic French Omelette' } });
    const scramble = await prisma.recipe.findFirstOrThrow({ where: { name: 'Scrambled Eggs on Toast' } });
    const today = new Date().toISOString().slice(0, 10);

    await api('POST', '/api/planning/plan', { recipeId: omelette.id, plannedFor: today });
    await api('POST', '/api/planning/plan', { recipeId: scramble.id, plannedFor: today });

    const plan = await api('GET', '/api/planning/plan');
    expect(plan.body.entries).toHaveLength(2);

    const shortfall = await api('GET', '/api/planning/plan/shortfall');
    expect(shortfall.body.plannedMeals).toBe(2);
    // both want eggs, so the shortfall covers both meals
    const eggs = shortfall.body.missing.find((m: { name: string }) => m.name === 'Egg');
    expect(eggs.quantity).toBe(5);
    expect(eggs.forRecipes).toHaveLength(2);
  });
});

describe('what you keep cooking', () => {
  beforeEach(async () => {
    await reset();
    await stock('Egg', 24, 'count');
    await stock('Unsalted Butter', 400, 'g');
    await stock('Table Salt', 500, 'g');
    await stock('Black Pepper', 100, 'g');
  });

  it('counts a cook once, not once per ingredient', async () => {
    const omelette = await prisma.recipe.findFirstOrThrow({ where: { name: 'Classic French Omelette' } });
    await api('POST', `/api/recipes/${omelette.id}/cook`, {});
    await api('POST', `/api/recipes/${omelette.id}/cook`, {});

    const result = await api('GET', '/api/planning/frequent');
    const entry = result.body.recipes.find((r: { name: string }) => r.name === 'Classic French Omelette');
    expect(entry.timesCooked).toBe(2);
  });

  it('remembers what you thought of it', async () => {
    const omelette = await prisma.recipe.findFirstOrThrow({ where: { name: 'Classic French Omelette' } });
    await api('POST', `/api/recipes/${omelette.id}/cook`, {});
    await api('PUT', `/api/planning/ratings/${omelette.id}`, { rating: 5, note: 'perfect' });

    const result = await api('GET', '/api/planning/frequent');
    const entry = result.body.recipes.find((r: { name: string }) => r.name === 'Classic French Omelette');
    expect(entry.rating).toBe(5);
  });
});

describe('preferences', () => {
  beforeEach(reset);

  it('treats a diet as a filter, not a preference', async () => {
    await api('PATCH', '/api/settings', { dietTags: ['vegetarian'] });
    const result = await api('GET', '/api/recipes?q=chicken');
    for (const recipe of result.body.recipes) expect(recipe.tags).toContain('vegetarian');
    await api('PATCH', '/api/settings', { dietTags: [] });
  });

  it('stores the unit system and notification choice', async () => {
    const updated = await api('PATCH', '/api/settings', { unitSystem: 'imperial', notifyExpiry: false });
    expect(updated.body.settings.unitSystem).toBe('imperial');
    expect(updated.body.settings.notifyExpiry).toBe(false);
    await api('PATCH', '/api/settings', { unitSystem: 'metric', notifyExpiry: true });
  });
});

describe('the daily digest', () => {
  beforeEach(reset);

  it('leads with what dies tomorrow and what would save it', async () => {
    const spinach = await api('POST', '/api/inventory', {
      foodReferenceId: await foodId('Baby Spinach'),
      quantity: 300,
      unit: 'g',
      expirationDate: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(spinach.status).toBe(201);
    await stock('Egg', 12, 'count');
    await stock('Cheddar Cheese', 200, 'g');
    await stock('Olive Oil', 200, 'g');
    await stock('Table Salt', 500, 'g');

    const digest = await api('GET', '/api/planning/digest');
    expect(digest.body.headline).toContain('Baby Spinach');
    expect(digest.body.rescueRecipes.length).toBeGreaterThan(0);
    expect(digest.body.rescueRecipes[0].uses).toContain('Baby Spinach');
  });
});

describe('taking your data with you', () => {
  it('exports everything as one file', async () => {
    await reset();
    await stock('Egg', 12, 'count');
    const result = await api('GET', '/api/reports/export');
    expect(result.status).toBe(200);
    expect(result.body.user.email).toBe(userEmail);
    expect(result.body.pantry.some((item: { name: string }) => item.name === 'Egg')).toBe(true);
    expect(result.body).toHaveProperty('diary');
    expect(result.body).toHaveProperty('mealPlan');
  });
});
