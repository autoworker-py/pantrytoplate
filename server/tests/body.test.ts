/**
 * Weight, a goal by a date, and the target that learns: safe paces only, a
 * smoothed trend, and a weekly adjustment from the diary and the weigh-ins that
 * leaves a target the person set alone.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { PRIVACY_VERSION } from '../src/content/privacy.js';
import { deleteAccount } from '../src/services/auth.js';
import { planGoal } from '../src/services/energy.js';
import { maybeAdapt, observeTdee, trendOf } from '../src/services/body.js';
import { addDays, localDay } from '../src/zone.js';

let app: FastifyInstance;
const stamp = Date.now();
type Who = { token: string; id: string };
let person: Who;

async function register(label: string): Promise<Who> {
  const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: `${label}-${stamp}@example.test`, password: 'testpassword', acceptPrivacyVersion: PRIVACY_VERSION } });
  const body = JSON.parse(response.body);
  return { token: body.token, id: body.user.id };
}
async function call(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: object) {
  const response = await app.inject({ method, url, headers: { authorization: `Bearer ${person.token}` }, ...(payload === undefined ? {} : { payload }) });
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : null };
}
const target = async () => (await prisma.user.findUniqueOrThrow({ where: { id: person.id } })).dailyCalorieTarget;
const today = () => localDay(new Date());

beforeAll(async () => {
  app = await buildApp();
  person = await register('body');
  await call('PATCH', '/api/settings', { heightCm: 178, weightKg: 90, birthYear: 1990, sex: 'male', activityLevel: 'light' });
});

afterAll(async () => {
  await deleteAccount(person.id);
  await app.close();
});

describe('a goal by a date', () => {
  const base = { weightKg: 90, today: '2026-10-02', heightCm: 178, birthYear: 1990 };

  it('is planned at a safe pace', () => {
    // 9 kg in 20 weeks: 0.45 kg a week, half a percent of 90 kg
    const plan = planGoal({ ...base, goalWeightKg: 81, goalDate: '2027-02-19' });
    expect(plan).toMatchObject({ ok: true, direction: 'lose', weeklyRateKg: 0.45, pace: 'gentle' });
  });

  it('is refused when too fast, with the earliest safe date instead', () => {
    // about 13.6 kg (30 lb) in a month
    const plan = planGoal({ ...base, goalWeightKg: 76.4, goalDate: '2026-11-02' });
    expect(plan.ok).toBe(false);
    expect(plan.problem).toBe('too_fast');
    // at the safe 0.9 kg a week (1% of 90 kg), 13.6 kg takes about 106 days
    expect(plan.earliestSafeDate).toBe('2027-01-16');
  });

  it('is refused below a healthy weight for the height, and for weight loss under 18', () => {
    expect(planGoal({ ...base, goalWeightKg: 55, goalDate: '2028-01-01' })).toMatchObject({ ok: false, problem: 'below_healthy', lowestGoalKg: 58.7 });
    expect(planGoal({ ...base, birthYear: new Date().getFullYear() - 16, goalWeightKg: 85, goalDate: '2027-06-01' })).toMatchObject({ ok: false, problem: 'too_young' });
  });

  it('keeps gaining slower than losing, and a goal within half a kilo is keeping steady', () => {
    expect(planGoal({ ...base, goalWeightKg: 95, goalDate: '2026-11-02' })).toMatchObject({ ok: false, problem: 'too_fast' });
    expect(planGoal({ ...base, goalWeightKg: 90.3, goalDate: '2026-11-02' })).toMatchObject({ ok: true, direction: 'maintain' });
  });

  it('is set through the app, which refuses the unsafe one and lowers the target for the safe one', async () => {
    const before = await target();
    const tooFast = await call('PUT', '/api/body/goal', { weightKg: 76.4, date: addDays(today(), 31) });
    expect(tooFast.status).toBe(400);
    expect(tooFast.body.error).toBe('goal_too_fast');
    expect(tooFast.body.details.plan.earliestSafeDate).toBeTruthy();

    const preview = await call('POST', '/api/body/goal/preview', { weightKg: 85, date: addDays(today(), 70) });
    expect(preview.body.plan).toMatchObject({ ok: true, direction: 'lose' });

    const set = await call('PUT', '/api/body/goal', { weightKg: 85, date: addDays(today(), 70) });
    expect(set.status).toBe(200);
    expect(await target()).toBeLessThan(before);
    const settings = (await call('GET', '/api/settings')).body.settings;
    expect(settings.goal).toEqual({ weightKg: 85, date: addDays(today(), 70) });
  });
});

describe('weigh-ins', () => {
  it('follow a smoothed trend, so one heavy day moves it a little', () => {
    const trend = trendOf([{ day: '2026-10-01', kg: 90 }, { day: '2026-10-02', kg: 92 }]);
    expect(trend).toEqual([{ day: '2026-10-01', kg: 90 }, { day: '2026-10-02', kg: 90.2 }]);
  });

  it('keep one a day, update the weight on file, and leave a target the person set alone', async () => {
    await call('POST', '/api/body/weight', { kg: 89.5 });
    const again = await call('POST', '/api/body/weight', { kg: 89.2 });
    expect(again.body.entries.filter((e: { day: string }) => e.day === today())).toEqual([{ day: today(), kg: 89.2 }]);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: person.id } })).weightKg).toBe(89.2);

    await call('PATCH', '/api/settings', { dailyCalorieTarget: 2345 });
    await call('POST', '/api/body/weight', { kg: 88.9 });
    expect(await target()).toBe(2345);
    // handed back, the goal decides again
    await call('PATCH', '/api/settings', { targetSetBy: 'app' });
    expect(await target()).not.toBe(2345);
    expect((await call('POST', '/api/body/weight', { kg: 80, day: addDays(today(), 2) })).status).toBe(400);
  });
});

describe('the weekly adjustment', () => {
  it('reads what the person burns off three weeks of diary and weigh-ins, once a week', async () => {
    const food = await prisma.foodReference.findFirstOrThrow({ where: { name: 'Banana', ownerId: null } });
    await prisma.weightLog.deleteMany({ where: { userId: person.id } });
    for (let i = 21; i >= 1; i--) {
      const day = addDays(today(), -i);
      await prisma.consumptionLog.create({
        data: { userId: person.id, foodReferenceId: food.id, quantityConsumed: 1, unit: 'count', source: 'manual', calories: 2600, consumedAt: new Date(`${day}T12:00:00Z`) },
      });
      // half a kilo a week down
      if (i % 3 === 0) await prisma.weightLog.create({ data: { userId: person.id, day, kg: Math.round((90 - ((21 - i) * 0.5) / 7) * 100) / 100 } });
    }
    const seen = await observeTdee(person.id);
    // ate 2,600 a day and lost weight, so burns more than 2,600
    expect(seen).toBeGreaterThan(2600);

    await prisma.user.update({ where: { id: person.id }, data: { adaptedAt: null } });
    expect(await maybeAdapt(person.id)).toBe(true);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: person.id } });
    expect(after.adaptedTdee).toBe(seen);
    // and not again until a week has gone by
    expect(await maybeAdapt(person.id)).toBe(false);
  });
});
