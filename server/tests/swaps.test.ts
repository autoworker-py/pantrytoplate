/**
 * Toast asks for wholemeal bread; the cupboard has white. That recipe is
 * ready tonight with a swap, and ranks above one that needs a shop.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { PRIVACY_VERSION } from '../src/content/privacy.js';

let app: FastifyInstance;
let auth: { authorization: string };

async function food(name: string) {
  const found = await prisma.foodReference.findFirst({ where: { name, ownerId: null } });
  if (!found) throw new Error(`no ${name} in the catalogue`);
  return found.id;
}

async function recipe(name: string, ingredients: Array<{ foodReferenceId: string; quantityRequired: number; unitRequired: string }>) {
  const response = await app.inject({ method: 'POST', url: '/api/recipes', headers: auth, payload: { name, instructions: '1. Make it.', servings: 1, ingredients } });
  expect(response.statusCode).toBe(201);
}

beforeAll(async () => {
  app = await buildApp();
  const registered = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: `swaps-${Date.now()}@example.test`, password: 'testpassword', acceptPrivacyVersion: PRIVACY_VERSION },
  });
  auth = { authorization: `Bearer ${JSON.parse(registered.body).token}` };

  const [wholemeal, white, saffron] = await Promise.all([food('Whole Wheat Bread'), food('White Bread'), food('Saffron')]);
  await app.inject({ method: 'POST', url: '/api/inventory', headers: auth, payload: { foodReferenceId: white, quantity: 4, unit: 'slice' } });
  await recipe('Toast for two', [{ foodReferenceId: wholemeal, quantityRequired: 2, unitRequired: 'slice' }]);
  await recipe('Toast for a crowd', [{ foodReferenceId: wholemeal, quantityRequired: 6, unitRequired: 'slice' }]);
  await recipe('Saffron toast', [
    { foodReferenceId: white, quantityRequired: 2, unitRequired: 'slice' },
    { foodReferenceId: saffron, quantityRequired: 1, unitRequired: 'pinch' },
  ]);
});

afterAll(async () => {
  await app.close();
});

async function mine() {
  const response = await app.inject({ method: 'GET', url: '/api/recipes?mine=1', headers: auth });
  expect(response.statusCode).toBe(200);
  return JSON.parse(response.body).recipes as Array<{ name: string; canMakeNow: boolean; swaps: Array<{ name: string; substituteName: string }>; reasons: string[] }>;
}

describe('ready with a swap', () => {
  it('fills a gap with something held in enough quantity', async () => {
    const toast = (await mine()).find((r) => r.name === 'Toast for two');
    expect(toast?.canMakeNow).toBe(false);
    expect(toast?.swaps).toEqual([expect.objectContaining({ name: 'Whole Wheat Bread', substituteName: 'White Bread' })]);
    expect(toast?.reasons).toContain('Ready with white bread for whole wheat bread');
  });

  it('does not count a stand-in there is not enough of', async () => {
    const crowd = (await mine()).find((r) => r.name === 'Toast for a crowd');
    expect(crowd?.swaps).toEqual([]);
  });

  it('ranks a swap above a recipe that needs a shop', async () => {
    const names = (await mine()).map((r) => r.name);
    expect(names.indexOf('Toast for two')).toBeLessThan(names.indexOf('Saffron toast'));
  });
});
