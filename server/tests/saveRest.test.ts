/**
 * "I only ate half of it": a cooked meal's rest becomes leftovers in the fridge,
 * a pantry food's rest goes back where it came from, and both can be undone.
 * Also: a recipe can be cooked at less than one serving.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { PRIVACY_VERSION } from '../src/content/privacy.js';

let app: FastifyInstance;
let auth: { authorization: string };
let recipeId: string;
let breadLot: string;

async function call(method: 'GET' | 'POST', url: string, payload?: object) {
  const response = await app.inject({ method, url, headers: auth, ...(payload ? { payload } : {}) });
  expect(response.statusCode, response.body).toBeLessThan(300);
  return JSON.parse(response.body);
}

const inventory = async () => (await call('GET', '/api/inventory')).items as Array<{ id: string; quantity: number; unit: string; isLeftover: boolean; food: { name: string } }>;
const diaryCalories = async () => (await call('GET', '/api/consumption/today')).totalCalories as number;

beforeAll(async () => {
  app = await buildApp();
  const registered = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: `rest-${Date.now()}@example.test`, password: 'testpassword', acceptPrivacyVersion: PRIVACY_VERSION },
  });
  auth = { authorization: `Bearer ${JSON.parse(registered.body).token}` };
  const bread = await prisma.foodReference.findFirstOrThrow({ where: { name: 'White Bread', ownerId: null } });
  breadLot = (await call('POST', '/api/inventory', { foodReferenceId: bread.id, quantity: 12, unit: 'slice' })).item.id;
  recipeId = (await call('POST', '/api/recipes', { name: 'Plain toast', instructions: '1. Toast it.', servings: 2, ingredients: [{ foodReferenceId: bread.id, quantityRequired: 4, unitRequired: 'slice' }] })).recipe.id;
});

afterAll(async () => {
  await app.close();
});

describe('less than a serving', () => {
  it('cooks half a serving and uses a quarter of the recipe', async () => {
    const preview = (await call('GET', `/api/recipes/${recipeId}/cook-preview?servings=0.5`)).preview;
    const bread = preview.ingredients[0];
    expect(bread.requiredQuantity).toBe(1);
    const cooked = (await call('POST', `/api/recipes/${recipeId}/cook`, { servings: 0.5, mealSlot: 'lunch' })).result;
    expect(cooked.caloriesLogged).toBeGreaterThan(0);
    await call('POST', `/api/consumption/${cooked.cookEventId}/save-rest/undo`, { ate: 0.5 }).catch(() => undefined);
  });
});

describe('ate part of it', () => {
  it('puts the rest of a cooked meal in the fridge, and undoes it', async () => {
    const before = await diaryCalories();
    const cooked = (await call('POST', `/api/recipes/${recipeId}/cook`, { servings: 2, mealSlot: 'dinner' })).result;
    const logged = (await diaryCalories()) - before;

    const kept = (await call('POST', `/api/consumption/${cooked.cookEventId}/save-rest`, { ate: 0.5 })).result;
    expect(kept.kind).toBe('meal');
    expect(kept.leftover.servings).toBe(1);
    expect((await diaryCalories()) - before).toBeCloseTo(logged / 2, 0);
    const leftovers = (await inventory()).filter((i) => i.isLeftover);
    expect(leftovers.some((i) => i.id === kept.leftover.inventoryItemId && i.quantity === 1)).toBe(true);

    await call('POST', `/api/consumption/${cooked.cookEventId}/save-rest/undo`, { ate: 0.5, leftoverItemId: kept.leftover.inventoryItemId });
    expect((await diaryCalories()) - before).toBeCloseTo(logged, 0);
    expect((await inventory()).some((i) => i.id === kept.leftover.inventoryItemId)).toBe(false);
  });

  it('puts the rest of a pantry food back where it came from, and undoes it', async () => {
    const start = (await inventory()).find((i) => i.id === breadLot)!.quantity;
    const eaten = (await call('POST', `/api/inventory/${breadLot}/consume`, { quantity: 2, unit: 'slice', mealSlot: 'snack' })).result;
    expect((await inventory()).find((i) => i.id === breadLot)!.quantity).toBe(start - 2);

    const kept = (await call('POST', `/api/consumption/${eaten.consumptionLogId}/save-rest`, { ate: 0.5 })).result;
    expect(kept.kind).toBe('food');
    expect((await inventory()).find((i) => i.id === breadLot)!.quantity).toBe(start - 1);

    await call('POST', `/api/consumption/${eaten.consumptionLogId}/save-rest/undo`, { ate: 0.5 });
    expect((await inventory()).find((i) => i.id === breadLot)!.quantity).toBe(start - 2);
  });
});
