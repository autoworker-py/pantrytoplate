/**
 * Health grades, A to E the Nutri-Score way, and what the diary can tell a
 * person about when and what they eat.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { PRIVACY_VERSION } from '../src/content/privacy.js';
import { deleteAccount } from '../src/services/auth.js';
import { foodGrade } from '../src/services/healthScore.js';
import { addDays, localDay } from '../src/zone.js';

let app: FastifyInstance;
const stamp = Date.now();
let who: { token: string; id: string };

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) {
  const response = await app.inject({ method, url, headers: { authorization: `Bearer ${who.token}` }, ...(payload === undefined ? {} : { payload }) });
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : null };
}
const catalogue = (name: string) => prisma.foodReference.findFirstOrThrow({ where: { name, ownerId: null, barcode: null } });

beforeAll(async () => {
  app = await buildApp();
  const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: `insights-${stamp}@example.test`, password: 'testpassword', acceptPrivacyVersion: PRIVACY_VERSION } });
  const body = JSON.parse(response.body);
  who = { token: body.token, id: body.user.id };
});

afterAll(async () => {
  await deleteAccount(who.id);
  await app.close();
});

describe('health grades', () => {
  it('grade foods the Nutri-Score way, with drinks on their own scale and alcohol left out', async () => {
    expect(foodGrade(await catalogue('Banana'))).toBe('A');
    expect(foodGrade(await catalogue('Cheddar Cheese'))).toBe('D');
    expect(foodGrade(await catalogue('Cola'))).toBe('E');
    expect(foodGrade(await catalogue('Sparkling Water'))).toBe('A');
    expect(foodGrade(await catalogue('Beer'))).toBeNull();
  });

  it('grade a day by what was eaten, the bigger things counting for more', async () => {
    const banana = await catalogue('Banana');
    await call('POST', '/api/consumption/eat-out', { foodReferenceId: banana.id, quantity: 2, unit: 'count', mealSlot: 'breakfast' });
    const day = (await call('GET', '/api/consumption/today')).body;
    expect(day.grade).toBe('A');
    expect(day.meals.find((m: { slot: string }) => m.slot === 'breakfast').entries[0].grade).toBe('A');
  });
});

describe('insights', () => {
  it('say when each meal is eaten, what is eaten most, and the protein at each', async () => {
    const yogurt = await catalogue('Plain Greek Yogurt');
    for (const n of [1, 2, 3]) {
      const day = addDays(localDay(new Date()), -n);
      await prisma.consumptionLog.create({
        data: { userId: who.id, foodReferenceId: yogurt.id, quantityConsumed: 200, unit: 'g', source: 'manual', mealSlot: 'breakfast', calories: 120, proteinGrams: 20, consumedAt: new Date(`${day}T08:00:00Z`) },
      });
    }
    const seen = (await call('GET', '/api/insights?days=30')).body;
    const breakfast = seen.mealTimes.find((m: { slot: string }) => m.slot === 'breakfast');
    expect(breakfast.days).toBeGreaterThanOrEqual(3);
    expect(seen.topFoods[0]).toEqual({ name: 'Plain Greek Yogurt', times: 3 });
    expect(seen.proteinByMeal.find((m: { slot: string }) => m.slot === 'breakfast').grams).toBeGreaterThan(0);
    expect(seen.lastMeals.length).toBeGreaterThanOrEqual(3);
    expect(['A', 'B']).toContain(seen.grade.now);
    expect(seen.waste).toEqual({ now: 0, before: 0 });
  });

  it('keep the burned-calories setting, all by default', async () => {
    expect((await call('GET', '/api/settings')).body.settings.exerciseCalories).toBe('all');
    await call('PATCH', '/api/settings', { exerciseCalories: 'half' });
    expect((await call('GET', '/api/settings')).body.settings.exerciseCalories).toBe('half');
  });
});
