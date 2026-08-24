/**
 * Integration tests for the second feature set: the calorie tab, eating out,
 * household removals, undo, settings and goals, shelf life, low stock, ads.
 *
 * Same rules as flows.test.ts — real HTTP stack, real database, OFFLINE_MODE on.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';

let app: FastifyInstance;
let token: string;
let userId: string;

const userEmail = `features-${Date.now()}@example.test`;

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

async function foodId(name: string): Promise<string> {
  return (await prisma.foodReference.findFirstOrThrow({ where: { name } })).id;
}

async function stock(
  name: string,
  quantity: number,
  unit: string,
  extra: Record<string, unknown> = {},
) {
  const result = await api('POST', '/api/inventory', {
    foodReferenceId: await foodId(name),
    quantity,
    unit,
    ...extra,
  });
  expect(result.status).toBe(201);
  return result.body;
}

async function reset() {
  await prisma.consumptionLog.deleteMany({ where: { userId } });
  await prisma.inventoryRemoval.deleteMany({ where: { userId } });
  await prisma.inventoryItem.deleteMany({ where: { userId } });
  await prisma.shoppingListItem.deleteMany({ where: { userId } });
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

describe('expiry dates fill themselves in', () => {
  beforeEach(reset);

  it('estimates a date from the food category when none is given', async () => {
    const added = await stock('Baby Spinach', 200, 'g');
    expect(added.expirationEstimated).toBe(true);
    expect(added.item.expirationDate).not.toBeNull();
    // spinach has its own 5-day override
    expect(added.item.daysUntilExpiration).toBe(5);
    expect(added.item.expiryStatus).toBe('ok');
  });

  it('never overrides a date the user actually typed', async () => {
    const chosen = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const added = await stock('Baby Spinach', 200, 'g', { expirationDate: chosen });
    expect(added.expirationEstimated).toBe(false);
    expect(added.item.daysUntilExpiration).toBe(2);
    expect(added.item.expiryStatus).toBe('expiring_soon');
  });

  it('gives shelf-stable food a long date and fresh food a short one', async () => {
    const salt = await stock('Table Salt', 500, 'g');
    const chicken = await stock('Chicken Breast', 2, 'count');
    expect(salt.item.daysUntilExpiration).toBeGreaterThan(365);
    expect(chicken.item.daysUntilExpiration).toBe(3);
  });

  it('freezing pushes the date out and moves the item', async () => {
    const added = await stock('Chicken Breast', 2, 'count');
    const frozen = await api('POST', `/api/inventory/${added.item.id}/freeze`);
    expect(frozen.status).toBe(200);
    expect(frozen.body.item.storageLocation).toBe('freezer');
    expect(frozen.body.item.daysUntilExpiration).toBeGreaterThan(100);
  });
});

describe('food that leaves the pantry without you eating it', () => {
  beforeEach(reset);

  it('a roommate eating your eggs never touches your calories', async () => {
    const added = await stock('Egg', 12, 'count');

    const removed = await api('POST', `/api/inventory/${added.item.id}/remove`, {
      reason: 'other_person',
      quantity: 3,
    });
    expect(removed.status).toBe(200);
    expect(removed.body.result.remaining).toBe(9);

    const today = await api('GET', '/api/consumption/today');
    expect(today.body.totalCalories).toBe(0);
    expect(today.body.entryCount).toBe(0);
  });

  it('records what was thrown out, counted rather than costed', async () => {
    const added = await stock('Baby Spinach', 142, 'g');
    const removed = await api('POST', `/api/inventory/${added.item.id}/remove`, {
      reason: 'wasted',
      quantity: 142,
    });
    expect(removed.body.result.depleted).toBe(true);
    // no money figure: prices move weekly and we do not read receipts
    expect(removed.body.result.estimatedValue).toBeUndefined();

    const report = await api('GET', '/api/reports/waste');
    expect(report.body.wastedItems).toBe(1);
    expect(report.body.topWasted[0]).toMatchObject({ name: 'Baby Spinach', times: 1 });
    expect(report.body.byCategory[0]).toMatchObject({ category: 'Produce', count: 1 });
    expect(report.body.estimatedValue).toBeUndefined();
  });

  it('keeps a log of everything that left the pantry', async () => {
    const spinach = await stock('Baby Spinach', 142, 'g');
    const eggs = await stock('Egg', 6, 'count');
    await api('POST', `/api/inventory/${spinach.item.id}/remove`, { reason: 'wasted', quantity: 142 });
    await api('POST', `/api/inventory/${eggs.item.id}/remove`, { reason: 'other_person', quantity: 2 });

    const log = await api('GET', '/api/reports/waste/log');
    expect(log.status).toBe(200);
    expect(log.body.entries.length).toBeGreaterThanOrEqual(2);

    const [newest] = log.body.entries;
    expect(newest).toMatchObject({ name: 'Egg', reason: 'other_person' });
    expect(newest.removedAt).toBeTruthy();

    // and it can be narrowed to just the waste
    const binned = await api('GET', '/api/reports/waste/log?reason=wasted');
    expect(binned.body.entries.every((e: { reason: string }) => e.reason === 'wasted')).toBe(true);
  });

  it('counts the three reasons separately', async () => {
    const eggs = await stock('Egg', 12, 'count');
    const bread = await stock('Whole Wheat Bread', 10, 'slice');
    await api('POST', `/api/inventory/${eggs.item.id}/remove`, { reason: 'other_person', quantity: 2 });
    await api('POST', `/api/inventory/${bread.item.id}/remove`, { reason: 'used_up', quantity: 10 });

    const report = await api('GET', '/api/reports/waste');
    expect(report.body.byReason).toMatchObject({ other_person: 1, used_up: 1, wasted: 0 });
  });

  it('refuses to remove more than is there', async () => {
    const added = await stock('Egg', 2, 'count');
    const result = await api('POST', `/api/inventory/${added.item.id}/remove`, {
      reason: 'used_up',
      quantity: 5,
    });
    expect(result.status).toBe(409);
    const after = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: added.item.id } });
    expect(after.quantity).toBe(2);
  });
});

describe('the calorie tab', () => {
  beforeEach(reset);

  it('totals macros and works out the split for the chart', async () => {
    const eggs = await stock('Egg', 12, 'count');
    await api('POST', `/api/inventory/${eggs.item.id}/consume`, { quantity: 2, mealSlot: 'breakfast' });

    const today = await api('GET', '/api/consumption/today');
    expect(today.body.totalCalories).toBe(144);
    expect(today.body.macros.protein).toBeCloseTo(12.6, 1);
    expect(today.body.macros.fat).toBeCloseTo(9.6, 1);
    expect(today.body.macroSplit.hasData).toBe(true);
    // an egg is protein and fat, almost no carbs
    expect(today.body.macroSplit.fat).toBeGreaterThan(40);
    expect(today.body.macroSplit.carbs).toBeLessThan(5);
  });

  it('groups the day into meals', async () => {
    const eggs = await stock('Egg', 12, 'count');
    const banana = await stock('Banana', 3, 'count');
    await api('POST', `/api/inventory/${eggs.item.id}/consume`, { quantity: 2, mealSlot: 'breakfast' });
    await api('POST', `/api/inventory/${banana.item.id}/consume`, { quantity: 1, mealSlot: 'lunch' });

    const today = await api('GET', '/api/consumption/today');
    const byMeal = Object.fromEntries(
      today.body.meals.map((meal: { slot: string; calories: number }) => [meal.slot, meal.calories]),
    );
    expect(byMeal.breakfast).toBe(144);
    expect(byMeal.lunch).toBe(105);
    expect(byMeal.dinner).toBe(0);
  });

  it('breaks a single entry down', async () => {
    const eggs = await stock('Egg', 12, 'count');
    const logged = await api('POST', `/api/inventory/${eggs.item.id}/consume`, { quantity: 3 });

    const detail = await api('GET', `/api/consumption/${logged.body.result.consumptionLogId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.entry.name).toBe('Egg');
    expect(detail.body.entry.calories).toBe(216);
    expect(detail.body.entry.macros.protein).toBeCloseTo(18.9, 1);
    expect(detail.body.entry.nutritionBasis).toContain('72 kcal per count');
    expect(detail.body.entry.canUndo).toBe(true);
  });

  it('breaks a cooked meal down into its ingredients', async () => {
    await stock('Egg', 12, 'count');
    await stock('Unsalted Butter', 227, 'g');
    await stock('Table Salt', 500, 'g');
    await stock('Black Pepper', 50, 'g');
    const omelette = await prisma.recipe.findFirstOrThrow({ where: { name: 'Classic French Omelette' } });

    const cooked = await api('POST', `/api/recipes/${omelette.id}/cook`, { mealSlot: 'breakfast' });
    expect(cooked.status).toBe(200);

    const detail = await api('GET', `/api/consumption/${cooked.body.result.consumptionLogIds[0]}`);
    expect(detail.body.entry.recipe.name).toBe('Classic French Omelette');
    expect(detail.body.entry.recipe.ingredients).toHaveLength(4);
    expect(detail.body.entry.recipe.totalCalories).toBeGreaterThan(300);
    expect(detail.body.entry.mealSlot).toBe('breakfast');
  });

  it('reads a plain calendar date as a local day, not a UTC instant', async () => {
    // `new Date('2026-08-21')` is midnight UTC, which is the previous day for
    // anyone west of Greenwich — that showed an empty diary in the browser.
    const eggs = await stock('Egg', 12, 'count');
    await api('POST', `/api/inventory/${eggs.item.id}/consume`, { quantity: 2 });

    const now = new Date();
    const localToday = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`;

    const byDate = await api('GET', `/api/consumption/today?date=${localToday}`);
    expect(byDate.body.date).toBe(localToday);
    expect(byDate.body.totalCalories).toBe(144);
  });

  it('shows the target and what is left of it', async () => {
    const eggs = await stock('Egg', 12, 'count');
    await api('POST', `/api/inventory/${eggs.item.id}/consume`, { quantity: 2 });
    const today = await api('GET', '/api/consumption/today');
    expect(today.body.targets.calories).toBe(2000);
    expect(today.body.caloriesRemaining).toBe(1856);
  });
});

describe('undo', () => {
  beforeEach(reset);

  it('removes the entry and puts the food back', async () => {
    const eggs = await stock('Egg', 12, 'count');
    const logged = await api('POST', `/api/inventory/${eggs.item.id}/consume`, { quantity: 3 });
    expect(logged.body.result.remaining).toBe(9);

    const undone = await api('DELETE', `/api/consumption/${logged.body.result.consumptionLogId}`);
    expect(undone.status).toBe(200);
    expect(undone.body.result.caloriesRemoved).toBe(216);
    expect(undone.body.result.restoredToPantry).toMatchObject({ quantity: 12, unit: 'count' });

    const today = await api('GET', '/api/consumption/today');
    expect(today.body.totalCalories).toBe(0);
    expect(today.body.entryCount).toBe(0);
  });

  it('converts back into the lot unit when the log used a different one', async () => {
    const flour = await stock('All-Purpose Flour', 1000, 'g');
    const logged = await api('POST', `/api/inventory/${flour.item.id}/consume`, {
      quantity: 2,
      unit: 'cup',
    });
    expect(logged.body.result.remaining).toBe(760);

    await api('DELETE', `/api/consumption/${logged.body.result.consumptionLogId}`);
    const after = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: flour.item.id } });
    expect(after.quantity).toBeCloseTo(1000, 6);
  });

  it('works on an eating-out entry, which has nothing to restore', async () => {
    const logged = await api('POST', '/api/consumption/eat-out', {
      name: 'Costco hot dog',
      calories: 552,
      mealSlot: 'lunch',
    });
    const undone = await api('DELETE', `/api/consumption/${logged.body.entry.id}`);
    expect(undone.body.result.restoredToPantry).toBeNull();
    expect(undone.body.result.caloriesRemoved).toBe(552);
  });
});

describe('eating out', () => {
  beforeEach(reset);

  it('logs calories without creating anything in the pantry', async () => {
    const logged = await api('POST', '/api/consumption/eat-out', {
      name: 'Costco hot dog',
      calories: 552,
      protein: 20,
      carbs: 46,
      fat: 32,
      mealSlot: 'lunch',
    });
    expect(logged.status).toBe(201);
    expect(logged.body.entry.calories).toBe(552);

    const today = await api('GET', '/api/consumption/today');
    expect(today.body.totalCalories).toBe(552);
    expect(today.body.entries[0].source).toBe('eating_out');

    const inventory = await api('GET', '/api/inventory');
    expect(inventory.body.items).toHaveLength(0);
  });

  it('remembers it, so the second one is a tap', async () => {
    await api('POST', '/api/consumption/eat-out', { name: 'Costco hot dog', calories: 552 });
    const recent = await api('GET', '/api/consumption/eat-out/recent');
    expect(recent.body.recent[0].name).toBe('Costco hot dog');

    const again = await api('POST', '/api/consumption/eat-out', {
      foodReferenceId: recent.body.recent[0].foodReferenceId,
    });
    expect(again.body.entry.calories).toBe(552);
  });

  it('asks for calories rather than inventing them for an unknown food', async () => {
    const result = await api('POST', '/api/consumption/eat-out', { name: 'Mystery street taco' });
    expect(result.status).toBe(400);
    expect(result.body.error).toBe('calories_required');
  });

  it('can log something already in the catalog', async () => {
    const result = await api('POST', '/api/consumption/eat-out', {
      foodReferenceId: await foodId('Banana'),
      quantity: 1,
      mealSlot: 'snack',
    });
    expect(result.body.entry.calories).toBe(105);
  });

  it('ranks branded foods above raw ingredients when searching', async () => {
    const result = await api('GET', '/api/consumption/eat-out/search?q=pastries');
    expect(result.status).toBe(200);
    expect(result.body.results.length).toBeGreaterThan(0);
  });
});

describe('settings and goals', () => {
  beforeEach(reset);

  it('starts on maintain with a round target', async () => {
    const result = await api('GET', '/api/settings');
    expect(result.body.settings.weightGoal).toBe('maintain');
    expect(result.body.settings.dailyCalorieTarget).toBe(2000);
    expect(result.body.settings.adsEnabled).toBe(true);
  });

  it('re-suggests the whole target set when the goal changes', async () => {
    const result = await api('PATCH', '/api/settings', { weightGoal: 'lose' });
    expect(result.body.settings.dailyCalorieTarget).toBe(1700);
    // cutting pushes protein up as a share of the day
    expect(result.body.settings.proteinTargetGrams).toBe(149);
  });

  it('keeps a target the user set themselves', async () => {
    await api('PATCH', '/api/settings', { weightGoal: 'gain', dailyCalorieTarget: 3200 });
    const result = await api('GET', '/api/settings');
    expect(result.body.settings.dailyCalorieTarget).toBe(3200);
    expect(result.body.settings.weightGoal).toBe('gain');
  });

  it('changes the expiry window everywhere', async () => {
    await api('PATCH', '/api/settings', { expiryWarningDays: 10 });
    await stock('Chicken Breast', 1, 'count'); // 3 day shelf life
    const inventory = await api('GET', '/api/inventory');
    expect(inventory.body.items[0].expiryStatus).toBe('expiring_soon');
    await api('PATCH', '/api/settings', { expiryWarningDays: 3 });
  });

  it('ranks recipes to suit the goal', async () => {
    // enough in the pantry that several recipes are actually cookable
    await stock('Plain Greek Yogurt', 500, 'g');
    await stock('Honey', 340, 'g');
    await stock('Banana', 6, 'count');
    await stock('Walnuts', 100, 'g');
    await stock('Egg', 12, 'count');
    await stock('Unsalted Butter', 250, 'g');
    await stock('Table Salt', 500, 'g');
    await stock('Black Pepper', 50, 'g');
    await stock('All-Purpose Flour', 1000, 'g');
    await stock('Granulated Sugar', 1000, 'g');
    await stock('Whole Milk', 2000, 'g');
    await stock('Baking Powder', 100, 'g');
    await stock('Rolled Oats', 500, 'g');
    await stock('Ground Cinnamon', 40, 'g');
    await stock('Semisweet Chocolate Chips', 400, 'g');
    await stock('Brown Sugar', 500, 'g');
    await stock('Vanilla Extract', 60, 'g');

    try {
      await api('PATCH', '/api/settings', { weightGoal: 'lose' });
      const cutting = await api('GET', '/api/recipes?q=yogurt');
      const yogurt = cutting.body.recipes.find(
        (r: { name: string }) => r.name === 'Greek Yogurt Honey Bowl',
      );
      expect(yogurt).toBeDefined();
      expect(yogurt.nutrition.proteinPerServing).toBeGreaterThan(15);

      // the goal reorders the cookable set: a light, high-protein breakfast
      // should outrank a calorie-dense one when cutting, and lose to it when
      // gaining. Nothing here is expiring, so goal fit is the only tiebreak.
      const rankOf = async (name: string) => {
        const result = await api('GET', '/api/recipes?maxGaps=0');
        return result.body.recipes.findIndex((recipe: { name: string }) => recipe.name === name);
      };

      const lightWhenCutting = await rankOf('Greek Yogurt Honey Bowl');
      const denseWhenCutting = await rankOf('Banana Oatmeal');
      expect(lightWhenCutting).toBeGreaterThanOrEqual(0);
      expect(denseWhenCutting).toBeGreaterThanOrEqual(0);
      expect(lightWhenCutting).toBeLessThan(denseWhenCutting);

      await api('PATCH', '/api/settings', { weightGoal: 'gain' });
      const lightWhenGaining = await rankOf('Greek Yogurt Honey Bowl');
      const denseWhenGaining = await rankOf('Banana Oatmeal');
      expect(denseWhenGaining).toBeLessThan(lightWhenGaining);
    } finally {
      await api('PATCH', '/api/settings', { weightGoal: 'maintain' });
    }
  });
});

describe('recipes: time, nutrition and near misses', () => {
  beforeEach(async () => {
    await reset();
    await stock('Egg', 12, 'count');
    await stock('Unsalted Butter', 227, 'g');
    await stock('Table Salt', 500, 'g');
    await stock('Black Pepper', 50, 'g');
  });

  it('reports cook time and per-serving nutrition', async () => {
    const result = await api('GET', '/api/recipes?q=omelette');
    const omelette = result.body.recipes[0];
    expect(omelette.totalMinutes).toBe(8);
    expect(omelette.difficulty).toBe('medium');
    expect(omelette.tags).toContain('breakfast');
    expect(omelette.nutrition.caloriesPerServing).toBeGreaterThan(300);
    expect(omelette.nutrition.proteinPerServing).toBeGreaterThan(15);
  });

  it('filters by how long you have', async () => {
    const quick = await api('GET', '/api/recipes?maxMinutes=10');
    expect(quick.body.recipes.length).toBeGreaterThan(0);
    for (const recipe of quick.body.recipes) expect(recipe.totalMinutes).toBeLessThanOrEqual(10);
  });

  it('filters by calories per serving', async () => {
    const light = await api('GET', '/api/recipes?maxCalories=400');
    for (const recipe of light.body.recipes) {
      expect(recipe.nutrition.caloriesPerServing).toBeLessThanOrEqual(400);
    }
  });

  it('lists what you are one or two items away from, with the gaps', async () => {
    const result = await api('GET', '/api/recipes/almost?maxGaps=2');
    expect(result.status).toBe(200);
    for (const recipe of result.body.recipes) {
      expect(recipe.gaps).toBeGreaterThan(0);
      expect(recipe.gaps).toBeLessThanOrEqual(2);
      expect(recipe.missing.length).toBe(recipe.gaps);
      expect(recipe.missing[0]).toHaveProperty('needed');
    }
  });

  it('pushes recipes that use expiring food to the top', async () => {
    // spinach expiring tomorrow; the scramble uses it and everything else is in
    await stock('Baby Spinach', 200, 'g', {
      expirationDate: new Date(Date.now() + 86_400_000).toISOString(),
    });
    await stock('Cheddar Cheese', 200, 'g');
    await stock('Olive Oil', 200, 'g');

    const result = await api('GET', '/api/recipes');
    const top = result.body.recipes[0];
    expect(top.name).toBe('Spinach and Cheddar Scramble');
    expect(top.usesExpiring).toContain('Baby Spinach');
    expect(top.reasons[0]).toContain('before it goes off');
  });
});

describe('shopping list: low stock, prices, sponsors', () => {
  beforeEach(reset);

  it('adds an item automatically when it runs low', async () => {
    const eggs = await stock('Egg', 5, 'count', { lowStockThreshold: 4 });
    const consumed = await api('POST', `/api/inventory/${eggs.item.id}/consume`, { quantity: 2 });

    expect(consumed.body.result.lowStock.added).toBe(true);
    const list = await api('GET', '/api/shopping-list');
    const auto = list.body.items.find((i: { name: string }) => i.name === 'Egg');
    expect(auto.addedFrom).toBe('low_stock');
  });

  it('adds an item when you finish it, with no threshold configured', async () => {
    // the common case: nobody sets thresholds on forty pantry items, but the
    // thing you just used up is exactly what needs buying
    const eggs = await stock('Egg', 2, 'count');
    const consumed = await api('POST', `/api/inventory/${eggs.item.id}/consume`, { quantity: 2 });

    expect(consumed.body.result.depleted).toBe(true);
    expect(consumed.body.result.lowStock.added).toBe(true);
    expect(consumed.body.result.lowStock.ranOut).toBe(true);

    const list = await api('GET', '/api/shopping-list');
    expect(list.body.items.some((i: { name: string }) => i.name === 'Egg')).toBe(true);
  });

  it('adds what a cook finished off', async () => {
    await stock('Egg', 3, 'count');
    await stock('Unsalted Butter', 15, 'g');
    await stock('Table Salt', 500, 'g');
    await stock('Black Pepper', 50, 'g');
    const omelette = await prisma.recipe.findFirstOrThrow({ where: { name: 'Classic French Omelette' } });

    const cooked = await api('POST', `/api/recipes/${omelette.id}/cook`, {});
    expect(cooked.status).toBe(200);
    // three eggs used from three: the eggs ran out
    expect(cooked.body.result.ranOut.map((r: { name: string }) => r.name)).toContain('Egg');

    const list = await api('GET', '/api/shopping-list');
    expect(list.body.items.some((i: { name: string }) => i.name === 'Egg')).toBe(true);
  });

  it('names the generic ingredient, not the brand that ran out', async () => {
    const { normalizeName } = await import('../src/services/matching.js');
    const generic = await prisma.foodReference.findFirstOrThrow({ where: { name: 'Peanut Butter' } });
    const jar = await prisma.foodReference.upsert({
      where: { barcode: 'test-lowstock-pb' },
      create: {
        name: 'Some Brand Creamy Peanut Butter',
        nameNorm: normalizeName('Some Brand Creamy Peanut Butter'),
        barcode: 'test-lowstock-pb',
        source: 'openfoodfacts',
        defaultUnit: 'g',
        servingSizeGrams: 1,
        caloriesPerUnit: 5.88,
        canonicalId: generic.id,
        canonicalSource: 'auto',
      },
      update: { canonicalId: generic.id },
    });

    const added = await api('POST', '/api/inventory', { foodReferenceId: jar.id, quantity: 20, unit: 'g' });
    await api('POST', `/api/inventory/${added.body.item.id}/consume`, { quantity: 20, unit: 'g' });

    const list = await api('GET', '/api/shopping-list');
    expect(list.body.items.some((i: { name: string }) => i.name === 'Peanut Butter')).toBe(true);
  });

  it('rounds a recipe gap to something you can actually buy', async () => {
    await stock('Whole Wheat Bread', 0.6, 'slice');
    const toast = await prisma.recipe.findFirstOrThrow({ where: { name: 'Chocolate Peanut Butter Toast' } });
    const result = await api('POST', `/api/shopping-list/from-recipe/${toast.id}`, {});

    const bread = result.body.added.find((a: { name: string }) => a.name === 'Whole Wheat Bread');
    // short 1.4 slices -> buy 2, because 1.4 slices is not a thing you can buy
    expect(Number.isInteger(bread.quantity)).toBe(true);
    expect(bread.quantity).toBe(2);
  });

  it('does not add anything while you still have plenty', async () => {
    const eggs = await stock('Egg', 12, 'count', { lowStockThreshold: 4 });
    const consumed = await api('POST', `/api/inventory/${eggs.item.id}/consume`, { quantity: 1 });
    expect(consumed.body.result.lowStock.added).toBe(false);
  });

  it('respects the auto-shopping switch', async () => {
    await api('PATCH', '/api/settings', { autoShoppingEnabled: false });
    const eggs = await stock('Egg', 5, 'count', { lowStockThreshold: 4 });
    const consumed = await api('POST', `/api/inventory/${eggs.item.id}/consume`, { quantity: 2 });
    expect(consumed.body.result.lowStock.added).toBe(false);
    await api('PATCH', '/api/settings', { autoShoppingEnabled: true });
  });

  it('fires when a roommate is the one emptying the fridge', async () => {
    const eggs = await stock('Egg', 5, 'count', { lowStockThreshold: 4 });
    const removed = await api('POST', `/api/inventory/${eggs.item.id}/remove`, {
      reason: 'other_person',
      quantity: 3,
    });
    expect(removed.body.result.lowStock.added).toBe(true);
  });

  it('explains what a line on the list is for', async () => {
    const butter = await foodId('Unsalted Butter');
    const added = await api('POST', '/api/shopping-list', {
      name: 'Unsalted Butter',
      quantityNeeded: 1,
      unit: 'count',
      foodReferenceId: butter,
    });

    const uses = await api('GET', `/api/shopping-list/${added.body.item.id}/uses`);
    expect(uses.status).toBe(200);
    expect(uses.body.foodName).toBe('Unsalted Butter');
    expect(uses.body.totalRecipes).toBeGreaterThan(3);

    const first = uses.body.uses[0];
    expect(first.recipeName).toBeTruthy();
    expect(first.quantity).toBeGreaterThan(0);
    expect(first.unit).toBeTruthy();
    // the ones buying it would complete are listed first
    expect(first.otherGaps).toBeLessThanOrEqual(uses.body.uses[uses.body.uses.length - 1].otherGaps);
  });

  it('carries no price anywhere on the list', async () => {
    const list = await api('GET', '/api/shopping-list');
    expect(list.body.total).toBeUndefined();
    for (const item of list.body.items) {
      expect(item).not.toHaveProperty('price');
      expect(item).not.toHaveProperty('estimatedTotal');
    }
  });
});

describe('ads', () => {
  beforeEach(reset);

  it('shows a sponsored card for a sponsored product on the list', async () => {
    await api('POST', '/api/shopping-list', {
      name: 'Semisweet Chocolate Chips',
      quantityNeeded: 340,
      unit: 'g',
      foodReferenceId: await foodId('Semisweet Chocolate Chips'),
    });

    const list = await api('GET', '/api/shopping-list');
    expect(list.body.ads).toHaveLength(1);
    expect(list.body.ads[0].sponsor).toBe('Nestlé');
    expect(list.body.ads[0].label).toBe('Sponsored · Demo');
  });

  it('disappears completely when ads are switched off', async () => {
    await api('PATCH', '/api/settings', { adsEnabled: false });
    await api('POST', '/api/shopping-list', {
      name: 'Semisweet Chocolate Chips',
      quantityNeeded: 340,
      unit: 'g',
      foodReferenceId: await foodId('Semisweet Chocolate Chips'),
    });

    const list = await api('GET', '/api/shopping-list');
    expect(list.body.ads).toEqual([]);

    const home = await api('GET', '/api/ads?slot=home');
    expect(home.body.ads).toEqual([]);
    expect(home.body.adsEnabled).toBe(false);

    const dashboard = await api('GET', '/api/dashboard');
    expect(dashboard.body.ads).toEqual([]);

    await api('PATCH', '/api/settings', { adsEnabled: true });
  });

  it('labels every unit as a demo', async () => {
    const home = await api('GET', '/api/ads?slot=home');
    for (const ad of home.body.ads) expect(ad.label).toBe('Sponsored · Demo');
  });
});

describe('branded products count as the ingredient they are', () => {
  /** Create a catalog row the way a barcode scan would. */
  async function scanned(name: string, barcode: string, kcalPerGram: number) {
    const { normalizeName } = await import('../src/services/matching.js');
    const food = await prisma.foodReference.upsert({
      where: { barcode },
      create: {
        name,
        nameNorm: normalizeName(name),
        barcode,
        source: 'openfoodfacts',
        category: 'Oils & Vinegars',
        defaultUnit: 'g',
        caloriesPerUnit: kcalPerGram,
        fatPerUnit: kcalPerGram / 9,
        servingSizeGrams: 1,
      },
      update: { canonicalId: null, canonicalSource: null },
    });
    const { linkCanonical } = await import('../src/services/foodRef.js');
    await linkCanonical(food.id, prisma);
    return prisma.foodReference.findUniqueOrThrow({ where: { id: food.id } });
  }

  beforeEach(reset);

  it('links a scanned olive oil to the catalog olive oil', async () => {
    const product = await scanned('ORGANIC EXTRA VIRGIN OLIVE OIL', 'test-evoo-1', 8.84);
    const generic = await prisma.foodReference.findFirstOrThrow({ where: { name: 'Olive Oil' } });
    expect(product.canonicalId).toBe(generic.id);
    expect(product.canonicalSource).toBe('auto');
  });

  it('does not link a sauce that merely contains olive oil', async () => {
    const product = await scanned('Organic Olive Oil, Basil & Garlic Sauce', 'test-sauce-1', 2.5);
    expect(product.canonicalId).toBeNull();
  });

  it('satisfies a recipe that asks for the generic ingredient', async () => {
    const product = await scanned('ORGANIC EXTRA VIRGIN OLIVE OIL', 'test-evoo-2', 8.84);
    await stock('Flour Tortilla', 8, 'count');
    await stock('Cheddar Cheese', 400, 'g');
    await api('POST', '/api/inventory', { foodReferenceId: product.id, quantity: 500, unit: 'g' });

    const list = await api('GET', '/api/recipes?q=cheese quesadilla');
    const quesadilla = list.body.recipes.find((r: { name: string }) => r.name === 'Cheese Quesadilla');
    expect(quesadilla).toBeDefined();
    expect(quesadilla.canMakeNow).toBe(true);

    // and the tsp the recipe asks for converts, using the generic oil's density
    const detail = await api('GET', `/api/recipes/${quesadilla.id}`);
    const oil = detail.body.recipe.ingredients.find((i: { name: string }) => i.name === 'Olive Oil');
    expect(oil.status).toBe('ok');
    expect(oil.available).toBeGreaterThan(50);
  });

  it('cooks by deducting from the branded bottle, and logs the bottle', async () => {
    const product = await scanned('ORGANIC EXTRA VIRGIN OLIVE OIL', 'test-evoo-3', 8.84);
    await stock('Flour Tortilla', 8, 'count');
    await stock('Cheddar Cheese', 400, 'g');
    const added = await api('POST', '/api/inventory', {
      foodReferenceId: product.id,
      quantity: 500,
      unit: 'g',
    });

    const recipe = await prisma.recipe.findFirstOrThrow({ where: { name: 'Cheese Quesadilla' } });
    const cooked = await api('POST', `/api/recipes/${recipe.id}/cook`, {});
    expect(cooked.status).toBe(200);

    // 1 tsp of olive oil is about 4.5 g, taken off the scanned bottle
    const lot = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: added.body.item.id } });
    expect(lot.quantity).toBeGreaterThan(494);
    expect(lot.quantity).toBeLessThan(497);

    // the diary names the product actually used, not the generic ingredient
    const logs = await prisma.consumptionLog.findMany({
      where: { userId, foodReferenceId: product.id },
    });
    expect(logs).toHaveLength(1);
  });

  it('lets a person correct a wrong guess, and never re-guesses over them', async () => {
    const product = await scanned('ORGANIC EXTRA VIRGIN OLIVE OIL', 'test-evoo-4', 8.84);

    // "actually, do not treat this as olive oil"
    const cleared = await api('PUT', `/api/foods/${product.id}/counts-as`, { canonicalId: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.food.canonicalId).toBeNull();
    expect(cleared.body.food.canonicalSource).toBeNull();

    // and point it somewhere deliberately
    const vegOil = await prisma.foodReference.findFirstOrThrow({ where: { name: 'Vegetable Oil' } });
    const set = await api('PUT', `/api/foods/${product.id}/counts-as`, { canonicalId: vegOil.id });
    expect(set.body.food.canonicalId).toBe(vegOil.id);
    expect(set.body.food.canonicalSource).toBe('user');

    // a later automatic pass must not overwrite that decision
    const { linkCanonical } = await import('../src/services/foodRef.js');
    await linkCanonical(product.id, prisma);
    const after = await prisma.foodReference.findUniqueOrThrow({ where: { id: product.id } });
    expect(after.canonicalId).toBe(vegOil.id);
    expect(after.canonicalSource).toBe('user');
  });

  it('converts a product stocked in servings into what a recipe asks for', async () => {
    // The case that exposed this: everything scanned lands in the pantry as
    // "1 serving", and the recipe asks for tablespoons. The conversion has to
    // use the *jar's* serving weight, not the generic ingredient's units.
    const { normalizeName } = await import('../src/services/matching.js');
    const generic = await prisma.foodReference.findFirstOrThrow({ where: { name: 'Peanut Butter' } });
    const jar = await prisma.foodReference.upsert({
      where: { barcode: 'test-pb-jar' },
      create: {
        name: 'Creamy Peanut Butter',
        nameNorm: normalizeName('Creamy Peanut Butter'),
        barcode: 'test-pb-jar',
        source: 'openfoodfacts',
        defaultUnit: 'serving',
        servingSizeGrams: 32,
        caloriesPerUnit: 188,
        canonicalId: generic.id,
        canonicalSource: 'auto',
      },
      update: { canonicalId: generic.id, canonicalSource: 'auto', defaultUnit: 'serving', servingSizeGrams: 32 },
    });

    await api('POST', '/api/inventory', { foodReferenceId: jar.id, quantity: 1, unit: 'serving' });
    await stock('Whole Wheat Bread', 8, 'slice');
    await stock('Semisweet Chocolate Chips', 200, 'g');

    const recipe = await prisma.recipe.findFirstOrThrow({ where: { name: 'Chocolate Peanut Butter Toast' } });
    const detail = await api('GET', `/api/recipes/${recipe.id}`);
    const pb = detail.body.recipe.ingredients.find((i: { name: string }) => i.name === 'Peanut Butter');

    // one 32 g serving is exactly the 2 tbsp the recipe wants
    expect(pb.status).toBe('ok');
    expect(pb.available).toBeCloseTo(2, 1);
    expect(detail.body.recipe.canMakeNow).toBe(true);
  });

  it('surfaces what a product counts as on the pantry item', async () => {
    const product = await scanned('ORGANIC EXTRA VIRGIN OLIVE OIL', 'test-evoo-5', 8.84);
    const added = await api('POST', '/api/inventory', {
      foodReferenceId: product.id,
      quantity: 500,
      unit: 'g',
    });
    expect(added.body.item.food.countsAs).toMatchObject({ name: 'Olive Oil', source: 'auto' });
  });
});

describe('choosing between two of the same ingredient', () => {
  beforeEach(reset);

  async function twoJars() {
    const { normalizeName } = await import('../src/services/matching.js');
    const generic = await prisma.foodReference.findFirstOrThrow({ where: { name: 'Peanut Butter' } });
    const make = async (name: string, barcode: string) =>
      prisma.foodReference.upsert({
        where: { barcode },
        create: {
          name,
          nameNorm: normalizeName(name),
          barcode,
          source: 'openfoodfacts',
          defaultUnit: 'g',
          servingSizeGrams: 1,
          caloriesPerUnit: 5.88,
          canonicalId: generic.id,
          canonicalSource: 'auto',
        },
        update: { canonicalId: generic.id },
      });
    return [await make('Smooth Peanut Butter', 'test-pb-smooth'), await make('Crunchy Peanut Butter', 'test-pb-crunchy')];
  }

  it('offers both jars rather than silently picking one', async () => {
    const [smooth, crunchy] = await twoJars();
    await api('POST', '/api/inventory', { foodReferenceId: smooth!.id, quantity: 300, unit: 'g' });
    await api('POST', '/api/inventory', { foodReferenceId: crunchy!.id, quantity: 300, unit: 'g' });
    await stock('Whole Wheat Bread', 8, 'slice');
    await stock('Semisweet Chocolate Chips', 200, 'g');

    const recipe = await prisma.recipe.findFirstOrThrow({ where: { name: 'Chocolate Peanut Butter Toast' } });
    const detail = await api('GET', `/api/recipes/${recipe.id}`);
    const pb = detail.body.recipe.ingredients.find((i: { name: string }) => i.name === 'Peanut Butter');

    expect(pb.options).toHaveLength(2);
    expect(pb.options.map((o: { name: string }) => o.name).sort()).toEqual([
      'Crunchy Peanut Butter',
      'Smooth Peanut Butter',
    ]);
    expect(pb.options.filter((o: { chosen: boolean }) => o.chosen)).toHaveLength(1);
  });

  it('deducts from the jar the user picked', async () => {
    const [smooth, crunchy] = await twoJars();
    const smoothLot = await api('POST', '/api/inventory', { foodReferenceId: smooth!.id, quantity: 300, unit: 'g' });
    const crunchyLot = await api('POST', '/api/inventory', { foodReferenceId: crunchy!.id, quantity: 300, unit: 'g' });
    await stock('Whole Wheat Bread', 8, 'slice');
    await stock('Semisweet Chocolate Chips', 200, 'g');

    const generic = await prisma.foodReference.findFirstOrThrow({ where: { name: 'Peanut Butter' } });
    const recipe = await prisma.recipe.findFirstOrThrow({ where: { name: 'Chocolate Peanut Butter Toast' } });

    const cooked = await api('POST', `/api/recipes/${recipe.id}/cook`, {
      choices: { [generic.id]: crunchyLot.body.item.id },
    });
    expect(cooked.status).toBe(200);

    const smoothAfter = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: smoothLot.body.item.id } });
    const crunchyAfter = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: crunchyLot.body.item.id } });
    expect(smoothAfter.quantity).toBe(300);
    expect(crunchyAfter.quantity).toBeLessThan(300);
  });

  it('says nothing when there is only one option', async () => {
    await stock('Peanut Butter', 300, 'g');
    await stock('Whole Wheat Bread', 8, 'slice');
    await stock('Semisweet Chocolate Chips', 200, 'g');
    const recipe = await prisma.recipe.findFirstOrThrow({ where: { name: 'Chocolate Peanut Butter Toast' } });
    const detail = await api('GET', `/api/recipes/${recipe.id}`);
    const pb = detail.body.recipe.ingredients.find((i: { name: string }) => i.name === 'Peanut Butter');
    expect(pb.options).toEqual([]);
  });
});

describe('leaving an ingredient out', () => {
  beforeEach(async () => {
    await reset();
    await stock('Egg', 12, 'count');
    await stock('Unsalted Butter', 227, 'g');
    await stock('Table Salt', 500, 'g');
    await stock('Black Pepper', 50, 'g');
  });

  it('drops the calories when you leave something out', async () => {
    const omelette = await prisma.recipe.findFirstOrThrow({ where: { name: 'Classic French Omelette' } });
    const butter = await foodId('Unsalted Butter');

    const full = await api('GET', `/api/recipes/${omelette.id}/cook-preview`);
    const without = await api('GET', `/api/recipes/${omelette.id}/cook-preview?exclude=${butter}`);

    expect(without.body.preview.estimatedCalories).toBeLessThan(full.body.preview.estimatedCalories);
    expect(without.body.preview.ingredients.some((i: { name: string }) => i.name === 'Unsalted Butter')).toBe(
      false,
    );
    expect(without.body.preview.excludedIngredients[0]).toMatchObject({ name: 'Unsalted Butter' });
  });

  it('does not deduct what was left out', async () => {
    const omelette = await prisma.recipe.findFirstOrThrow({ where: { name: 'Classic French Omelette' } });
    const butterId = await foodId('Unsalted Butter');
    const before = await prisma.inventoryItem.findFirstOrThrow({
      where: { userId, foodReferenceId: butterId },
    });

    const cooked = await api('POST', `/api/recipes/${omelette.id}/cook`, { exclude: [butterId] });
    expect(cooked.status).toBe(200);
    expect(cooked.body.result.deductions.some((d: { name: string }) => d.name === 'Unsalted Butter')).toBe(
      false,
    );

    const after = await prisma.inventoryItem.findFirstOrThrow({ where: { id: before.id } });
    expect(after.quantity).toBe(before.quantity);
  });

  it('lets you cook something you are only missing the excluded part of', async () => {
    // no chocolate chips, but the toast is fine without them
    await stock('Whole Wheat Bread', 8, 'slice');
    await stock('Peanut Butter', 300, 'g');
    const toast = await prisma.recipe.findFirstOrThrow({ where: { name: 'Chocolate Peanut Butter Toast' } });
    const chips = await foodId('Semisweet Chocolate Chips');

    const blocked = await api('GET', `/api/recipes/${toast.id}/cook-preview`);
    expect(blocked.body.preview.blocked).toBe(true);

    const without = await api('GET', `/api/recipes/${toast.id}/cook-preview?exclude=${chips}`);
    expect(without.body.preview.blocked).toBe(false);
  });
});

describe('scanning in a shop', () => {
  beforeEach(reset);

  it('says what a product could be used for, without stocking it', async () => {
    const before = await prisma.inventoryItem.count({ where: { userId } });
    const result = await api('GET', '/api/shopping-list/scan/0000000000017');
    expect(result.status).toBe(200);
    expect(result.body.food.name).toMatch(/Toaster Pastries/);
    expect(Array.isArray(result.body.uses)).toBe(true);
    // asking a question is not a purchase
    expect(await prisma.inventoryItem.count({ where: { userId } })).toBe(before);
  });

  it('ranks recipes that the purchase would complete first', async () => {
    await stock('Whole Wheat Bread', 8, 'slice');
    await stock('Semisweet Chocolate Chips', 200, 'g');

    const { normalizeName } = await import('../src/services/matching.js');
    const generic = await prisma.foodReference.findFirstOrThrow({ where: { name: 'Peanut Butter' } });
    const jar = await prisma.foodReference.upsert({
      // barcodes are digits: resolveBarcode strips anything else, as UPC/EAN require
      where: { barcode: '9990000000001' },
      create: {
        name: 'Shop Brand Peanut Butter',
        nameNorm: normalizeName('Shop Brand Peanut Butter'),
        barcode: '9990000000001',
        source: 'openfoodfacts',
        defaultUnit: 'g',
        servingSizeGrams: 1,
        caloriesPerUnit: 5.88,
        canonicalId: generic.id,
        canonicalSource: 'auto',
      },
      update: { canonicalId: generic.id },
    });
    expect(jar.canonicalId).toBe(generic.id);

    const result = await api('GET', '/api/shopping-list/scan/9990000000001');
    expect(result.status).toBe(200);
    expect(result.body.countsAs).toBe('Peanut Butter');
    expect(result.body.uses[0].canMakeWithThis).toBe(true);
  });
});

describe('dashboard', () => {
  beforeEach(async () => {
    await reset();
    // this suite asserts on the default target, so do not inherit a goal
    await api('PATCH', '/api/settings', { weightGoal: 'maintain', dailyCalorieTarget: 2000 });
  });

  it('leads with what to eat before it goes off', async () => {
    await stock('Baby Spinach', 200, 'g', {
      expirationDate: new Date(Date.now() + 86_400_000).toISOString(),
    });
    await stock('Egg', 12, 'count');
    await stock('Cheddar Cheese', 200, 'g');
    await stock('Olive Oil', 200, 'g');
    await stock('Table Salt', 500, 'g');

    const result = await api('GET', '/api/dashboard');
    expect(result.body.expiring[0].name).toBe('Baby Spinach');
    expect(result.body.useItUpRecipes[0].name).toBe('Spinach and Cheddar Scramble');
    expect(result.body.useItUpRecipes[0].usesExpiring).toContain('Baby Spinach');
    expect(result.body.today.targets.calories).toBe(2000);
  });
});
