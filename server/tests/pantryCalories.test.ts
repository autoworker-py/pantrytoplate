/**
 * A recipe's calories should be this kitchen's calories.
 *
 * "400 kcal" for cheese on toast is a fact about somebody else's bread. If the
 * pantry holds a light loaf, the honest figure is lower — and it is the figure
 * that lands in the diary anyway, because cooking deducts and logs the real
 * lot. Showing one number before and a different one after is the app
 * disagreeing with itself.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { PRIVACY_VERSION } from '../src/content/privacy.js';

let app: FastifyInstance;
let token = '';
let userId = '';
const stamp = Date.now();
const madeFoods: string[] = [];

async function api(method: 'GET' | 'POST', url: string, payload?: Record<string, unknown>) {
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

beforeAll(async () => {
  app = await buildApp();
  const registered = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: `pantrycal-${stamp}@example.test`, password: 'testpassword' , acceptPrivacyVersion: PRIVACY_VERSION },
  });
  token = JSON.parse(registered.body).token;
  userId = JSON.parse(registered.body).user.id;
});

afterAll(async () => {
  await prisma.consumptionLog.deleteMany({ where: { userId } });
  await prisma.inventoryItem.deleteMany({ where: { userId } });
  await prisma.foodReference.deleteMany({ where: { id: { in: madeFoods } } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await app.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.consumptionLog.deleteMany({ where: { userId } });
  await prisma.inventoryItem.deleteMany({ where: { userId } });
});

/** A branded product that counts as a generic ingredient, at a chosen density. */
async function brandedVersionOf(generic: string, caloriesPerUnit: number, label: string) {
  const base = await prisma.foodReference.findFirstOrThrow({ where: { name: generic } });
  const food = await prisma.foodReference.create({
    data: {
      name: `${label} ${stamp}`,
      nameNorm: `${label.toLowerCase()} ${stamp}`,
      source: 'manual',
      defaultUnit: base.defaultUnit,
      caloriesPerUnit,
      proteinPerUnit: base.proteinPerUnit,
      carbsPerUnit: base.carbsPerUnit,
      fatPerUnit: base.fatPerUnit,
      servingSizeGrams: base.servingSizeGrams,
      canonicalId: base.id,
      canonicalSource: 'user',
    },
  });
  madeFoods.push(food.id);
  return { food, base };
}

describe('recipe calories follow the pantry', () => {
  it('uses the held product’s figures, not the generic ingredient’s', async () => {
    const bread = await prisma.foodReference.findFirstOrThrow({ where: { name: 'White Bread' } });
    const recipe = await prisma.recipe.findFirstOrThrow({
      where: { ownerId: null, deletedAt: null, ingredients: { some: { foodReferenceId: bread.id } } },
      include: { ingredients: true },
    });

    // everything the recipe needs, using the ordinary catalog entries
    for (const ingredient of recipe.ingredients) {
      await api('POST', '/api/inventory', {
        foodReferenceId: ingredient.foodReferenceId,
        quantity: 2000,
        unit: 'g',
      });
    }
    const generic = await api('GET', `/api/recipes/${recipe.id}`);
    const genericCalories = generic.body.recipe.nutrition.caloriesPerServing;
    expect(genericCalories).toBeGreaterThan(0);
    expect(generic.body.recipe.nutrition.fromPantry).toEqual([]);

    // swap the loaf for a much lighter one that counts as the same ingredient
    const light = await brandedVersionOf('White Bread', (bread.caloriesPerUnit ?? 2.6) / 2, 'Light Loaf');
    await prisma.inventoryItem.deleteMany({ where: { userId, foodReferenceId: bread.id } });
    await api('POST', '/api/inventory', { foodReferenceId: light.food.id, quantity: 2000, unit: 'g' });

    const withLight = await api('GET', `/api/recipes/${recipe.id}`);
    const lightCalories = withLight.body.recipe.nutrition.caloriesPerServing;

    expect(lightCalories).toBeLessThan(genericCalories);
    // and it says which ingredient moved the number
    expect(withLight.body.recipe.nutrition.fromPantry).toContain(light.food.name);
  });

  it('a richer product pushes the figure up, not just down', async () => {
    const bread = await prisma.foodReference.findFirstOrThrow({ where: { name: 'White Bread' } });
    const recipe = await prisma.recipe.findFirstOrThrow({
      where: { ownerId: null, deletedAt: null, ingredients: { some: { foodReferenceId: bread.id } } },
    });
    const heavy = await brandedVersionOf('White Bread', (bread.caloriesPerUnit ?? 2.6) * 2, 'Rich Loaf');
    await api('POST', '/api/inventory', { foodReferenceId: heavy.food.id, quantity: 2000, unit: 'g' });

    const result = await api('GET', `/api/recipes/${recipe.id}`);
    expect(result.body.recipe.nutrition.fromPantry).toContain(heavy.food.name);
  });

  it('falls back to the generic entry when the held product has no nutrition', async () => {
    const bread = await prisma.foodReference.findFirstOrThrow({ where: { name: 'White Bread' } });
    const recipe = await prisma.recipe.findFirstOrThrow({
      where: { ownerId: null, deletedAt: null, ingredients: { some: { foodReferenceId: bread.id } } },
      include: { ingredients: true },
    });
    for (const ingredient of recipe.ingredients) {
      await api('POST', '/api/inventory', {
        foodReferenceId: ingredient.foodReferenceId,
        quantity: 2000,
        unit: 'g',
      });
    }
    const baseline = (await api('GET', `/api/recipes/${recipe.id}`)).body.recipe.nutrition.caloriesPerServing;

    // an unknown-nutrition product must not blank out a figure we already had
    const unknown = await brandedVersionOf('White Bread', 0, 'Mystery Loaf');
    await prisma.foodReference.update({ where: { id: unknown.food.id }, data: { caloriesPerUnit: null } });
    await prisma.inventoryItem.deleteMany({ where: { userId, foodReferenceId: bread.id } });
    await api('POST', '/api/inventory', { foodReferenceId: unknown.food.id, quantity: 2000, unit: 'g' });

    const after = (await api('GET', `/api/recipes/${recipe.id}`)).body.recipe.nutrition;
    expect(after.caloriesPerServing).toBe(baseline);
    expect(after.fromPantry).toEqual([]);
  });

  it('the cook estimate agrees with what actually gets logged', async () => {
    const bread = await prisma.foodReference.findFirstOrThrow({ where: { name: 'White Bread' } });
    const recipe = await prisma.recipe.findFirstOrThrow({
      where: { ownerId: null, deletedAt: null, ingredients: { some: { foodReferenceId: bread.id } } },
      include: { ingredients: true },
    });
    const light = await brandedVersionOf('White Bread', (bread.caloriesPerUnit ?? 2.6) / 3, 'Airy Loaf');

    for (const ingredient of recipe.ingredients) {
      if (ingredient.foodReferenceId === bread.id) continue;
      await api('POST', '/api/inventory', {
        foodReferenceId: ingredient.foodReferenceId,
        quantity: 3000,
        unit: 'g',
      });
    }
    await api('POST', '/api/inventory', { foodReferenceId: light.food.id, quantity: 3000, unit: 'g' });

    const preview = await api('GET', `/api/recipes/${recipe.id}/cook-preview`);
    expect(preview.status).toBe(200);
    const estimated = preview.body.preview.estimatedCalories;
    expect(estimated).toBeGreaterThan(0);

    const cooked = await api('POST', `/api/recipes/${recipe.id}/cook`, {});
    expect(cooked.status).toBe(200);
    const logged = cooked.body.result.caloriesLogged;

    // the estimate is the promise; the log is the delivery
    expect(Math.abs(logged - estimated)).toBeLessThanOrEqual(2);
  });
});
