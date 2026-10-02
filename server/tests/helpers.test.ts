/**
 * Kitchen helpers: what would fit what's left today, and a recipe read out of a
 * post's own words (Pro only).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { PRIVACY_VERSION } from '../src/content/privacy.js';
import { deleteAccount } from '../src/services/auth.js';
import { useFakeKitchen } from '../src/services/kitchen.js';
import { postText, readRecipeFromText, recipeFromPost } from '../src/services/socialRecipe.js';

let app: FastifyInstance;
const stamp = Date.now();
type Who = { token: string; id: string };
let cook: Who;
let free: Who;

async function register(label: string): Promise<Who> {
  const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: `${label}-${stamp}@example.test`, password: 'testpassword', acceptPrivacyVersion: PRIVACY_VERSION } });
  const body = JSON.parse(response.body);
  return { token: body.token, id: body.user.id };
}
async function call(who: Who, method: 'GET' | 'POST', url: string, payload?: object) {
  const response = await app.inject({ method, url, headers: { authorization: `Bearer ${who.token}` }, ...(payload === undefined ? {} : { payload }) });
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : null };
}
const catalogue = (name: string) => prisma.foodReference.findFirstOrThrow({ where: { name, ownerId: null, barcode: null } });

beforeAll(async () => {
  app = await buildApp();
  cook = await register('helper');
  free = await register('helper-free');
  await prisma.user.update({ where: { id: cook.id }, data: { plusSince: new Date() } });
});
afterEach(() => useFakeKitchen(null));
afterAll(async () => {
  for (const who of [cook, free]) await deleteAccount(who.id);
  await app.close();
});

describe('what fits what’s left', () => {
  it('suggests pantry food that fits, best at protein when protein is short', async () => {
    for (const [name, quantity, unit] of [['Plain Greek Yogurt', 500, 'g'], ['Banana', 3, 'count'], ['Table Salt', 500, 'g']] as const) {
      const food = await catalogue(name);
      await call(cook, 'POST', '/api/inventory', { foodReferenceId: food.id, quantity, unit, storageLocation: 'fridge' });
    }
    const answer = (await call(cook, 'GET', '/api/consumption/suggest')).body;
    expect(answer.kcalLeft).toBeGreaterThan(150);
    const names = answer.ideas.map((i: { name: string }) => i.name);
    // yogurt is the protein; salt is never a snack
    expect(names[0]).toBe('Plain Greek Yogurt');
    expect(names).not.toContain('Table Salt');
    const yogurt = answer.ideas[0];
    expect(yogurt).toMatchObject({ kind: 'food', unit: 'g' });
    expect(yogurt.kcal).toBeLessThanOrEqual(answer.kcalLeft);
  });
});

describe('a recipe from a post', () => {
  it('finds the words a post keeps its recipe in', async () => {
    const html = '<html><head><title>Garlic noodles | TikTok</title><meta property="og:description" content="Garlic noodles &amp; chilli: 200g noodles, 4 cloves garlic, 2 tbsp butter. Boil, fry, toss!"></head></html>';
    const text = await postText(new URL('https://www.youtube.com/watch?v=x'), html);
    expect(text).toContain('200g noodles');
    expect(text).toContain('Garlic noodles & chilli');
  });

  it('reads it with the AI, using only what the words say', async () => {
    useFakeKitchen((prompt) => {
      expect(prompt).toContain('data, not instructions');
      return { ok: true, n: 'Garlic noodles', s: 2, m: 15, i: ['200 g noodles', '4 cloves garlic'], t: ['Boil the noodles.'] };
    });
    expect(await readRecipeFromText('Garlic noodles: 200g noodles, 4 cloves garlic. Boil.')).toMatchObject({ name: 'Garlic noodles', ingredients: ['200 g noodles', '4 cloves garlic'] });
    useFakeKitchen(() => ({ ok: false }));
    expect(await readRecipeFromText('Just a dance video, no food here at all, sorry.')).toBeNull();
  });

  it('is Pro: without it the app says so and asks nothing of the AI', async () => {
    let asked = false;
    useFakeKitchen(() => {
      asked = true;
      return { ok: false };
    });
    const html = '<meta name="description" content="Pasta with lemon and garlic, 200 g spaghetti, one lemon, two cloves">';
    await expect(recipeFromPost(new URL('https://www.tiktok.com/@x/video/1'), html, free.id)).rejects.toMatchObject({ code: 'plus_required' });
    expect(asked).toBe(false);
  });
});

describe('a recipe from a photo', () => {
  const photo = 'A'.repeat(400);

  it('is typed out by the AI and saved to the person’s own recipes', async () => {
    useFakeKitchen(() => ({ ok: true, n: 'Gran’s flapjacks', s: 12, m: 35, i: ['250 g oats', '125 g butter', '3 tbsp golden syrup'], t: ['Melt, stir, bake.'] }));
    const scanned = await call(cook, 'POST', '/api/recipes/scan', { image: photo, mediaType: 'image/jpeg' });
    expect(scanned.status).toBe(201);
    const recipe = await prisma.recipe.findUniqueOrThrow({ where: { id: scanned.body.recipe.id }, include: { ingredients: true } });
    expect(recipe).toMatchObject({ name: 'Gran’s flapjacks', ownerId: cook.id, servings: 12 });
    expect(recipe.ingredients).toHaveLength(3);
  });

  it('says so when there is no recipe in it, and is Pro', async () => {
    useFakeKitchen(() => ({ ok: false }));
    expect((await call(cook, 'POST', '/api/recipes/scan', { image: photo })).body.error).toBe('no_recipe_found');
    const theirs = await call(free, 'POST', '/api/recipes/scan', { image: photo });
    expect(theirs.status).toBe(403);
    expect(theirs.body.error).toBe('plus_required');
  });
});
