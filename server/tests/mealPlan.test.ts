/**
 * Planning the week: Pro only, the pantry shared out between the week's meals,
 * and the shopping list kept in step with the plan.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { PRIVACY_VERSION } from '../src/content/privacy.js';
import { deleteAccount } from '../src/services/auth.js';

let app: FastifyInstance;
const stamp = Date.now();
type Who = { token: string; id: string };
let planner: Who;
let free: Who;

async function register(label: string): Promise<Who> {
  const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: `${label}-${stamp}@example.test`, password: 'testpassword', acceptPrivacyVersion: PRIVACY_VERSION } });
  const body = JSON.parse(response.body);
  return { token: body.token, id: body.user.id };
}
async function call(who: Who, method: 'GET' | 'POST' | 'DELETE', url: string, payload?: object, zone?: string) {
  const response = await app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${who.token}`, ...(zone ? { 'x-time-zone': zone } : {}) },
    ...(payload === undefined ? {} : { payload }),
  });
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : null };
}
const recipes: Record<string, string> = {};
const recipe = async (name: string) => ({ id: recipes[name]! });
const food = (name: string) => prisma.foodReference.findFirstOrThrow({ where: { name, ownerId: null, barcode: null } });
const today = () => new Date().toISOString().slice(0, 10);
const listed = (who: Who) => prisma.shoppingListItem.findMany({ where: { userId: who.id } });
async function stock(who: Who, name: string, quantity: number, unit: string) {
  const added = await call(who, 'POST', '/api/inventory', { foodReferenceId: (await food(name)).id, quantity, unit });
  expect(added.status).toBe(201);
}
const plan = async (name: string, plannedFor = today()) => call(planner, 'POST', '/api/planning/plan', { recipeId: (await recipe(name)).id, plannedFor });

beforeAll(async () => {
  app = await buildApp();
  planner = await register('planner');
  free = await register('planfree');
  await prisma.user.update({ where: { id: planner.id }, data: { plusSince: new Date() } });
  // the planner's own recipes: shipped ones are rewritten by other test files as they run
  const egg = await food('Egg');
  for (const [name, eggs] of [['Classic French Omelette', 3], ['Scrambled Eggs on Toast', 2]] as const) {
    const made = await prisma.recipe.create({
      data: {
        name,
        instructions: '1. Cook the eggs.',
        servings: 1,
        source: 'user',
        ownerId: planner.id,
        ingredients: { create: [{ foodReferenceId: egg.id, quantityRequired: eggs, unitRequired: 'count' }] },
      },
    });
    recipes[name] = made.id;
  }
});

beforeEach(async () => {
  for (const who of [planner, free]) {
    await prisma.mealPlanEntry.deleteMany({ where: { userId: who.id } });
    await prisma.shoppingListItem.deleteMany({ where: { userId: who.id } });
    await prisma.planShoppingSkip.deleteMany({ where: { userId: who.id } });
    await prisma.consumptionLog.deleteMany({ where: { userId: who.id } });
    await prisma.inventoryRemoval.deleteMany({ where: { userId: who.id } });
    await prisma.inventoryItem.deleteMany({ where: { userId: who.id } });
  }
});

afterAll(async () => {
  for (const who of [planner, free]) await deleteAccount(who.id);
  await app.close();
});

describe('the planner is Pro', () => {
  it('gives an account without Pro no way in', async () => {
    const omelette = await recipe('Classic French Omelette');
    const attempts = [
      await call(free, 'GET', '/api/planning/plan'),
      await call(free, 'POST', '/api/planning/plan', { recipeId: omelette.id, plannedFor: today() }),
      await call(free, 'GET', '/api/planning/plan/shortfall'),
    ];
    for (const attempt of attempts) {
      expect(attempt.status).toBe(403);
      expect(attempt.body.error).toBe('plus_required');
    }
    expect(await prisma.mealPlanEntry.count({ where: { userId: free.id } })).toBe(0);
  });
});

describe('the week’s shopping', () => {
  it('shares the pantry out between meals in date order', async () => {
    await stock(planner, 'Egg', 3, 'count');
    await plan('Classic French Omelette');
    await plan('Scrambled Eggs on Toast');
    const shortfall = await call(planner, 'GET', '/api/planning/plan/shortfall');
    const eggs = shortfall.body.missing.find((m: { name: string }) => m.name === 'Egg');
    // the omelette takes all three, so the scramble's two are still to buy
    expect(eggs.quantity).toBe(2);
    expect(eggs.forRecipes).toEqual(['Scrambled Eggs on Toast']);
  });

  it('puts what a planned meal needs on the list, and takes it off with the meal', async () => {
    const added = await plan('Classic French Omelette');
    expect(added.status).toBe(201);
    expect(added.body.toBuy).toBeGreaterThan(0);
    const eggs = (await listed(planner)).find((i) => i.name === 'Egg');
    expect(eggs).toMatchObject({ addedFrom: 'meal_plan', isChecked: false, quantityNeeded: 3 });

    const removed = await call(planner, 'DELETE', `/api/planning/plan/${added.body.entry.id}`);
    expect(removed.body.toBuy).toBe(0);
    expect((await listed(planner)).filter((i) => i.addedFrom === 'meal_plan')).toEqual([]);
  });

  it('leaves alone what the person added or ticked off, and keeps off what they took off', async () => {
    const egg = await food('Egg');
    await call(planner, 'POST', '/api/shopping-list', { name: 'Eggs', foodReferenceId: egg.id, quantityNeeded: 12, unit: 'count' });
    const first = await plan('Classic French Omelette');
    // eggs were already on the list, so the plan doesn't add a second line
    expect((await listed(planner)).filter((i) => i.foodReferenceId === egg.id)).toHaveLength(1);
    expect(first.body.toBuy).toBe(0);

    // the person's own line goes; the plan puts eggs on, and they take that off too
    await prisma.shoppingListItem.deleteMany({ where: { userId: planner.id } });
    await call(planner, 'GET', '/api/planning/plan');
    const eggs = (await listed(planner)).find((i) => i.name === 'Egg')!;
    expect(eggs.addedFrom).toBe('meal_plan');
    await call(planner, 'DELETE', `/api/shopping-list/${eggs.id}`);
    await plan('Scrambled Eggs on Toast');
    expect((await listed(planner)).some((i) => i.name === 'Egg')).toBe(false);

    // once no meal wants eggs, the "no thanks" is forgotten
    const plans = await call(planner, 'GET', '/api/planning/plan');
    for (const entry of plans.body.entries) await call(planner, 'DELETE', `/api/planning/plan/${entry.id}`);
    expect(await prisma.planShoppingSkip.count({ where: { userId: planner.id } })).toBe(0);
    expect(first.status).toBe(201);
  });

  it('crosses a meal off when it is cooked, and its food off the list', async () => {
    await stock(planner, 'Egg', 24, 'count');
    const omelette = await recipe('Classic French Omelette');
    await plan('Classic French Omelette');
    const cooked = await call(planner, 'POST', `/api/recipes/${omelette.id}/cook`, {});
    expect(cooked.status).toBe(200);
    const after = await call(planner, 'GET', '/api/planning/plan');
    expect(after.body.entries[0]).toMatchObject({ recipeId: omelette.id, cooked: true });
    expect(after.body.toBuy).toBe(0);
  });
});

describe('days', () => {
  it('keep their date in every time zone', async () => {
    const omelette = await recipe('Classic French Omelette');
    for (const zone of ['Pacific/Auckland', 'America/Denver', 'Pacific/Honolulu']) {
      await call(planner, 'POST', '/api/planning/plan', { recipeId: omelette.id, plannedFor: '2026-10-05' }, zone);
      const read = await call(planner, 'GET', '/api/planning/plan?from=2026-10-05&days=1', undefined, zone);
      expect(read.body.entries.map((e: { plannedFor: string }) => e.plannedFor)).toEqual(['2026-10-05']);
      await prisma.mealPlanEntry.deleteMany({ where: { userId: planner.id } });
    }
  });
});
