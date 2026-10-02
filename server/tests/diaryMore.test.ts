/**
 * The diary, more fully: fiber, sugar, saturated fat and sodium; a plate eaten
 * out as one meal of separate lines that can each be eaten less of; the rest of
 * anything sent home or to the bin; and water.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { PRIVACY_VERSION } from '../src/content/privacy.js';
import { deleteAccount } from '../src/services/auth.js';
import { tidy } from '../src/services/snap.js';
import { FOODS } from '../prisma/data/foods.js';
import { MORE_NUTRIENTS } from '../prisma/data/nutrients.js';

let app: FastifyInstance;
const stamp = Date.now();
type Who = { token: string; id: string };
let eater: Who;
let other: Who;

async function register(label: string): Promise<Who> {
  const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: `${label}-${stamp}@example.test`, password: 'testpassword', acceptPrivacyVersion: PRIVACY_VERSION } });
  const body = JSON.parse(response.body);
  return { token: body.token, id: body.user.id };
}
async function call(who: Who, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) {
  const response = await app.inject({ method, url, headers: { authorization: `Bearer ${who.token}` }, ...(payload === undefined ? {} : { payload }) });
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : null };
}
const catalogue = (name: string) => prisma.foodReference.findFirstOrThrow({ where: { name, ownerId: null, barcode: null } });
const today = async (who: Who) => (await call(who, 'GET', '/api/consumption/today')).body;
const near = (value: number | null, expected: number) => expect(value).toBeCloseTo(expected, 0);

beforeAll(async () => {
  app = await buildApp();
  eater = await register('eater');
  other = await register('other-eater');
});

afterAll(async () => {
  for (const who of [eater, other]) await deleteAccount(who.id);
  await app.close();
});

describe('the catalog', () => {
  it('has fiber, sugar, saturated fat and sodium for every food it ships', async () => {
    for (const food of FOODS) expect(MORE_NUTRIENTS[food.key], food.key).toBeDefined();
    const banana = await catalogue('Banana');
    // per 118 g banana, from 2.6 g fiber and 12.2 g sugar per 100 g
    expect(banana.fiberPerUnit).toBeCloseTo(3.07, 1);
    expect(banana.sugarPerUnit).toBeCloseTo(14.4, 1);
  });
});

describe('a day’s nutrients', () => {
  it('adds up fiber and sugar, and measures them against the calorie target', async () => {
    const banana = await catalogue('Banana');
    await call(eater, 'POST', '/api/consumption/eat-out', { foodReferenceId: banana.id, quantity: 1, unit: 'count', mealSlot: 'breakfast' });
    const day = await today(eater);
    near(day.nutrients.fiber, 3);
    near(day.nutrients.sugar, 14);
    expect(day.nutrientGuides).toEqual({ fiber: Math.round((day.targets.calories / 1000) * 14), satFat: Math.round((day.targets.calories * 0.1) / 9), sodium: 2300 });
  });
});

describe('a plate eaten out', () => {
  let mealId: string;
  const lineNamed = async (name: string) => {
    const entry = (await call(eater, 'GET', `/api/consumption/${mealId}`)).body.entry;
    return { entry, line: entry.lines.find((l: { name: string }) => l.name === name) };
  };

  it('is one meal in the diary, with a line for each item', async () => {
    const logged = await call(eater, 'POST', '/api/consumption/eat-out/meal', {
      name: 'Burger, fries & cola',
      mealSlot: 'lunch',
      items: [
        { name: 'Cheeseburger', grams: 220, calories: 540, protein: 30, carbs: 40, fat: 28, fiber: 2, sugar: 8, satFat: 12, sodium: 1050 },
        { name: 'Fries', grams: 117, calories: 380, protein: 4, carbs: 48, fat: 18, fiber: 4, sugar: 0, satFat: 3, sodium: 260 },
        { name: 'Cola', grams: 400, calories: 170, protein: 0, carbs: 42, fat: 0 },
      ],
    });
    expect(logged.status).toBe(201);
    mealId = logged.body.meal.id;

    const lunch = (await today(eater)).meals.find((m: { slot: string }) => m.slot === 'lunch');
    expect(lunch.entries).toHaveLength(1);
    expect(lunch.entries[0]).toMatchObject({ id: mealId, kind: 'meal', name: 'Burger, fries & cola', calories: 1090, ingredientCount: 3, source: 'eating_out' });

    const { entry } = await lineNamed('Fries');
    expect(entry.lines.map((l: { name: string }) => l.name)).toEqual(['Cheeseburger', 'Fries', 'Cola']);
    expect(entry.nutrients).toMatchObject({ fiber: 6, sodium: 1310 });
    // the items are this person's own foods, by the gram
    const burger = await prisma.foodReference.findFirstOrThrow({ where: { name: 'Cheeseburger', ownerId: eater.id } });
    expect(burger.defaultUnit).toBe('g');
    expect(burger.caloriesPerUnit).toBeCloseTo(540 / 220, 3);
  });

  it('lets one line be left, with the rest in the bin, counted as waste', async () => {
    const { line } = await lineNamed('Fries');
    const result = await call(eater, 'POST', `/api/consumption/${line.id}/eat-less`, { ate: 0, rest: 'bin' });
    expect(result.status).toBe(200);
    const after = (await lineNamed('Fries')).line;
    expect(after).toMatchObject({ calories: 0, fullCalories: 380, share: 0, restTo: 'bin' });
    expect(await prisma.inventoryRemoval.count({ where: { userId: eater.id, reason: 'wasted', foodReference: { name: 'Fries' } } })).toBe(1);
  });

  it('sends half a line home as a leftover, and a change of mind takes it back', async () => {
    const { line } = await lineNamed('Cheeseburger');
    await call(eater, 'POST', `/api/consumption/${line.id}/eat-less`, { ate: 0.5, rest: 'pantry' });
    let leftovers = await prisma.inventoryItem.findMany({ where: { userId: eater.id, isLeftover: true, foodReference: { name: 'Cheeseburger' } } });
    expect(leftovers).toHaveLength(1);
    expect(leftovers[0]).toMatchObject({ quantity: 110, unit: 'g', storageLocation: 'fridge' });
    expect((await lineNamed('Cheeseburger')).line).toMatchObject({ calories: 270, share: 0.5, restTo: 'pantry' });

    // ate a quarter after all: one leftover, the bigger one
    await call(eater, 'POST', `/api/consumption/${line.id}/eat-less`, { ate: 0.25, rest: 'pantry' });
    leftovers = await prisma.inventoryItem.findMany({ where: { userId: eater.id, isLeftover: true, foodReference: { name: 'Cheeseburger' } } });
    expect(leftovers.map((l) => l.quantity)).toEqual([165]);
    expect((await lineNamed('Cheeseburger')).line.calories).toBe(135);

    // all of it after all: the line as logged, nothing in the fridge
    await call(eater, 'POST', `/api/consumption/${line.id}/eat-less`, { ate: 1 });
    expect((await lineNamed('Cheeseburger')).line).toMatchObject({ calories: 540, share: 1, restTo: null });
    expect(await prisma.inventoryItem.count({ where: { userId: eater.id, isLeftover: true, foodReference: { name: 'Cheeseburger' } } })).toBe(0);
  });

  it('goes from the diary whole, waste record and all', async () => {
    const removed = await call(eater, 'DELETE', `/api/consumption/${mealId}`);
    expect(removed.body.result.name).toBe('Burger, fries & cola');
    expect(await prisma.consumptionLog.count({ where: { userId: eater.id, cookEventId: mealId } })).toBe(0);
    expect(await prisma.inventoryRemoval.count({ where: { userId: eater.id, foodReference: { name: 'Fries' } } })).toBe(0);
  });

  it('is nobody else’s to see or reuse', async () => {
    await call(eater, 'POST', '/api/consumption/eat-out', { name: `Nan's stew ${stamp}`, calories: 600 });
    const stew = await prisma.foodReference.findFirstOrThrow({ where: { name: `Nan's stew ${stamp}` } });
    expect(stew.ownerId).toBe(eater.id);
    const found = await call(other, 'GET', `/api/consumption/eat-out/search?q=${encodeURIComponent(`Nan's stew ${stamp}`)}`);
    expect(found.body.results.some((r: { id: string }) => r.id === stew.id)).toBe(false);
    // typed by someone else, it is a new entry of theirs, so it needs their calories
    const theirs = await call(other, 'POST', '/api/consumption/eat-out', { name: `Nan's stew ${stamp}` });
    expect(theirs.status).toBe(400);
    expect(theirs.body.error).toBe('calories_required');
  });
});

describe('the rest of something from the pantry', () => {
  it('can go in the bin instead of back on the shelf, and that can be undone', async () => {
    const banana = await catalogue('Banana');
    const added = await call(eater, 'POST', '/api/inventory', { foodReferenceId: banana.id, quantity: 4, unit: 'count', storageLocation: 'pantry' });
    const eaten = await call(eater, 'POST', `/api/inventory/${added.body.item.id}/consume`, { quantity: 2, unit: 'count' });
    const logId = eaten.body.result.consumptionLogId;

    const binned = await call(eater, 'POST', `/api/consumption/${logId}/save-rest`, { ate: 0.5, rest: 'bin' });
    expect(binned.body.result.restored).toBeNull();
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: added.body.item.id } })).quantity).toBe(2);
    const removal = await prisma.inventoryRemoval.findUniqueOrThrow({ where: { id: binned.body.result.binnedId } });
    expect(removal).toMatchObject({ reason: 'wasted', quantity: 1, unit: 'count' });

    await call(eater, 'POST', `/api/consumption/${logId}/save-rest/undo`, { ate: 0.5, binnedId: removal.id });
    expect(await prisma.inventoryRemoval.count({ where: { id: removal.id } })).toBe(0);
    expect((await prisma.consumptionLog.findUniqueOrThrow({ where: { id: logId } })).quantityConsumed).toBe(2);
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: added.body.item.id } })).quantity).toBe(2);
  });
});

describe('water', () => {
  it('adds up a day’s glasses against a goal the person sets', async () => {
    expect((await call(eater, 'GET', '/api/water/day')).body).toMatchObject({ ml: 0, goalMl: 2500 });
    await call(eater, 'POST', '/api/water', { ml: 250 });
    const second = await call(eater, 'POST', '/api/water', { ml: 500 });
    expect(second.body.day.ml).toBe(750);

    // someone else can't take a glass back
    expect((await call(other, 'DELETE', `/api/water/${second.body.entry.id}`)).status).toBe(404);
    expect((await call(eater, 'DELETE', `/api/water/${second.body.entry.id}`)).body.ml).toBe(250);

    await call(eater, 'PATCH', '/api/settings', { waterGoalMl: 3000 });
    expect((await call(eater, 'GET', '/api/water/day')).body.goalMl).toBe(3000);
    expect((await call(eater, 'POST', '/api/water', { ml: 5000 })).status).toBe(400);
  });
});

describe('a photo’s reading', () => {
  it('keeps fiber, sugar, saturated fat and sodium when the reader gives them, and nulls when it does not', () => {
    const [chips, rice] = tidy([
      { n: 'chips', g: 150, k: 400, p: 5, c: 50, f: 19, b: 4, s: 0, t: 3, d: 300 },
      { n: 'rice', g: 150, k: 190, p: 4, c: 42, f: 0 },
    ]);
    expect(chips).toMatchObject({ fiber: 4, sugar: 0, satFat: 3, sodium: 300 });
    expect(rice).toMatchObject({ fiber: null, sugar: null, satFat: null, sodium: null });
  });
});
