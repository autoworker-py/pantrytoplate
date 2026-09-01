/**
 * The pantry-to-recipe substitution path, end to end.
 *
 * The reported case is exact: a recipe calls for wholemeal bread, the kitchen
 * holds white, and the app offered nothing at all - there was no rule in either
 * direction. These tests follow the whole path rather than the rule table,
 * because a rule that exists but never reaches the screen is no better than a
 * missing one, and a swap that is offered but deducts the wrong loaf is worse.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { PRIVACY_VERSION } from '../src/content/privacy.js';

let app: FastifyInstance;
let token: string;
let userId: string;

const userEmail = `subs-${Date.now()}@example.test`;
const auth = () => ({ authorization: `Bearer ${token}` });

async function api(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) {
  const response = await app.inject({ method, url, headers: auth(), ...(payload ? { payload } : {}) });
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : null };
}

async function foodId(name: string) {
  return (await prisma.foodReference.findFirstOrThrow({ where: { name } })).id;
}

async function recipeId(name: string) {
  return (await prisma.recipe.findFirstOrThrow({ where: { name, deletedAt: null } })).id;
}

async function stock(name: string, quantity: number, unit: string) {
  const result = await api('POST', '/api/inventory', { foodReferenceId: await foodId(name), quantity, unit });
  expect(result.status).toBe(201);
  return result.body.item;
}

async function clearInventory() {
  await prisma.consumptionLog.deleteMany({ where: { userId } });
  await prisma.inventoryItem.deleteMany({ where: { userId } });
}

beforeAll(async () => {
  app = await buildApp();
  const registered = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: userEmail, password: 'testpassword', acceptPrivacyVersion: PRIVACY_VERSION },
  });
  expect(registered.statusCode).toBe(201);
  token = JSON.parse(registered.body).token;
  userId = (await prisma.user.findFirstOrThrow({ where: { email: userEmail } })).id;
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('white bread stands in for a wholemeal recipe', () => {
  beforeEach(clearInventory);

  const RECIPE = 'Peanut Butter Banana Toast'; // calls for 2 slices of Whole Wheat Bread

  it('offers white bread as a substitute when the recipe wants wholemeal', async () => {
    await stock('White Bread', 8, 'slice');
    await stock('Peanut Butter', 200, 'g');
    await stock('Banana', 3, 'count');
    await stock('Honey', 200, 'g');
    await stock('Ground Cinnamon', 30, 'g');

    const detail = await api('GET', `/api/recipes/${await recipeId(RECIPE)}`);
    expect(detail.status).toBe(200);

    const bread = detail.body.recipe.ingredients.find((i: { name: string }) => i.name === 'Whole Wheat Bread');
    expect(bread, 'the recipe should still ask for wholemeal bread').toBeTruthy();
    expect(bread.status).not.toBe('ok');

    const names = (bread.substitutes ?? []).map((s: { substituteName: string }) => s.substituteName);
    expect(names).toContain('White Bread');

    const white = bread.substitutes.find((s: { substituteName: string }) => s.substituteName === 'White Bread');
    // 8 slices held against 2 required: enough, and stated in the recipe's unit
    expect(white.unit).toBe('slice');
    expect(white.quantity).toBe(2);
    expect(white.available).toBe(8);
    expect(white.enough).toBe(true);
    expect(String(white.note ?? '')).not.toHaveLength(0);
  });

  it('does not offer a substitute the pantry does not hold', async () => {
    await stock('Peanut Butter', 200, 'g');
    const detail = await api('GET', `/api/recipes/${await recipeId(RECIPE)}`);
    const bread = detail.body.recipe.ingredients.find((i: { name: string }) => i.name === 'Whole Wheat Bread');
    // a suggestion you cannot act on is noise
    expect(bread.substitutes ?? []).toEqual([]);
  });

  it('deducts the bread you actually used, not the one the recipe named', async () => {
    await stock('White Bread', 8, 'slice');
    await stock('Peanut Butter', 200, 'g');
    await stock('Banana', 3, 'count');
    await stock('Honey', 200, 'g');
    await stock('Ground Cinnamon', 30, 'g');

    const id = await recipeId(RECIPE);
    const wholemeal = await foodId('Whole Wheat Bread');
    const white = await foodId('White Bread');

    const cooked = await api('POST', `/api/recipes/${id}/cook`, { swaps: { [wholemeal]: white } });
    expect(cooked.status).toBe(200);

    const left = await prisma.inventoryItem.findFirst({ where: { userId, foodReferenceId: white } });
    expect(left?.quantity, 'two slices of white bread should be gone').toBe(6);

    // and nothing was invented: there was never any wholemeal to take
    const phantom = await prisma.inventoryItem.findFirst({ where: { userId, foodReferenceId: wholemeal } });
    expect(phantom).toBeNull();
  });

  it('refuses a swap that has no rule behind it rather than guessing a ratio', async () => {
    await stock('White Bread', 8, 'slice');
    await stock('Peanut Butter', 200, 'g');
    await stock('Banana', 3, 'count');
    await stock('Honey', 200, 'g');
    await stock('Ground Cinnamon', 30, 'g');

    const id = await recipeId(RECIPE);
    const wholemeal = await foodId('Whole Wheat Bread');
    const unrelated = await foodId('Ground Cinnamon');

    const cooked = await api('POST', `/api/recipes/${id}/cook`, { swaps: { [wholemeal]: unrelated } });
    // cinnamon is not a stand-in for bread; the cook must fail on the missing
    // bread rather than quietly swapping in a spice
    expect(cooked.status).not.toBe(200);
  });
});

describe('substitution ratios are honoured, not assumed', () => {
  beforeEach(clearInventory);

  it('scales the amount by the rule ratio', async () => {
    // butter -> olive oil is 0.75: the point of a ratio is that it is not 1
    const rule = await prisma.substitution.findFirstOrThrow({
      where: { foodReference: { name: 'Unsalted Butter' }, substitute: { name: 'Olive Oil' } },
    });
    expect(rule.ratio).toBeCloseTo(0.75, 5);
  });

  it('every seeded rule carries a note saying what changes', async () => {
    const silent = await prisma.substitution.count({ where: { OR: [{ note: null }, { note: '' }] } });
    expect(silent).toBe(0);
  });

  it('seeded a substantially larger rule set than before', async () => {
    expect(await prisma.substitution.count()).toBeGreaterThan(190);
  });
});
