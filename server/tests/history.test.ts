/**
 * The seven-day chart's data.
 *
 * The chart was reported broken and the cause turned out to be CSS — every bar
 * filled its track regardless of height. The numbers behind it were right all
 * along, and had no tests at all, which is why nothing pointed at the real
 * culprit. These cover the half that can regress in code: the right days, in
 * the right order, with the right totals, including the empty ones.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { PRIVACY_VERSION } from '../src/content/privacy.js';

let app: FastifyInstance;
let token = '';
let userId = '';
const stamp = Date.now();

async function api(method: 'GET' | 'POST', url: string, payload?: Record<string, unknown>) {
  const response = await app.inject({
    method, url,
    headers: { authorization: `Bearer ${token}` },
    ...(payload === undefined ? {} : { payload }),
  });
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : null };
}

/** Local calendar day, the way the app reckons dates everywhere else. */
function isoDay(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

/** Log a meal on a given day, at midday so no timezone can move it. */
async function logOn(offsetDays: number, calories: number) {
  const when = new Date();
  when.setDate(when.getDate() + offsetDays);
  when.setHours(12, 0, 0, 0);
  const egg = await prisma.foodReference.findFirstOrThrow({ where: { name: 'Egg' } });
  await prisma.consumptionLog.create({
    data: {
      userId,
      foodReferenceId: egg.id,
      quantityConsumed: 1,
      unit: 'count',
      source: 'manual',
      mealSlot: 'lunch',
      calories,
      proteinGrams: 10,
      consumedAt: when,
    },
  });
}

beforeAll(async () => {
  app = await buildApp();
  const registered = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: {
      email: `history-${stamp}@example.test`,
      password: 'testpassword',
      acceptPrivacyVersion: PRIVACY_VERSION,
    },
  });
  token = JSON.parse(registered.body).token;
  userId = JSON.parse(registered.body).user.id;
});

afterAll(async () => {
  await prisma.consumptionLog.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await app.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.consumptionLog.deleteMany({ where: { userId } });
});

describe('the seven-day history', () => {
  it('returns exactly seven days, oldest first, ending today', async () => {
    const result = await api('GET', '/api/consumption/history?days=7');
    expect(result.status).toBe(200);

    const days = result.body.days as Array<{ date: string; totalCalories: number }>;
    expect(days).toHaveLength(7);
    expect(days[0]!.date).toBe(isoDay(-6));
    expect(days[6]!.date).toBe(isoDay(0));

    // ascending, and no gaps — a chart with a missing column is a broken chart
    const dates = days.map((day) => day.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it('reports a zero for a day with nothing logged rather than omitting it', async () => {
    await logOn(-3, 500);
    const days = (await api('GET', '/api/consumption/history?days=7')).body.days;

    expect(days).toHaveLength(7);
    expect(days.filter((day: { totalCalories: number }) => day.totalCalories === 0)).toHaveLength(6);
  });

  it('puts each day’s calories on that day', async () => {
    await logOn(-4, 700);
    await logOn(-1, 250);
    await logOn(0, 90);

    const days = (await api('GET', '/api/consumption/history?days=7')).body.days as Array<{
      date: string;
      totalCalories: number;
    }>;
    const byDate = new Map(days.map((day) => [day.date, day.totalCalories]));

    expect(byDate.get(isoDay(-4))).toBeCloseTo(700, 1);
    expect(byDate.get(isoDay(-1))).toBeCloseTo(250, 1);
    expect(byDate.get(isoDay(0))).toBeCloseTo(90, 1);
    expect(byDate.get(isoDay(-2))).toBe(0);
  });

  it('sums several entries on the same day', async () => {
    await logOn(-2, 300);
    await logOn(-2, 450);
    await logOn(-2, 125);

    const days = (await api('GET', '/api/consumption/history?days=7')).body.days as Array<{
      date: string;
      totalCalories: number;
    }>;
    const target = days.find((day) => day.date === isoDay(-2));
    expect(target?.totalCalories).toBeCloseTo(875, 1);
  });

  it('honours a different window', async () => {
    const days = (await api('GET', '/api/consumption/history?days=14')).body.days;
    expect(days).toHaveLength(14);
    expect(days[13].date).toBe(isoDay(0));
  });

  it('does not leak another account’s meals', async () => {
    await logOn(-1, 400);
    const other = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: `history-other-${stamp}@example.test`,
        password: 'testpassword',
        acceptPrivacyVersion: PRIVACY_VERSION,
      },
    });
    const otherBody = JSON.parse(other.body);

    const response = await app.inject({
      method: 'GET',
      url: '/api/consumption/history?days=7',
      headers: { authorization: `Bearer ${otherBody.token}` },
    });
    const days = JSON.parse(response.body).days as Array<{ totalCalories: number }>;
    expect(days.every((day) => day.totalCalories === 0)).toBe(true);

    await prisma.user.deleteMany({ where: { id: otherBody.user.id } });
  });
});
