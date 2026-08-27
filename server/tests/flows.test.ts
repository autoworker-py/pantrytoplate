/**
 * Integration tests for the key user flows in spec section 9. These run against
 * a real (seeded) SQLite database through the HTTP layer, with OFFLINE_MODE on
 * so no test ever touches USDA or Open Food Facts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { PRIVACY_VERSION } from '../src/content/privacy.js';

let app: FastifyInstance;
let token: string;

const auth = () => ({ authorization: `Bearer ${token}` });

async function api(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) {
  const response = await app.inject({ method, url, headers: auth(), ...(payload ? { payload } : {}) });
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : null };
}

/** Look up a seeded catalog entry by name. */
async function foodId(name: string): Promise<string> {
  const food = await prisma.foodReference.findFirstOrThrow({ where: { name } });
  return food.id;
}

async function stock(name: string, quantity: number, unit: string, expiresInDays: number | null = null) {
  const expirationDate =
    expiresInDays === null
      ? null
      : new Date(Date.now() + expiresInDays * 86_400_000).toISOString();
  const result = await api('POST', '/api/inventory', {
    foodReferenceId: await foodId(name),
    quantity,
    unit,
    expirationDate,
  });
  expect(result.status).toBe(201);
  return result.body.item;
}

async function clearInventory() {
  const user = await prisma.user.findFirstOrThrow({ where: { email: userEmail } });
  await prisma.consumptionLog.deleteMany({ where: { userId: user.id } });
  await prisma.inventoryItem.deleteMany({ where: { userId: user.id } });
  await prisma.shoppingListItem.deleteMany({ where: { userId: user.id } });
}

const userEmail = `flows-${Date.now()}@example.test`;

beforeAll(async () => {
  app = await buildApp();
  const registered = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: userEmail, password: 'testpassword', acceptPrivacyVersion: PRIVACY_VERSION },
  });
  expect(registered.statusCode).toBe(201);
  token = JSON.parse(registered.body).token;
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('flow 1: add an item manually', () => {
  beforeAll(clearInventory);

  it('links a typed name to the existing catalog entry instead of duplicating it', async () => {
    const before = await prisma.foodReference.count();
    const result = await api('POST', '/api/inventory', { name: 'eggs', quantity: 12, unit: 'count' });

    expect(result.status).toBe(201);
    expect(result.body.resolvedFrom).toBe('name');
    expect(result.body.createdFood).toBe(false);
    expect(result.body.item.food.name).toBe('Egg');
    expect(await prisma.foodReference.count()).toBe(before);
  });

  it('creates a manual catalog entry for a food nobody has heard of', async () => {
    const result = await api('POST', '/api/inventory', {
      name: 'Grandmas Pickled Ramps',
      quantity: 2,
      unit: 'jar',
      category: 'Condiments',
    });
    expect(result.status).toBe(201);
    expect(result.body.createdFood).toBe(true);
    expect(result.body.item.food.source).toBe('manual');
    // nutrition is left null rather than invented
    expect(result.body.item.food.caloriesPerUnit).toBeNull();
    expect(result.body.item.caloriesRemaining).toBeNull();
  });

  it('rejects a zero or negative quantity', async () => {
    const result = await api('POST', '/api/inventory', { name: 'eggs', quantity: 0, unit: 'count' });
    expect(result.status).toBe(400);
  });
});

describe('flow 2: add an item by barcode', () => {
  it('resolves a known barcode from the local cache with no network', async () => {
    const result = await api('GET', '/api/foods/barcode/0000000000017');
    expect(result.status).toBe(200);
    expect(result.body.cached).toBe(true);
    expect(result.body.food.name).toMatch(/Toaster Pastries/);
  });

  it('adds inventory straight from a scan', async () => {
    const result = await api('POST', '/api/inventory', {
      barcode: '0000000000017',
      quantity: 1,
      unit: 'box',
    });
    expect(result.status).toBe(201);
    expect(result.body.resolvedFrom).toBe('barcode');
    expect(result.body.item.quantity).toBe(1);
    expect(result.body.item.unit).toBe('box');
    // a box is 10 pastries at 200 kcal each
    expect(result.body.item.caloriesRemaining).toBe(2000);
  });

  it('fails gracefully — and points at manual entry — when the lookup cannot be made', async () => {
    const result = await api('GET', '/api/foods/barcode/9999999999999');
    expect(result.status).toBe(502);
    expect(result.body.fallback).toBe('manual_entry');
  });
});

describe('flow 3: log standalone consumption', () => {
  beforeAll(clearInventory);

  it('decrements the item and records the calories without any re-entry', async () => {
    const item = await stock('Egg', 12, 'count', 20);

    const consumed = await api('POST', `/api/inventory/${item.id}/consume`, { quantity: 3 });
    expect(consumed.status).toBe(200);
    expect(consumed.body.result.remaining).toBe(9);
    expect(consumed.body.result.calories).toBe(216); // 3 x 72 kcal

    const list = await api('GET', '/api/inventory');
    expect(list.body.items.find((i: { id: string }) => i.id === item.id).quantity).toBe(9);

    const today = await api('GET', '/api/consumption/today');
    expect(today.body.totalCalories).toBe(216);
    expect(today.body.entries[0].name).toBe('Egg');
    expect(today.body.entries[0].source).toBe('manual');
  });

  it('eats one pop tart out of a box of ten', async () => {
    const item = await stock('Frosted Strawberry Toaster Pastries', 10, 'count', 200);
    const consumed = await api('POST', `/api/inventory/${item.id}/consume`, { quantity: 1 });
    expect(consumed.body.result.remaining).toBe(9);
    expect(consumed.body.result.calories).toBe(200);
  });

  it('refuses to consume more than the user owns', async () => {
    const item = await stock('Banana', 2, 'count');
    const result = await api('POST', `/api/inventory/${item.id}/consume`, { quantity: 5 });
    expect(result.status).toBe(409);
    expect(result.body.error).toBe('insufficient_quantity');

    const after = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(after.quantity).toBe(2);
  });

  it('converts the logged unit into the lot unit before subtracting', async () => {
    const item = await stock('All-Purpose Flour', 1000, 'g');
    const consumed = await api('POST', `/api/inventory/${item.id}/consume`, { quantity: 2, unit: 'cup' });
    expect(consumed.status).toBe(200);
    expect(consumed.body.result.remaining).toBe(760); // 1000 g - 2 cups (240 g)
  });

  it('will not guess when the logged unit cannot be converted', async () => {
    const item = await stock('Baby Spinach', 200, 'g');
    const result = await api('POST', `/api/inventory/${item.id}/consume`, { quantity: 1, unit: 'handful' });
    expect(result.status).toBe(409);
    expect(result.body.error).toBe('no_conversion');
  });
});

describe('flow 4: search recipes against real inventory', () => {
  beforeAll(async () => {
    await clearInventory();
    await stock('Egg', 12, 'count', 20);
    await stock('Unsalted Butter', 227, 'g', 40);
    await stock('Table Salt', 500, 'g');
    await stock('Black Pepper', 50, 'g');
  });

  it('finds a recipe by name', async () => {
    const result = await api('GET', '/api/recipes?q=omelette');
    expect(result.status).toBe(200);
    const names = result.body.recipes.map((r: { name: string }) => r.name);
    expect(names).toContain('Classic French Omelette');
    // and the one they can actually cook is first
    expect(result.body.recipes[0].canMakeNow).toBe(true);
  });

  it('ranks recipes the user can make right now above ones with gaps', async () => {
    const result = await api('GET', '/api/recipes');
    const recipes: Array<{ name: string; canMakeNow: boolean; gaps: number }> = result.body.recipes;

    expect(recipes.length).toBeGreaterThan(0);
    expect(recipes[0]!.canMakeNow).toBe(true);

    // every cookable recipe comes before every non-cookable one
    const firstGap = recipes.findIndex((recipe) => !recipe.canMakeNow);
    if (firstGap !== -1) {
      expect(recipes.slice(firstGap).some((recipe) => recipe.canMakeNow)).toBe(false);
    }
  });

  it('reports per-ingredient status: have, short, or missing', async () => {
    const list = await api('GET', '/api/recipes?q=pancakes');
    const pancakes = list.body.recipes.find(
      (recipe: { name: string }) => recipe.name === 'Buttermilk-Style Pancakes',
    );
    expect(pancakes).toBeDefined();
    const detail = await api('GET', `/api/recipes/${pancakes.id}`);
    const byName = Object.fromEntries(
      detail.body.recipe.ingredients.map((i: { name: string; status: string }) => [i.name, i.status]),
    );
    expect(byName.Egg).toBe('ok');
    expect(byName['All-Purpose Flour']).toBe('missing');
    expect(byName['Whole Milk']).toBe('missing');
  });
});

describe('flow 5: cook a recipe', () => {
  let omeletteId: string;

  beforeAll(async () => {
    await clearInventory();
    omeletteId = (await prisma.recipe.findFirstOrThrow({ where: { name: 'Classic French Omelette' } })).id;
    await stock('Egg', 12, 'count', 20);
    await stock('Unsalted Butter', 227, 'g', 40);
    await stock('Table Salt', 500, 'g');
    await stock('Black Pepper', 50, 'g');
  });

  it('shows exactly what will be deducted before anything changes', async () => {
    const preview = await api('GET', `/api/recipes/${omeletteId}/cook-preview`);
    expect(preview.status).toBe(200);
    expect(preview.body.preview.blocked).toBe(false);

    const eggs = preview.body.preview.ingredients.find((i: { name: string }) => i.name === 'Egg');
    expect(eggs.status).toBe('ok');
    expect(eggs.requiredQuantity).toBe(3);
    expect(eggs.plan.deductions[0].quantityAfter).toBe(9);

    // nothing was mutated by previewing
    const inventory = await api('GET', '/api/inventory');
    expect(inventory.body.items.find((i: { food: { name: string } }) => i.food.name === 'Egg').quantity).toBe(12);
  });

  it('decrements every ingredient and writes the log on confirmation', async () => {
    const result = await api('POST', `/api/recipes/${omeletteId}/cook`, {});
    expect(result.status).toBe(200);

    const deductions = Object.fromEntries(
      result.body.result.deductions.map((d: { name: string; quantityDeducted: number }) => [d.name, d.quantityDeducted]),
    );
    expect(deductions.Egg).toBe(3);
    expect(deductions['Unsalted Butter']).toBeCloseTo(14.2, 1); // 1 tbsp butter

    const inventory = await api('GET', '/api/inventory');
    const eggs = inventory.body.items.find((i: { food: { name: string } }) => i.food.name === 'Egg');
    expect(eggs.quantity).toBe(9);

    // the four ingredient rows collapse into one meal in the diary
    const today = await api('GET', '/api/consumption/today');
    const recipeEntries = today.body.entries.filter((e: { source: string }) => e.source === 'recipe');
    expect(recipeEntries).toHaveLength(1);
    expect(recipeEntries[0].kind).toBe('meal');
    expect(recipeEntries[0].name).toBe('Classic French Omelette');
    expect(recipeEntries[0].ingredientCount).toBe(4);
  });

  it('scales the deduction when cooking more servings', async () => {
    const result = await api('POST', `/api/recipes/${omeletteId}/cook`, { servings: 2 });
    expect(result.status).toBe(200);
    const eggs = result.body.result.deductions.find((d: { name: string }) => d.name === 'Egg');
    expect(eggs.quantityDeducted).toBe(6);
  });

  it('is atomic: an insufficient ingredient leaves inventory completely untouched', async () => {
    await clearInventory();
    await stock('Egg', 2, 'count'); // recipe needs 3
    await stock('Unsalted Butter', 227, 'g');
    await stock('Table Salt', 500, 'g');
    await stock('Black Pepper', 50, 'g');

    const result = await api('POST', `/api/recipes/${omeletteId}/cook`, {});
    expect(result.status).toBe(409);
    expect(result.body.error).toBe('insufficient_inventory');
    expect(result.body.details[0].name).toBe('Egg');
    expect(result.body.details[0].shortfall).toBe(1);

    // no partial deduction: butter, salt and pepper are all still whole
    const inventory = await api('GET', '/api/inventory');
    const quantities = Object.fromEntries(
      inventory.body.items.map((i: { food: { name: string }; quantity: number }) => [i.food.name, i.quantity]),
    );
    expect(quantities.Egg).toBe(2);
    expect(quantities['Unsalted Butter']).toBe(227);
    expect(quantities['Table Salt']).toBe(500);
    expect(quantities['Black Pepper']).toBe(50);

    const user = await prisma.user.findFirstOrThrow({ where: { email: userEmail } });
    expect(await prisma.consumptionLog.count({ where: { userId: user.id } })).toBe(0);
  });

  it('draws a cup-measured ingredient out of a weight-measured lot', async () => {
    await clearInventory();
    const cookies = await prisma.recipe.findFirstOrThrow({ where: { name: 'Chocolate Chip Cookies' } });
    await stock('All-Purpose Flour', 32, 'oz');          // 907.18 g; recipe needs 2 cups = 240 g
    await stock('Unsalted Butter', 500, 'g');
    await stock('Granulated Sugar', 1000, 'g');
    await stock('Brown Sugar', 1000, 'g');
    await stock('Egg', 12, 'count');
    await stock('Vanilla Extract', 100, 'g');
    await stock('Semisweet Chocolate Chips', 500, 'g');
    await stock('Baking Powder', 100, 'g');
    await stock('Table Salt', 500, 'g');

    const result = await api('POST', `/api/recipes/${cookies.id}/cook`, {});
    expect(result.status).toBe(200);

    const flour = result.body.result.deductions.find((d: { name: string }) => d.name === 'All-Purpose Flour');
    expect(flour.unit).toBe('oz');
    expect(flour.quantityDeducted).toBeCloseTo(8.47, 1);   // 240 g expressed in oz
    expect(flour.remaining).toBeCloseTo(23.5, 1);
  });
});

describe('flow 6: expiration alerts', () => {
  beforeAll(async () => {
    await clearInventory();
    await stock('Whole Milk', 1, 'gallon', 1);
    await stock('Baby Spinach', 142, 'g', 2);
    await stock('Granulated Sugar', 1000, 'g', 400);
    await stock('Table Salt', 500, 'g', null);
  });

  it('surfaces only items inside the window, soonest first', async () => {
    const result = await api('GET', '/api/inventory/expiring?days=3');
    expect(result.status).toBe(200);
    const names = result.body.items.map((i: { food: { name: string } }) => i.food.name);
    expect(names).toEqual(['Whole Milk', 'Baby Spinach']);
  });

  it('flags status on the inventory list itself', async () => {
    const result = await api('GET', '/api/inventory?sort=expiration');
    const statuses = Object.fromEntries(
      result.body.items.map((i: { food: { name: string }; expiryStatus: string }) => [i.food.name, i.expiryStatus]),
    );
    expect(statuses['Whole Milk']).toBe('expiring_soon');
    expect(statuses['Granulated Sugar']).toBe('ok');
    // salt was added with no date, so it now carries an estimated shelf life
    // rather than an empty field (see the shelf-life tests in features.test.ts)
    expect(statuses['Table Salt']).toBe('ok');
  });

  it('feeds the dashboard', async () => {
    const result = await api('GET', '/api/dashboard');
    expect(result.body.expiring.length).toBe(2);
    expect(result.body.inventoryCount).toBe(4);
  });
});

describe('flow 7: shopping list', () => {
  let pancakesId: string;

  beforeAll(async () => {
    await clearInventory();
    pancakesId = (await prisma.recipe.findFirstOrThrow({ where: { name: 'Buttermilk-Style Pancakes' } })).id;
    await stock('Egg', 12, 'count');
    await stock('All-Purpose Flour', 100, 'g'); // recipe needs 1 cup = 120 g, so short by 20 g
  });

  it('adds every gap from a recipe in one call', async () => {
    const result = await api('POST', `/api/shopping-list/from-recipe/${pancakesId}`, {});
    expect(result.status).toBe(201);

    const added = Object.fromEntries(
      result.body.added.map((a: { name: string; quantity: number }) => [a.name, a.quantity]),
    );
    expect(added['Whole Milk']).toBeDefined();   // missing entirely
    // short by 0.167 of a cup, rounded up to a half cup — you cannot buy 0.167
    expect(added['All-Purpose Flour']).toBe(0.5);
    expect(added.Egg).toBeUndefined();            // already covered
  });

  it('does not duplicate an item already on the list', async () => {
    await api('POST', `/api/shopping-list/from-recipe/${pancakesId}`, {});
    const list = await api('GET', '/api/shopping-list');
    const milkEntries = list.body.items.filter((i: { name: string }) => i.name === 'Whole Milk');
    expect(milkEntries).toHaveLength(1);
  });

  it('accepts free-text manual additions', async () => {
    const result = await api('POST', '/api/shopping-list', { name: 'Paper towels', quantityNeeded: 2, unit: 'roll' });
    expect(result.status).toBe(201);
    expect(result.body.item.addedFrom).toBe('manual');
  });

  it('checking an item off can put it straight into inventory', async () => {
    const list = await api('GET', '/api/shopping-list');
    const milk = list.body.items.find((i: { name: string }) => i.name === 'Whole Milk');

    const result = await api('POST', `/api/shopping-list/${milk.id}/stock`, {
      quantity: 1,
      unit: 'gallon',
      expirationDate: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    expect(result.status).toBe(201);

    const inventory = await api('GET', '/api/inventory');
    const stocked = inventory.body.items.find((i: { food: { name: string } }) => i.food.name === 'Whole Milk');
    expect(stocked.quantity).toBe(1);
    expect(stocked.unit).toBe('gallon');

    const updated = await api('GET', '/api/shopping-list');
    expect(updated.body.items.find((i: { id: string }) => i.id === milk.id).isChecked).toBe(true);
  });

  it('recipe gaps shrink once the shopping is done', async () => {
    const detail = await api('GET', `/api/recipes/${pancakesId}`);
    const milk = detail.body.recipe.ingredients.find((i: { name: string }) => i.name === 'Whole Milk');
    expect(milk.status).toBe('ok');
  });
});

describe('auth', () => {
  it('rejects unauthenticated requests', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/inventory' });
    expect(response.statusCode).toBe(401);
  });

  it('rejects a duplicate registration', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: userEmail, password: 'testpassword', acceptPrivacyVersion: PRIVACY_VERSION },
    });
    expect(response.statusCode).toBe(409);
  });

  it('logs in with the right password and not the wrong one', async () => {
    const good = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: userEmail, password: 'testpassword' },
    });
    expect(good.statusCode).toBe(200);

    const bad = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: userEmail, password: 'wrongpassword' },
    });
    expect(bad.statusCode).toBe(401);
  });
});
