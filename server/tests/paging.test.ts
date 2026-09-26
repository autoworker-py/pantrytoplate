/**
 * Recipe search pages through the whole book.
 *
 * The first page is the curated shortlist; later pages walk the rest in
 * cheap-rank order. Before paging existed the list stopped at sixty and a book
 * of 276 recipes looked like a book of sixty.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { PRIVACY_VERSION } from '../src/content/privacy.js';

let app: FastifyInstance;
let token: string;

beforeAll(async () => {
  app = await buildApp();
  const registered = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: `paging-${Date.now()}@example.test`, password: 'testpassword', acceptPrivacyVersion: PRIVACY_VERSION },
  });
  token = JSON.parse(registered.body).token;
});

afterAll(async () => {
  await app.close();
});

async function page(n: number) {
  const response = await app.inject({ method: 'GET', url: `/api/recipes?page=${n}`, headers: { authorization: `Bearer ${token}` } });
  expect(response.statusCode).toBe(200);
  return JSON.parse(response.body) as { recipes: Array<{ id: string }>; hasMore: boolean; total: number };
}

describe('recipe paging', () => {
  it('reaches every shipped recipe exactly once', async () => {
    const shipped = await prisma.recipe.count({ where: { ownerId: null, deletedAt: null } });
    const seen = new Set<string>();
    let n = 0;
    let more = true;
    while (more && n < 20) {
      const result = await page(n);
      for (const recipe of result.recipes) {
        expect(seen.has(recipe.id)).toBe(false);
        seen.add(recipe.id);
      }
      if (n === 0) expect(result.total).toBe(shipped);
      more = result.hasMore;
      n += 1;
    }
    expect(seen.size).toBe(shipped);
  });

  it('says there is more only when there is', async () => {
    const first = await page(0);
    expect(first.hasMore).toBe(first.total > first.recipes.length);
  });
});
