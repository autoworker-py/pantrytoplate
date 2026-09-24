/**
 * Your own foods are yours.
 *
 * The catalog has two kinds of row. A seeded ingredient or a barcode lookup is
 * a fact about a product and belongs to everyone. A food someone typed in by
 * hand - "Nan's stuffing", the thing from the deli counter - is a fact about
 * that person's kitchen, and leaking it would leak it into their recipe
 * matches and their pantry search too.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { PRIVACY_VERSION } from '../src/content/privacy.js';

let app: FastifyInstance;
let tokenA = '';
let tokenB = '';
let userA = '';

const stamp = Date.now();

async function register(email: string) {
  const r = await app.inject({
    method: 'POST', url: '/api/auth/register',
    payload: { email, password: 'testpassword', acceptPrivacyVersion: PRIVACY_VERSION },
  });
  expect(r.statusCode).toBe(201);
  return JSON.parse(r.body).token as string;
}

const as = (token: string) => ({ authorization: `Bearer ${token}` });

async function call(token: string, method: 'GET' | 'POST', url: string, payload?: unknown) {
  const r = await app.inject({ method, url, headers: as(token), ...(payload ? { payload } : {}) });
  return { status: r.statusCode, body: r.body ? JSON.parse(r.body) : null };
}

beforeAll(async () => {
  app = await buildApp();
  tokenA = await register(`own-a-${stamp}@example.test`);
  tokenB = await register(`own-b-${stamp}@example.test`);
  userA = (await prisma.user.findFirstOrThrow({ where: { email: `own-a-${stamp}@example.test` } })).id;
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('a food you add by hand', () => {
  const NAME = `Nans Stuffing ${stamp}`;

  it('is stored against you, not the shared catalog', async () => {
    const created = await call(tokenA, 'POST', '/api/foods', {
      name: NAME, defaultUnit: 'g', caloriesPerUnit: 2.4,
    });
    expect(created.status).toBe(201);
    const row = await prisma.foodReference.findFirstOrThrow({ where: { name: NAME } });
    expect(row.ownerId).toBe(userA);
  });

  it('shows up in your own search', async () => {
    const found = await call(tokenA, 'GET', `/api/foods/search?q=${encodeURIComponent('Nans Stuffing')}`);
    expect(found.body.foods.map((f: { name: string }) => f.name)).toContain(NAME);
  });

  it('never shows up in anyone else\'s', async () => {
    const found = await call(tokenB, 'GET', `/api/foods/search?q=${encodeURIComponent('Nans Stuffing')}`);
    expect(found.body.foods.map((f: { name: string }) => f.name)).not.toContain(NAME);
  });

  it('does not stop them creating their own food of the same name', async () => {
    // two kitchens may both have a Nan
    const theirs = await call(tokenB, 'POST', '/api/foods', { name: NAME, defaultUnit: 'g' });
    expect(theirs.status).toBe(201);
    const rows = await prisma.foodReference.findMany({ where: { name: NAME } });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.ownerId)).size).toBe(2);
  });
});

describe('the shared catalog', () => {
  it('is visible to everybody', async () => {
    for (const token of [tokenA, tokenB]) {
      const found = await call(token, 'GET', '/api/foods/search?q=olive%20oil');
      expect(found.body.foods.map((f: { name: string }) => f.name)).toContain('Olive Oil');
    }
  });

  it('is what the seed writes - no seeded row belongs to a person', async () => {
    const owned = await prisma.foodReference.count({ where: { source: { not: 'manual' }, ownerId: { not: null } } });
    expect(owned).toBe(0);
  });
});
