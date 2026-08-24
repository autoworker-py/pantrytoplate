/**
 * Recipes you add are yours.
 *
 * The shipped book has no owner and everybody sees it. Anything imported or
 * written by a person is stamped with their id, and the tests below are the
 * ones that matter: not just "the badge says mine", but that a second account
 * cannot see it, open it, cook it or plan it. Two people sharing an instance is
 * the normal case, not the exotic one.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { saveImport, type ImportPreview } from '../src/services/recipeImport.js';

let app: FastifyInstance;
let alice = { token: '', id: '' };
let bob = { token: '', id: '' };
const stamp = Date.now();
/** every account this file makes, so nothing it created outlives it */
const created: string[] = [];

async function register(label: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: `${label}-${stamp}@example.test`, password: 'testpassword' },
  });
  const body = JSON.parse(response.body);
  created.push(body.user.id);
  return { token: body.token, id: body.user.id };
}

async function api(
  who: { token: string },
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  payload?: Record<string, unknown>,
) {
  const response = await app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${who.token}` },
    ...(payload === undefined ? {} : { payload }),
  });
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : null };
}

const foodId = async (name: string) =>
  (await prisma.foodReference.findFirstOrThrow({ where: { name } })).id;

/**
 * Imports cannot be exercised end to end here — the test environment runs with
 * OFFLINE_MODE on, so nothing is fetched — but everything after the fetch is
 * the part that decides ownership, and that is what this drives.
 */
async function previewFor(name: string): Promise<ImportPreview> {
  return {
    name,
    description: 'Imported in a test.',
    servings: 2,
    prepMinutes: 5,
    cookMinutes: 5,
    cuisine: null,
    tags: [],
    instructions: '1. Cook it.',
    sourceUrl: 'https://example.test/recipe',
    ingredients: [
      {
        raw: '2 eggs',
        quantity: 2,
        unit: 'count',
        name: 'Egg',
        note: null,
        matchedFoodId: await foodId('Egg'),
        matchedFoodName: 'Egg',
        matchMethod: 'exact',
      },
    ],
  };
}

beforeAll(async () => {
  app = await buildApp();
  alice = await register('alice');
  bob = await register('bob');
});

afterAll(async () => {
  await prisma.consumptionLog.deleteMany({ where: { userId: { in: created } } });
  await prisma.recipe.deleteMany({ where: { ownerId: { in: created } } });
  await app.close();
  await prisma.$disconnect();
});

describe('imported recipes belong to the person who imported them', () => {
  it('stamps the importer as the owner', async () => {
    const saved = await saveImport(await previewFor(`Alice Import ${stamp}`), alice.id);
    expect(saved.recipe.ownerId).toBe(alice.id);
  });

  it('shows up in the importer’s search, marked as theirs', async () => {
    const name = `Alice Searchable ${stamp}`;
    await saveImport(await previewFor(name), alice.id);

    const found = await api(alice, 'GET', `/api/recipes?q=${encodeURIComponent('Alice Searchable')}`);
    const hit = found.body.recipes.find((recipe: { name: string }) => recipe.name === name);
    expect(hit).toBeTruthy();
    expect(hit.isMine).toBe(true);
    expect(hit.source).toBe('imported');
  });

  it('never appears in anybody else’s search', async () => {
    const name = `Alice Private ${stamp}`;
    await saveImport(await previewFor(name), alice.id);

    const found = await api(bob, 'GET', `/api/recipes?q=${encodeURIComponent('Alice Private')}`);
    expect(found.body.recipes.map((recipe: { name: string }) => recipe.name)).not.toContain(name);
  });

  it('reads as missing rather than forbidden when someone else opens it by id', async () => {
    const saved = await saveImport(await previewFor(`Alice Guessable ${stamp}`), alice.id);

    expect((await api(bob, 'GET', `/api/recipes/${saved.recipe.id}`)).status).toBe(404);
    expect((await api(bob, 'GET', `/api/recipes/${saved.recipe.id}/cook-preview`)).status).toBe(404);
    expect((await api(bob, 'POST', `/api/recipes/${saved.recipe.id}/cook`, {})).status).toBe(404);
    expect(
      (await api(bob, 'POST', '/api/meal-plan', { recipeId: saved.recipe.id, plannedFor: '2026-09-01' })).status,
    ).toBe(404);

    // and the owner is unaffected
    expect((await api(alice, 'GET', `/api/recipes/${saved.recipe.id}`)).status).toBe(200);
  });

  it('leaves the shipped book visible to everyone', async () => {
    const seeded = await prisma.recipe.findFirstOrThrow({ where: { name: 'Classic French Omelette' } });
    expect(seeded.ownerId).toBeNull();

    for (const who of [alice, bob]) {
      const opened = await api(who, 'GET', `/api/recipes/${seeded.id}`);
      expect(opened.status).toBe(200);
      expect(opened.body.recipe.isMine).toBe(false);
    }
  });
});

describe('recipes you write yourself', () => {
  it('are owned by you and hidden from others', async () => {
    const name = `Bob Original ${stamp}`;
    const created = await api(bob, 'POST', '/api/recipes', {
      name,
      instructions: 'Scramble them.',
      servings: 1,
      ingredients: [{ foodReferenceId: await foodId('Egg'), quantityRequired: 2, unitRequired: 'count' }],
    });
    expect(created.status).toBe(201);
    expect(created.body.recipe.ownerId).toBe(bob.id);

    expect((await api(alice, 'GET', `/api/recipes/${created.body.recipe.id}`)).status).toBe(404);
  });
});

/**
 * The bug that made this whole area worth testing: a recipe saved perfectly,
 * owned correctly, and then removed from every list by an unrelated setting.
 */
describe('a diet setting never hides your own recipes', () => {
  it('keeps your import visible when it does not match your diet', async () => {
    const veggie = await register('veggie');
    await prisma.user.update({ where: { id: veggie.id }, data: { dietTags: 'vegetarian' } });

    const name = `Veggie Chicken Alfredo ${stamp}`;
    const saved = await saveImport(await previewFor(name), veggie.id);
    // nothing about this recipe satisfies a vegetarian filter
    await prisma.recipe.update({ where: { id: saved.recipe.id }, data: { tags: 'chicken,pasta' } });

    const mine = await api(veggie, 'GET', '/api/recipes?mine=1&limit=100');
    expect(mine.body.recipes.map((recipe: { name: string }) => recipe.name)).toContain(name);

    const all = await api(veggie, 'GET', `/api/recipes?q=${encodeURIComponent('Veggie Chicken')}`);
    expect(all.body.recipes.map((recipe: { name: string }) => recipe.name)).toContain(name);
  });

  it('still keeps the shipped book on the diet, and says how much it hid', async () => {
    const veggie = await register('veggie2');
    await prisma.user.update({ where: { id: veggie.id }, data: { dietTags: 'vegetarian' } });

    const listed = await api(veggie, 'GET', '/api/recipes?limit=100');
    expect(listed.body.dietTags).toEqual(['vegetarian']);
    // the filter is doing real work — otherwise this test proves nothing
    expect(listed.body.dietHidden).toBeGreaterThan(0);
    for (const recipe of listed.body.recipes) {
      expect(recipe.tags).toContain('vegetarian');
    }
  });

  it('reports nothing hidden when no diet is set', async () => {
    const anyone = await register('nodiet');
    const listed = await api(anyone, 'GET', '/api/recipes?limit=100');
    expect(listed.body.dietHidden).toBe(0);
    expect(listed.body.dietTags).toEqual([]);
  });
});

describe('deleting a recipe you added', () => {
  it('removes it from your lists but keeps the diary intact', async () => {
    const saved = await saveImport(await previewFor(`Alice Doomed ${stamp}`), alice.id);
    const recipeId = saved.recipe.id;

    // a meal cooked from it, the thing a hard delete would destroy
    await prisma.consumptionLog.create({
      data: {
        userId: alice.id,
        foodReferenceId: await foodId('Egg'),
        quantityConsumed: 2,
        unit: 'count',
        source: 'recipe',
        recipeId,
        cookEventId: `cook-${stamp}`,
        mealSlot: 'dinner',
      },
    });

    expect((await api(alice, 'DELETE', `/api/recipes/${recipeId}`)).status).toBe(204);

    // gone from every way in
    expect((await api(alice, 'GET', `/api/recipes/${recipeId}`)).status).toBe(404);
    expect((await api(alice, 'POST', `/api/recipes/${recipeId}/cook`, {})).status).toBe(404);
    const mine = await api(alice, 'GET', '/api/recipes?mine=1&limit=100');
    expect(mine.body.recipes.map((recipe: { id: string }) => recipe.id)).not.toContain(recipeId);

    // but the row survives, so the diary can still name the meal
    const row = await prisma.recipe.findUnique({ where: { id: recipeId } });
    expect(row?.deletedAt).toBeInstanceOf(Date);
    const log = await prisma.consumptionLog.findFirst({
      where: { recipeId },
      include: { recipe: true },
    });
    expect(log?.recipe?.name).toBe(`Alice Doomed ${stamp}`);

    await prisma.consumptionLog.deleteMany({ where: { recipeId } });
  });

  it('refuses to delete the shipped book or somebody else’s recipe', async () => {
    const seeded = await prisma.recipe.findFirstOrThrow({ where: { name: 'Classic French Omelette' } });
    expect((await api(alice, 'DELETE', `/api/recipes/${seeded.id}`)).status).toBe(404);
    expect(await prisma.recipe.findUnique({ where: { id: seeded.id } })).toMatchObject({ deletedAt: null });

    const bobs = await saveImport(await previewFor(`Bob Safe ${stamp}`), bob.id);
    expect((await api(alice, 'DELETE', `/api/recipes/${bobs.recipe.id}`)).status).toBe(404);
    expect(await prisma.recipe.findUnique({ where: { id: bobs.recipe.id } })).toMatchObject({ deletedAt: null });
  });

  it('drops it out of “what can I make with this?” too', async () => {
    const name = `Alice Egg Doomed ${stamp}`;
    const saved = await saveImport(await previewFor(name), alice.id);
    const egg = await foodId('Egg');

    const before = await api(alice, 'GET', `/api/recipes/for-food/${egg}?limit=200`);
    expect(before.body.recipes.map((recipe: { name: string }) => recipe.name)).toContain(name);

    await api(alice, 'DELETE', `/api/recipes/${saved.recipe.id}`);

    const after = await api(alice, 'GET', `/api/recipes/for-food/${egg}?limit=200`);
    expect(after.body.recipes.map((recipe: { name: string }) => recipe.name)).not.toContain(name);
  });
});

describe('your own recipes survive the shortlist', () => {
  it('appears in the ordinary list, not just the “yours” tab', async () => {
    const dave = await register('dave');
    const name = `Dave Everyday ${stamp}`;
    await saveImport(await previewFor(name), dave.id);

    // no query, no filters: the same list the app opens on
    const listed = await api(dave, 'GET', '/api/recipes?limit=100');
    expect(listed.body.recipes.map((recipe: { name: string }) => recipe.name)).toContain(name);
  });
});

describe('the “your recipes” filter', () => {
  it('returns only what you added', async () => {
    await saveImport(await previewFor(`Alice Filtered ${stamp}`), alice.id);

    const mine = await api(alice, 'GET', '/api/recipes?mine=1&limit=100');
    expect(mine.body.recipes.length).toBeGreaterThan(0);
    expect(mine.body.recipes.every((recipe: { isMine: boolean }) => recipe.isMine)).toBe(true);

    // the shipped book is excluded, not merely deprioritised
    expect(mine.body.recipes.map((recipe: { name: string }) => recipe.name)).not.toContain(
      'Classic French Omelette',
    );
  });

  it('is empty for someone who has added nothing', async () => {
    const carol = await register('carol');
    const mine = await api(carol, 'GET', '/api/recipes?mine=1');
    expect(mine.body.recipes).toEqual([]);
  });
});

describe('what can I make with this?', () => {
  it('separates what you can cook now from what you are still short of', async () => {
    const egg = await foodId('Egg');
    await prisma.inventoryItem.deleteMany({ where: { userId: bob.id } });

    const empty = await api(bob, 'GET', `/api/recipes/for-food/${egg}`);
    expect(empty.status).toBe(200);
    expect(empty.body.foodName).toBe('Egg');
    expect(empty.body.recipes.length).toBeGreaterThan(0);
    // an empty pantry means nothing is cookable, whatever the recipe count
    expect(empty.body.recipes.every((recipe: { canMakeNow: boolean }) => !recipe.canMakeNow)).toBe(true);

    for (const [name, quantity, unit] of [
      ['Egg', 24, 'count'],
      ['Unsalted Butter', 400, 'g'],
      ['Table Salt', 500, 'g'],
      ['Black Pepper', 100, 'g'],
    ] as const) {
      await api(bob, 'POST', '/api/inventory', { foodReferenceId: await foodId(name), quantity, unit });
    }

    const stocked = await api(bob, 'GET', `/api/recipes/for-food/${egg}`);
    const ready = stocked.body.recipes.filter((recipe: { canMakeNow: boolean }) => recipe.canMakeNow);
    expect(ready.length).toBeGreaterThan(0);
    expect(ready.map((recipe: { name: string }) => recipe.name)).toContain('Classic French Omelette');

    // every row says how much of *this* food the recipe wants
    for (const recipe of stocked.body.recipes) {
      expect(recipe.quantity).toBeGreaterThan(0);
      expect(typeof recipe.unit).toBe('string');
    }

    // cookable first — that is the whole point of the ordering
    const gaps = stocked.body.recipes.map((recipe: { gaps: number }) => recipe.gaps);
    expect([...gaps].sort((a: number, b: number) => a - b)).toEqual(gaps);
  });

  it('answers for a branded product using the generic ingredient it counts as', async () => {
    const generic = await foodId('Olive Oil');
    const branded = await prisma.foodReference.create({
      data: {
        name: `Test Extra Virgin Olive Oil ${stamp}`,
        nameNorm: `test extra virgin olive oil ${stamp}`,
        defaultUnit: 'ml',
        canonicalId: generic,
        canonicalSource: 'user',
        source: 'manual',
      },
    });

    const result = await api(bob, 'GET', `/api/recipes/for-food/${branded.id}`);
    expect(result.status).toBe(200);
    expect(result.body.foodName).toBe('Olive Oil');
    expect(result.body.recipes.length).toBeGreaterThan(0);

    await prisma.foodReference.delete({ where: { id: branded.id } });
  });

  it('does not surface another person’s recipe', async () => {
    const name = `Alice Egg Secret ${stamp}`;
    await saveImport(await previewFor(name), alice.id);

    const result = await api(bob, 'GET', `/api/recipes/for-food/${await foodId('Egg')}?limit=200`);
    expect(result.body.recipes.map((recipe: { name: string }) => recipe.name)).not.toContain(name);

    const own = await api(alice, 'GET', `/api/recipes/for-food/${await foodId('Egg')}?limit=200`);
    expect(own.body.recipes.map((recipe: { name: string }) => recipe.name)).toContain(name);
  });
});
