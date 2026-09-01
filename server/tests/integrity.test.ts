/**
 * Integrity of the pantry-to-recipe join.
 *
 * The pantry is the ledger the whole app rests on: if cooking can consume more
 * than you own, or consume the wrong lot, every number downstream is wrong and
 * the user has no way to tell. These tests attack that ledger rather than
 * exercising the happy path.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { PRIVACY_VERSION } from '../src/content/privacy.js';

let app: FastifyInstance;
let token: string;
let userId: string;
const userEmail = `integrity-${Date.now()}@example.test`;
const auth = () => ({ authorization: `Bearer ${token}` });

async function api(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) {
  const response = await app.inject({ method, url, headers: auth(), ...(payload ? { payload } : {}) });
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : null };
}
const foodId = async (name: string) => (await prisma.foodReference.findFirstOrThrow({ where: { name } })).id;
const recipeIdOf = async (name: string) => (await prisma.recipe.findFirstOrThrow({ where: { name, deletedAt: null } })).id;

async function stock(name: string, quantity: number, unit: string) {
  const r = await api('POST', '/api/inventory', { foodReferenceId: await foodId(name), quantity, unit });
  expect(r.status).toBe(201);
  return r.body.item;
}

async function clearInventory() {
  await prisma.consumptionLog.deleteMany({ where: { userId } });
  await prisma.inventoryItem.deleteMany({ where: { userId } });
}

beforeAll(async () => {
  app = await buildApp();
  const registered = await app.inject({
    method: 'POST', url: '/api/auth/register',
    payload: { email: userEmail, password: 'testpassword', acceptPrivacyVersion: PRIVACY_VERSION },
  });
  token = JSON.parse(registered.body).token;
  userId = (await prisma.user.findFirstOrThrow({ where: { email: userEmail } })).id;
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

const RECIPE = 'Peanut Butter Banana Toast'; // 2 slices bread, 2 tbsp peanut butter, 1 banana, honey, cinnamon

async function stockExactlyOneCook() {
  await stock('Whole Wheat Bread', 2, 'slice');
  await stock('Peanut Butter', 32, 'g');
  await stock('Banana', 1, 'count');
  await stock('Honey', 20, 'g');
  await stock('Ground Cinnamon', 10, 'g');
}

describe('the pantry ledger cannot be overdrawn', () => {
  beforeEach(clearInventory);

  it('two simultaneous cooks cannot both spend the same last portion', async () => {
    await stockExactlyOneCook();
    const id = await recipeIdOf(RECIPE);

    // fired together, not in sequence: this is the lost-update case
    const [a, b] = await Promise.all([
      api('POST', `/api/recipes/${id}/cook`, {}),
      api('POST', `/api/recipes/${id}/cook`, {}),
    ]);

    const succeeded = [a, b].filter((r) => r.status === 200);
    expect(succeeded.length, 'only one cook can have the last of the ingredients').toBe(1);

    const bread = await prisma.inventoryItem.findFirst({
      where: { userId, foodReferenceId: await foodId('Whole Wheat Bread') },
    });
    // the decisive assertion: never below zero, and exactly one cook's worth gone
    expect(bread?.quantity ?? 0).toBe(0);
  });

  it('never leaves a negative quantity behind', async () => {
    await stockExactlyOneCook();
    const id = await recipeIdOf(RECIPE);
    await api('POST', `/api/recipes/${id}/cook`, {});
    await api('POST', `/api/recipes/${id}/cook`, {});
    const negative = await prisma.inventoryItem.findMany({ where: { userId, quantity: { lt: 0 } } });
    expect(negative).toEqual([]);
  });

  it('refuses the whole cook rather than deducting part of it', async () => {
    // everything present except the banana
    await stock('Whole Wheat Bread', 2, 'slice');
    await stock('Peanut Butter', 32, 'g');
    await stock('Honey', 20, 'g');
    await stock('Ground Cinnamon', 10, 'g');

    const result = await api('POST', `/api/recipes/${await recipeIdOf(RECIPE)}/cook`, {});
    expect(result.status).not.toBe(200);

    // a partial deduction here is silent corruption: the bread must be untouched
    const bread = await prisma.inventoryItem.findFirst({
      where: { userId, foodReferenceId: await foodId('Whole Wheat Bread') },
    });
    expect(bread?.quantity).toBe(2);
    expect(await prisma.consumptionLog.count({ where: { userId } })).toBe(0);
  });

  it('logs exactly what it deducted, so the diary and the pantry agree', async () => {
    await stockExactlyOneCook();
    const cooked = await api('POST', `/api/recipes/${await recipeIdOf(RECIPE)}/cook`, {});
    expect(cooked.status).toBe(200);

    const logs = await prisma.consumptionLog.findMany({ where: { userId } });
    expect(logs.length).toBe(cooked.body.result.deductions.length);
    for (const deduction of cooked.body.result.deductions) {
      expect(deduction.remaining).toBeGreaterThanOrEqual(0);
      expect(deduction.quantityDeducted).toBeGreaterThan(0);
    }
  });
});

describe('one pantry cannot reach another', () => {
  it('never deducts a lot belonging to someone else', async () => {
    const otherEmail = `integrity-other-${Date.now()}@example.test`;
    const registered = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { email: otherEmail, password: 'testpassword', acceptPrivacyVersion: PRIVACY_VERSION },
    });
    const otherToken = JSON.parse(registered.body).token;
    const otherId = (await prisma.user.findFirstOrThrow({ where: { email: otherEmail } })).id;

    // the other account holds everything; ours holds nothing
    await clearInventory();
    for (const [name, qty, unit] of [
      ['Whole Wheat Bread', 8, 'slice'], ['Peanut Butter', 200, 'g'],
      ['Banana', 3, 'count'], ['Honey', 100, 'g'], ['Ground Cinnamon', 20, 'g'],
    ] as const) {
      const r = await app.inject({
        method: 'POST', url: '/api/inventory',
        headers: { authorization: `Bearer ${otherToken}` },
        payload: { foodReferenceId: await foodId(name), quantity: qty, unit },
      });
      expect(r.statusCode).toBe(201);
    }

    const result = await api('POST', `/api/recipes/${await recipeIdOf(RECIPE)}/cook`, {});
    expect(result.status, 'an empty pantry cannot cook from a full one').not.toBe(200);

    const theirs = await prisma.inventoryItem.findMany({ where: { userId: otherId } });
    expect(theirs.every((lot) => lot.quantity > 0), 'their stock must be untouched').toBe(true);
  });
});
