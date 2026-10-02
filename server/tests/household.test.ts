/**
 * Housemates: one pantry and one shopping list, a diary each. Joining brings
 * your food in, codes work once and not for long, and nobody's dinner leaves
 * with someone else's account.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { PRIVACY_VERSION } from '../src/content/privacy.js';
import { deleteAccount } from '../src/services/auth.js';
import { enforceLimits } from '../src/limits.js';

let app: FastifyInstance;
const stamp = Date.now();
type Who = { token: string; id: string };
const people: Who[] = [];

async function register(label: string): Promise<Who> {
  const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: `${label}-${stamp}@example.test`, password: 'testpassword', acceptPrivacyVersion: PRIVACY_VERSION } });
  const body = JSON.parse(response.body);
  const who = { token: body.token, id: body.user.id };
  people.push(who);
  return who;
}
async function call(who: Who, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object, remoteAddress?: string) {
  const response = await app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${who.token}` },
    ...(payload === undefined ? {} : { payload }),
    ...(remoteAddress ? { remoteAddress } : {}),
  });
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : null };
}
const food = (name: string) => prisma.foodReference.findFirstOrThrow({ where: { name, ownerId: null, barcode: null } });
async function stock(who: Who, name: string, quantity: number, unit = 'count') {
  const added = await call(who, 'POST', '/api/inventory', { foodReferenceId: (await food(name)).id, quantity, unit });
  expect(added.status).toBe(201);
  return added.body.item as { id: string };
}
const pantry = async (who: Who) =>
  ((await call(who, 'GET', '/api/inventory')).body.items as Array<{ id: string; food: { name: string }; quantity: number }>).map((i) => ({ ...i, name: i.food.name }));
const list = async (who: Who) => (await call(who, 'GET', '/api/shopping-list')).body.items as Array<{ id: string; name: string; quantityNeeded: number }>;
async function invite(who: Who) {
  const made = await call(who, 'POST', '/api/household/invite');
  expect(made.status).toBe(201);
  expect(made.body.code).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
  return made.body.code as string;
}
async function join(who: Who, code: string, from?: string) {
  return call(who, 'POST', '/api/household/join', { code }, from);
}

let owner: Who;
let mate: Who;

beforeAll(async () => {
  app = await buildApp();
});

beforeEach(async () => {
  for (const who of people.splice(0)) await deleteAccount(who.id);
  owner = await register('house-owner');
  mate = await register('house-mate');
});

afterAll(async () => {
  for (const who of people) await deleteAccount(who.id);
  await app.close();
});

describe('one pantry, a diary each', () => {
  it('brings the joiner’s food in, and eating from it is counted once for the house', async () => {
    await stock(owner, 'Egg', 6);
    await stock(mate, 'Apple', 4);
    expect((await join(mate, await invite(owner))).status).toBe(200);

    const shared = await pantry(owner);
    expect(shared.map((i) => i.name).sort()).toEqual(['Apple', 'Egg']);
    expect((await pantry(mate)).map((i) => i.id).sort()).toEqual(shared.map((i) => i.id).sort());

    const eggs = shared.find((i) => i.name === 'Egg')!;
    const eaten = await call(mate, 'POST', `/api/inventory/${eggs.id}/consume`, { quantity: 2, unit: 'count', mealSlot: 'breakfast' });
    expect(eaten.status).toBe(200);
    expect((await pantry(owner)).find((i) => i.name === 'Egg')!.quantity).toBe(4);

    // the eggs are in the housemate's diary, not the owner's
    expect(await prisma.consumptionLog.count({ where: { userId: mate.id } })).toBe(1);
    expect(await prisma.consumptionLog.count({ where: { userId: owner.id } })).toBe(0);
  });

  it('shares the shopping list, and stocking it fills the house pantry', async () => {
    expect((await join(mate, await invite(owner))).status).toBe(200);
    const added = await call(owner, 'POST', '/api/shopping-list', { name: 'Whole Milk', quantityNeeded: 1000, unit: 'g', foodReferenceId: (await food('Whole Milk')).id });
    expect(added.status).toBe(201);
    const line = (await list(mate)).find((i) => i.name === 'Whole Milk')!;
    expect(line).toBeTruthy();

    expect((await call(mate, 'POST', `/api/shopping-list/${line.id}/stock`, {})).status).toBe(201);
    expect((await pantry(owner)).some((i) => i.name === 'Whole Milk')).toBe(true);
  });

  it('keeps a housemate out of the pantry once they leave', async () => {
    await stock(owner, 'Egg', 6);
    expect((await join(mate, await invite(owner))).status).toBe(200);
    expect((await call(mate, 'POST', '/api/household/leave')).status).toBe(200);
    expect(await pantry(mate)).toEqual([]);
    expect((await pantry(owner)).map((i) => i.name)).toEqual(['Egg']);
    expect((await call(mate, 'GET', '/api/household')).body.house).toBeNull();
  });
});

describe('invite codes', () => {
  it('work once', async () => {
    const third = await register('house-third');
    const code = await invite(owner);
    expect((await join(mate, code)).status).toBe(200);
    const again = await join(third, code);
    expect(again.status).toBe(400);
    expect(again.body.error).toBe('bad_code');
  });

  it('stop working after two days', async () => {
    const code = await invite(owner);
    await prisma.householdInvite.updateMany({ where: { household: { ownerId: owner.id } }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await join(mate, code)).body.error).toBe('bad_code');
  });

  it('are read however they’re typed', async () => {
    const code = await invite(owner);
    expect((await join(mate, ` ${code.replace('-', '').toLowerCase()} `)).status).toBe(200);
  });

  it('won’t pull someone out of a house with other people in it', async () => {
    const third = await register('house-third');
    expect((await join(mate, await invite(owner))).status).toBe(200);
    const moved = await join(mate, await invite(third));
    expect(moved.status).toBe(409);
    expect(moved.body.error).toBe('leave_first');
    expect((await join(mate, await invite(owner))).body.error).toBe('already_member');
  });

  it('are slow to guess', async () => {
    enforceLimits(true);
    try {
      const tries: number[] = [];
      // an address of its own, since the counter has seen this file's other joins
      for (let i = 0; i < 11; i++) tries.push((await join(mate, 'AAAAAA', '10.9.8.7')).status);
      expect(tries.slice(0, 10).every((s) => s === 400)).toBe(true);
      expect(tries[10]).toBe(429);
    } finally {
      enforceLimits(false);
    }
  });
});

describe('the person who set it up', () => {
  it('can take someone out; nobody else can', async () => {
    const third = await register('house-third');
    const code = await invite(owner);
    expect((await join(mate, code)).status).toBe(200);
    expect((await join(third, await invite(owner))).status).toBe(200);

    expect((await call(mate, 'POST', '/api/household/remove', { userId: third.id })).status).toBe(403);
    expect((await call(owner, 'POST', '/api/household/remove', { userId: third.id })).status).toBe(200);
    const house = (await call(owner, 'GET', '/api/household')).body.house;
    expect(house.members.map((m: { id: string }) => m.id).sort()).toEqual([owner.id, mate.id].sort());
    expect(house.youOwn).toBe(true);
  });

  it('hands the house and its food on when they delete their account', async () => {
    await stock(owner, 'Egg', 6);
    expect((await join(mate, await invite(owner))).status).toBe(200);
    await deleteAccount(owner.id);
    people.splice(people.indexOf(owner), 1);

    expect((await pantry(mate)).map((i) => i.name)).toEqual(['Egg']);
    const house = (await call(mate, 'GET', '/api/household')).body.house;
    expect(house.youOwn).toBe(true);
    expect(house.members).toHaveLength(1);
  });
});

describe('planning for one list', () => {
  it('counts both people’s meals against the one pantry', async () => {
    const egg = await food('Egg');
    const recipeFor = async (who: Who, name: string, eggs: number) =>
      (
        await prisma.recipe.create({
          data: { name, instructions: '1. Cook the eggs.', servings: 1, source: 'user', ownerId: who.id, ingredients: { create: [{ foodReferenceId: egg.id, quantityRequired: eggs, unitRequired: 'count' }] } },
        })
      ).id;
    for (const who of [owner, mate]) await prisma.user.update({ where: { id: who.id }, data: { plusSince: new Date() } });
    expect((await join(mate, await invite(owner))).status).toBe(200);
    await stock(owner, 'Egg', 3);

    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    expect((await call(owner, 'POST', '/api/planning/plan', { recipeId: await recipeFor(owner, 'Omelette', 3), plannedFor: today })).status).toBe(201);
    expect((await call(mate, 'POST', '/api/planning/plan', { recipeId: await recipeFor(mate, 'Scramble', 2), plannedFor: tomorrow })).status).toBe(201);

    // three eggs in the house cover the omelette; the scramble needs two more, on one line
    const eggs = (await list(owner)).filter((i) => i.name === 'Egg');
    expect(eggs).toHaveLength(1);
    expect(eggs[0]!.quantityNeeded).toBe(2);

    // the housemate leaving takes their meal's eggs off the house list and onto their own
    expect((await call(mate, 'POST', '/api/household/leave')).status).toBe(200);
    expect((await list(owner)).filter((i) => i.name === 'Egg')).toHaveLength(0);
    expect((await list(mate)).find((i) => i.name === 'Egg')!.quantityNeeded).toBe(2);
  });
});
