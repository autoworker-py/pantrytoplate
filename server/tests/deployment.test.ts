/**
 * The things that only matter once this is reachable from the internet.
 *
 * Two of them are here because they were real defects found while preparing a
 * deployment, not hypotheticals: a seed run that could delete a user's imported
 * recipe, and an account whose password is printed in the project README with
 * no way to change it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { PRIVACY_VERSION } from '../src/content/privacy.js';
import { changePassword } from '../src/services/auth.js';

let app: FastifyInstance;
const stamp = Date.now();
const created: string[] = [];

async function register(label: string, password = 'testpassword') {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: `${label}-${stamp}@example.test`, password , acceptPrivacyVersion: PRIVACY_VERSION },
  });
  const body = JSON.parse(response.body);
  created.push(body.user.id);
  return { token: body.token, id: body.user.id, email: body.user.email };
}

async function api(
  token: string,
  method: 'GET' | 'POST',
  url: string,
  payload?: Record<string, unknown>,
) {
  const response = await app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${token}` },
    ...(payload === undefined ? {} : { payload }),
  });
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : null };
}

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await prisma.recipe.deleteMany({ where: { ownerId: { in: created } } });
  await prisma.user.deleteMany({ where: { id: { in: created } } });
  await app.close();
  await prisma.$disconnect();
});

describe('changing your own password', () => {
  it('replaces the hash and the new password then works', async () => {
    const user = await register('pw', 'originalpassword');

    const changed = await api(user.token, 'POST', '/api/auth/password', {
      currentPassword: 'originalpassword',
      newPassword: 'a-much-better-one',
    });
    expect(changed.status).toBe(200);

    const withNew = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: user.email, password: 'a-much-better-one' },
    });
    expect(withNew.statusCode).toBe(200);

    // and the published one stops working, which is the entire point
    const withOld = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: user.email, password: 'originalpassword' },
    });
    expect(withOld.statusCode).toBe(401);
  });

  it('will not change it without the current password', async () => {
    const user = await register('pw2', 'originalpassword');
    const attempt = await api(user.token, 'POST', '/api/auth/password', {
      currentPassword: 'not-the-right-one',
      newPassword: 'something-else-entirely',
    });
    expect(attempt.status).toBe(401);

    // a valid token is not enough on its own — the old password still works
    const stillWorks = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: user.email, password: 'originalpassword' },
    });
    expect(stillWorks.statusCode).toBe(200);
  });

  it('refuses a password too short to be worth having', async () => {
    const user = await register('pw3', 'originalpassword');
    const attempt = await api(user.token, 'POST', '/api/auth/password', {
      currentPassword: 'originalpassword',
      newPassword: 'short',
    });
    expect(attempt.status).toBe(400);
  });

  it('needs a session at all', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/password',
      payload: { currentPassword: 'x', newPassword: 'yyyyyyyyyy' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('leaves other accounts alone', async () => {
    const mine = await register('pw4', 'originalpassword');
    const theirs = await register('pw5', 'originalpassword');

    await changePassword(mine.id, 'originalpassword', 'brand-new-password');

    const untouched = await prisma.user.findUniqueOrThrow({ where: { id: theirs.id } });
    expect(await bcrypt.compare('originalpassword', untouched.passwordHash)).toBe(true);
  });
});

describe('re-seeding a live server', () => {
  /**
   * The claim the deploy workflow rests on: pushing a recipe change rebuilds
   * and re-seeds the live server, and nobody loses anything they did.
   */
  it('updates a shipped recipe in place, keeping ratings and meal plans', async () => {
    const user = await register('reseed');
    const shipped = await prisma.recipe.findFirstOrThrow({
      where: { ownerId: null, deletedAt: null },
      include: { ingredients: true },
    });

    await prisma.recipeRating.create({
      data: { userId: user.id, recipeId: shipped.id, rating: 5 },
    });
    await prisma.mealPlanEntry.create({
      data: { userId: user.id, recipeId: shipped.id, plannedFor: new Date(), servings: 2 },
    });

    // exactly what the seed now does: update in place, replace ingredients
    await prisma.recipe.update({
      where: { id: shipped.id },
      data: {
        description: 'Rewritten by a later seed.',
        deletedAt: null,
        ingredients: {
          deleteMany: {},
          create: shipped.ingredients.map((i) => ({
            foodReferenceId: i.foodReferenceId,
            quantityRequired: i.quantityRequired,
            unitRequired: i.unitRequired,
            note: i.note,
          })),
        },
      },
    });

    // the id survived, so everything pointing at it did too
    const after = await prisma.recipe.findUniqueOrThrow({
      where: { id: shipped.id },
      include: { ingredients: true, ratings: true, planEntries: true },
    });
    expect(after.description).toBe('Rewritten by a later seed.');
    expect(after.ingredients).toHaveLength(shipped.ingredients.length);
    expect(after.ratings.map((r) => r.rating)).toContain(5);
    expect(after.planEntries).toHaveLength(1);

    await prisma.recipeRating.deleteMany({ where: { userId: user.id } });
    await prisma.mealPlanEntry.deleteMany({ where: { userId: user.id } });
    await prisma.recipe.update({
      where: { id: shipped.id },
      data: { description: shipped.description },
    });
  });

  it('retires a shipped recipe dropped from the book, but never a user one', async () => {
    const user = await register('retire');
    const mine = await prisma.recipe.create({
      data: { name: `Kept ${stamp}`, instructions: 'Mine.', servings: 1, source: 'imported', ownerId: user.id },
    });
    const stale = await prisma.recipe.create({
      data: { name: `Retired ${stamp}`, instructions: 'Was shipped once.', servings: 1, source: 'seeded' },
    });

    // What the seed does at the end, with the book's real names standing in for
    // RECIPES — every shipped recipe except the stale one is still in the book.
    const stillShipped = (
      await prisma.recipe.findMany({
        where: { ownerId: null, source: 'seeded' },
        select: { name: true },
      })
    )
      .map((row) => row.name)
      .filter((name) => name !== stale.name);

    await prisma.recipe.deleteMany({
      where: { ownerId: null, source: 'seeded', name: { notIn: stillShipped } },
    });

    expect(await prisma.recipe.findUnique({ where: { id: stale.id } })).toBeNull();
    expect(await prisma.recipe.findUnique({ where: { id: mine.id } })).not.toBeNull();
  });

  /**
   * The seed replaces the shipped recipe book by name. A person who imported a
   * recipe whose name the book already uses — "Chicken Alfredo" is both a
   * seeded recipe and a very likely import — must not lose it when someone
   * re-seeds to publish new recipes.
   */
  it('does not delete a user recipe that shares a name with a shipped one', async () => {
    const user = await register('seedsafe');
    const shipped = await prisma.recipe.findFirstOrThrow({ where: { ownerId: null, deletedAt: null } });

    const mine = await prisma.recipe.create({
      data: {
        name: shipped.name,
        instructions: 'Mine, not theirs.',
        servings: 1,
        source: 'imported',
        ownerId: user.id,
      },
    });

    // exactly what the seed does for each recipe in the book
    await prisma.recipe.deleteMany({ where: { name: shipped.name, ownerId: null } });

    expect(await prisma.recipe.findUnique({ where: { id: mine.id } })).not.toBeNull();
    expect(await prisma.recipe.findUnique({ where: { id: shipped.id } })).toBeNull();

    // put the shipped one back so later tests see the book they expect
    await prisma.recipe.create({
      data: {
        id: shipped.id,
        name: shipped.name,
        description: shipped.description,
        instructions: shipped.instructions,
        servings: shipped.servings,
        source: shipped.source,
        prepMinutes: shipped.prepMinutes,
        cookMinutes: shipped.cookMinutes,
        difficulty: shipped.difficulty,
        cuisine: shipped.cuisine,
        tags: shipped.tags,
      },
    });
  });
});
