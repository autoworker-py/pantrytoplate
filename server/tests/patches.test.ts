/**
 * The three fixes asked for after the first round of use: pack sizes that get
 * asked about once, substitutes you can actually act on, and imports that do
 * not arrive mangled.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { PRIVACY_VERSION } from '../src/content/privacy.js';
import { parseIngredientLine } from '../src/services/ingredientParser.js';
import { tidySteps } from '../src/services/recipeImport.js';

let app: FastifyInstance;
let token = '';
let userId = '';
const stamp = Date.now();

async function api(method: 'GET' | 'POST' | 'DELETE', url: string, payload?: Record<string, unknown>) {
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
    payload: { email: `patches-${stamp}@example.test`, password: 'testpassword' , acceptPrivacyVersion: PRIVACY_VERSION },
  });
  token = JSON.parse(registered.body).token;
  userId = JSON.parse(registered.body).user.id;
});

afterAll(async () => {
  await prisma.consumptionLog.deleteMany({ where: { userId } });
  await prisma.inventoryItem.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await app.close();
  await prisma.$disconnect();
});

describe('the ingredient parser survives real recipe sites', () => {
  it('keeps the food out of the brackets', () => {
    const parsed = parseIngredientLine(
      '1 lb chicken breast, skinless (or 1.2 lb scotch fillet steak / boneless rib eye)',
    );
    expect(parsed.name).toBe('chicken breast');
    expect(parsed.quantity).toBe(1);
    expect(parsed.unit).toBe('lb');
    expect(parsed.note).toContain('scotch fillet');
  });

  it('never leaves stray brackets in a name', () => {
    for (const line of [
      '1 garlic clove, minced)',
      '1/2 cup unsalted butter (cut into cubes',
      '2 cups flour ]',
    ]) {
      const parsed = parseIngredientLine(line);
      expect(parsed.name).not.toMatch(/[()[\]]/);
      expect(parsed.name.length).toBeGreaterThan(0);
    }
  });

  it('takes the first of two offered ingredients', () => {
    expect(parseIngredientLine('1 tsp cooking salt / kosher salt').name).toBe('cooking salt');
    expect(parseIngredientLine('2 tbsp butter or margarine').name).toBe('butter');
  });

  it('still parses the ordinary cases it always did', () => {
    const can = parseIngredientLine('1 (14.5 oz) can diced tomatoes, drained');
    expect(can).toMatchObject({ quantity: 1, unit: 'can', name: 'diced tomatoes' });
    expect(parseIngredientLine('½ tsp black pepper')).toMatchObject({ quantity: 0.5, name: 'black pepper' });
    expect(parseIngredientLine('2-3 cloves garlic, minced')).toMatchObject({ quantity: 2, name: 'garlic' });
  });
});

describe('imported methods read like the seeded ones', () => {
  // These are the shapes real recipe pages produce.
  it('folds a section heading into the step it introduces', () => {
    expect(tidySteps(['For the sauce:', 'Melt the butter in a wide pan over a low heat.'])).toEqual([
      'For the sauce: Melt the butter in a wide pan over a low heat.',
    ]);
  });

  it('strips the page’s own numbering so ours is not doubled', () => {
    expect(tidySteps(['1. Bring a large pot of water to the boil.'])[0]).toBe(
      'Bring a large pot of water to the boil.',
    );
    expect(tidySteps(['Step 2: Season the chicken well.'])[0]).toBe('Season the chicken well.');
    expect(tidySteps(['• Drain and set aside for later.'])[0]).toBe('Drain and set aside for later.');
  });

  it('glues a stray fragment onto the step before it', () => {
    const result = tidySteps(['Add the fettuccine and cook until al dente.', 'Set aside.']);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('Set aside.');
  });

  it('drops blank and whitespace-only steps', () => {
    expect(tidySteps(['', '   ', 'Warm the oil until it shimmers, then add the garlic.'])).toHaveLength(1);
  });

  it('never silently loses a trailing heading', () => {
    const result = tidySteps(['Whisk the eggs and cream together thoroughly.', 'To serve:']);
    expect(result.join(' ')).toContain('To serve');
  });
});

describe('pack size', () => {
  it('reports whether a size is actually known, not merely guessed', async () => {
    const rice = await foodId('White Rice');
    const before = await api('GET', `/api/foods/${rice}/pack`);
    expect(before.status).toBe(200);
    // an estimate from the category is a starting point, not an answer
    if (before.body.estimated) expect(before.body.known).toBe(false);

    const taught = await api('POST', `/api/foods/${rice}/conversions`, {
      fromUnit: 'package',
      toUnit: 'g',
      multiplier: 907,
    });
    expect(taught.status).toBeLessThan(300);

    const after = await api('GET', `/api/foods/${rice}/pack`);
    expect(after.body).toMatchObject({ grams: 907, estimated: false, known: true });
  });

  it('404s for a food that does not exist', async () => {
    expect((await api('GET', '/api/foods/nope/pack')).status).toBe(404);
  });
});

describe('using a substitute for one cook', () => {
  beforeEach(async () => {
    await prisma.consumptionLog.deleteMany({ where: { userId } });
    await prisma.inventoryItem.deleteMany({ where: { userId } });
  });

  it('deducts the stand-in at its own ratio and leaves the recipe alone', async () => {
    const butter = await foodId('Unsalted Butter');
    const oil = await foodId('Olive Oil');
    const rule = await prisma.substitution.findFirst({
      where: { foodReferenceId: butter, substituteId: oil },
    });
    expect(rule, 'seeded butter -> olive oil substitution').toBeTruthy();

    const recipe = await prisma.recipe.findFirstOrThrow({
      where: { ownerId: null, deletedAt: null, ingredients: { some: { foodReferenceId: butter } } },
      include: { ingredients: true },
    });

    // everything the recipe needs, except butter — oil instead
    for (const ingredient of recipe.ingredients) {
      if (ingredient.foodReferenceId === butter) continue;
      await api('POST', '/api/inventory', {
        foodReferenceId: ingredient.foodReferenceId,
        quantity: 5000,
        unit: 'g',
      });
    }
    await api('POST', '/api/inventory', { foodReferenceId: oil, quantity: 2000, unit: 'ml' });

    const swapped = await api(
      'GET',
      `/api/recipes/${recipe.id}/cook-preview?swap=${butter}:${oil}`,
    );
    expect(swapped.status).toBe(200);
    // the butter row is gone; an olive oil row stands in its place
    const foods = swapped.body.preview.ingredients.map((i: { foodReferenceId: string }) => i.foodReferenceId);
    expect(foods).not.toContain(butter);
    expect(foods).toContain(oil);

    const cooked = await api('POST', `/api/recipes/${recipe.id}/cook`, { swaps: { [butter]: oil } });
    expect(cooked.status).toBe(200);

    // oil was drawn down, and the recipe itself still asks for butter
    const oilLeft = await prisma.inventoryItem.findFirstOrThrow({ where: { userId, foodReferenceId: oil } });
    expect(oilLeft.quantity).toBeLessThan(2000);
    const unchanged = await prisma.recipeIngredient.findFirst({
      where: { recipeId: recipe.id, foodReferenceId: butter },
    });
    expect(unchanged, 'the recipe is not edited by a swap').toBeTruthy();
  });

  it('ignores a pairing that is not a known substitution', async () => {
    const butter = await foodId('Unsalted Butter');
    const rice = await foodId('White Rice');
    const recipe = await prisma.recipe.findFirstOrThrow({
      where: { ownerId: null, deletedAt: null, ingredients: { some: { foodReferenceId: butter } } },
    });

    const result = await api('GET', `/api/recipes/${recipe.id}/cook-preview?swap=${butter}:${rice}`);
    expect(result.status).toBe(200);
    // no rule, so no guess at a ratio: butter is still what it asks for
    const foods = result.body.preview.ingredients.map((i: { foodReferenceId: string }) => i.foodReferenceId);
    expect(foods).toContain(butter);
    expect(foods).not.toContain(rice);
  });
});
