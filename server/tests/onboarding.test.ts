/**
 * Consent, body data, and the calorie target that comes out of it.
 *
 * The privacy gate is tested as a gate: an account cannot be created without
 * agreeing, and a revised notice withdraws the old agreement rather than
 * assuming it carries forward.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { PRIVACY_VERSION } from '../src/content/privacy.js';
import { basalRate, estimateEnergy, canEstimate, FLOOR_KCAL } from '../src/services/energy.js';

let app: FastifyInstance;
const stamp = Date.now();
const made: string[] = [];

async function register(label: string, extra: Record<string, unknown> = {}) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: {
      email: `${label}-${stamp}@example.test`,
      password: 'testpassword',
      acceptPrivacyVersion: PRIVACY_VERSION,
      ...extra,
    },
  });
  const body = JSON.parse(response.body);
  if (body.user) made.push(body.user.id);
  return { status: response.statusCode, body };
}

async function api(token: string, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: Record<string, unknown>) {
  const response = await app.inject({
    method, url,
    headers: { authorization: `Bearer ${token}` },
    ...(payload === undefined ? {} : { payload }),
  });
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : null };
}

beforeAll(async () => { app = await buildApp(); });
afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: made } } });
  await app.close();
  await prisma.$disconnect();
});

describe('the privacy gate', () => {
  it('publishes the notice without needing an account', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/auth/privacy' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.version).toBe(PRIVACY_VERSION);
    // the parts a notice is legally useless without
    for (const heading of ['What is collected', 'Your rights', 'How long it is kept', 'Who else sees it']) {
      expect(body.markdown).toContain(heading);
    }
    expect(body.markdown.length).toBeGreaterThan(4000);
  });

  it('refuses to create an account without agreement', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: `nogate-${stamp}@example.test`, password: 'testpassword' },
    });
    expect(response.statusCode).toBe(400);
    expect(await prisma.user.findUnique({ where: { email: `nogate-${stamp}@example.test` } })).toBeNull();
  });

  it('refuses agreement to a version that is not the current one', async () => {
    const result = await register('stale', { acceptPrivacyVersion: '1999-01-01' });
    expect(result.status).toBe(409);
    expect(result.body.currentVersion).toBe(PRIVACY_VERSION);
  });

  it('records when and to what the person agreed', async () => {
    const created = await register('consent');
    expect(created.status).toBe(201);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: created.body.user.id } });
    expect(row.privacyVersion).toBe(PRIVACY_VERSION);
    expect(row.privacyAcceptedAt).toBeInstanceOf(Date);
  });

  it('a revised notice withdraws the old agreement', async () => {
    const created = await register('revised');
    await prisma.user.update({
      where: { id: created.body.user.id },
      data: { privacyVersion: 'an-older-version' },
    });

    const me = await api(created.body.token, 'GET', '/api/auth/me');
    expect(me.body.user.privacyCurrent).toBe(false);

    const accepted = await api(created.body.token, 'POST', '/api/auth/privacy/accept', {
      version: PRIVACY_VERSION,
    });
    expect(accepted.status).toBe(200);
    expect((await api(created.body.token, 'GET', '/api/auth/me')).body.user.privacyCurrent).toBe(true);
  });
});

describe('the calorie estimate', () => {
  it('matches Mifflin-St Jeor by hand', () => {
    // 30-year-old, 180cm, 80kg, male: 10(80) + 6.25(180) - 5(30) + 5 = 1780
    expect(basalRate(180, 80, 30, 'male')).toBeCloseTo(1780, 5);
    // same, female: ... - 161 = 1614
    expect(basalRate(180, 80, 30, 'female')).toBeCloseTo(1614, 5);
  });

  it('refuses to estimate from missing or absurd data', () => {
    expect(canEstimate({})).toBe(false);
    expect(canEstimate({ heightCm: 180, weightKg: 80 })).toBe(false);
    expect(canEstimate({ heightCm: 40, weightKg: 80, birthYear: 1996 })).toBe(false);
    expect(estimateEnergy({ heightCm: 180, weightKg: 80 })).toBeNull();
  });

  it('puts a deficit below maintenance and a surplus above it', () => {
    const base = { heightCm: 180, weightKg: 80, birthYear: 1996, sex: 'male', activityLevel: 'moderate' };
    const maintain = estimateEnergy({ ...base, weightGoal: 'maintain' })!;
    const lose = estimateEnergy({ ...base, weightGoal: 'lose' })!;
    const gain = estimateEnergy({ ...base, weightGoal: 'gain' })!;

    expect(lose.target).toBeLessThan(maintain.target);
    expect(gain.target).toBeGreaterThan(maintain.target);
    expect(maintain.target).toBe(maintain.tdee);
    // half a kilo a week is the default, and it is what the numbers imply
    expect(lose.weeklyRateKg).toBeCloseTo(0.5, 1);
  });

  it('never recommends eating below the floor', () => {
    // small, older, sedentary, asking to lose fast: arithmetic goes very low
    const result = estimateEnergy({
      heightCm: 150, weightKg: 45, birthYear: 1950,
      sex: 'female', activityLevel: 'sedentary',
      weightGoal: 'lose', weeklyRateKg: 1,
    })!;
    expect(result.target).toBeGreaterThanOrEqual(FLOOR_KCAL.female);
    expect(result.flooredAt).toBe(FLOOR_KCAL.female);
    expect(result.notes.join(' ')).toContain('medical supervision');
  });

  it('caps an unsafe rate rather than obeying it', () => {
    const result = estimateEnergy({
      heightCm: 185, weightKg: 110, birthYear: 1990,
      sex: 'male', activityLevel: 'active',
      weightGoal: 'lose', weeklyRateKg: 3,
    })!;
    expect(result.weeklyRateKg).toBeLessThanOrEqual(1);
    expect(result.notes.join(' ')).toContain('Capped');
  });

  it('macros roughly account for the calories', () => {
    const result = estimateEnergy({
      heightCm: 175, weightKg: 70, birthYear: 1994,
      sex: 'female', activityLevel: 'light', weightGoal: 'maintain',
    })!;
    const fromMacros = result.protein * 4 + result.carbs * 4 + result.fat * 9;
    expect(Math.abs(fromMacros - result.target)).toBeLessThan(60);
    expect(result.protein).toBeGreaterThan(70);
  });
});

describe('onboarding', () => {
  it('saves the answers and adopts the calculated target', async () => {
    const created = await register('onboard');
    const token = created.body.token;
    expect((await api(token, 'GET', '/api/auth/me')).body.user.onboarded).toBe(false);

    const done = await api(token, 'POST', '/api/auth/onboarding', {
      heightCm: 178, weightKg: 82, birthYear: 1995,
      sex: 'male', activityLevel: 'moderate', weightGoal: 'lose',
    });
    expect(done.status).toBe(200);
    expect(done.body.energy.target).toBeGreaterThan(1500);
    expect(done.body.targets.calories).toBe(done.body.energy.target);
    expect(done.body.targets.protein).toBe(done.body.energy.protein);

    const me = await api(token, 'GET', '/api/auth/me');
    expect(me.body.user.onboarded).toBe(true);
    expect(me.body.energy.target).toBe(done.body.energy.target);
  });

  it('lets someone skip entirely and still use the app', async () => {
    const created = await register('skipper');
    const token = created.body.token;
    const done = await api(token, 'POST', '/api/auth/onboarding', { skipped: true });

    expect(done.status).toBe(200);
    expect(done.body.energy).toBeNull();
    // the plain default stands rather than a number computed from nothing
    expect(done.body.targets.calories).toBe(2000);
    expect((await api(token, 'GET', '/api/auth/me')).body.user.onboarded).toBe(true);
  });

  it('previews an estimate without saving it', async () => {
    const created = await register('preview');
    const token = created.body.token;
    const preview = await api(token, 'POST', '/api/auth/energy/preview', {
      heightCm: 170, weightKg: 65, birthYear: 2000,
      sex: 'female', activityLevel: 'active', weightGoal: 'maintain',
    });
    expect(preview.body.energy.target).toBeGreaterThan(0);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: created.body.user.id } });
    expect(row.heightCm).toBeNull();
    expect(row.onboardedAt).toBeNull();
  });
});

describe('deleting an account', () => {
  it('needs the password, and then really removes everything', async () => {
    const created = await register('deleteme');
    const token = created.body.token;
    const userId = created.body.user.id;

    const egg = await prisma.foodReference.findFirstOrThrow({ where: { name: 'Egg' } });
    await api(token, 'POST', '/api/inventory', { foodReferenceId: egg.id, quantity: 6, unit: 'count' });
    expect(await prisma.inventoryItem.count({ where: { userId } })).toBeGreaterThan(0);

    const wrong = await api(token, 'POST', '/api/auth/delete-account', { password: 'not-it' });
    expect(wrong.status).toBe(401);
    expect(await prisma.user.findUnique({ where: { id: userId } })).not.toBeNull();

    const done = await api(token, 'POST', '/api/auth/delete-account', { password: 'testpassword' });
    expect(done.status).toBe(200);

    // the notice promises a real deletion, not a flag
    expect(await prisma.user.findUnique({ where: { id: userId } })).toBeNull();
    expect(await prisma.inventoryItem.count({ where: { userId } })).toBe(0);
    expect(await prisma.consumptionLog.count({ where: { userId } })).toBe(0);
  });
});

describe('body data stays on file and keeps the target current', () => {
  /** An account that has completed onboarding, ready to be changed afterwards. */
  async function settled(label: string) {
    const created = await register(label);
    const token = created.body.token;
    await api(token, 'POST', '/api/auth/onboarding', {
      heightCm: 178, weightKg: 82, birthYear: 1995,
      sex: 'male', activityLevel: 'moderate', weightGoal: 'maintain',
    });
    return { token, id: created.body.user.id };
  }

  it('gives the body data back so it can be corrected', async () => {
    const { token } = await settled('bodyread');
    const settings = await api(token, 'GET', '/api/settings');

    expect(settings.body.settings.body).toMatchObject({
      heightCm: 178, weightKg: 82, birthYear: 1995,
      sex: 'male', activityLevel: 'moderate',
    });
    expect(settings.body.settings.energy.target).toBeGreaterThan(0);
  });

  it('recalculates from the body when the goal changes, not from a flat baseline', async () => {
    const { token } = await settled('goalchange');
    const before = (await api(token, 'GET', '/api/settings')).body.settings.dailyCalorieTarget;

    const changed = await api(token, 'PATCH', '/api/settings', { weightGoal: 'lose' });
    const after = changed.body.settings.dailyCalorieTarget;

    expect(after).toBeLessThan(before);
    expect(changed.body.settings.recalculated).toBe(true);
    // the regression this guards: 1700 is the no-data fallback, and an account
    // that told us its height and weight should never be handed it
    expect(after).not.toBe(1700);
    expect(after).toBe(changed.body.settings.energy.target);
  });

  it('follows a weight that moved', async () => {
    const { token } = await settled('weightdrift');
    const before = (await api(token, 'GET', '/api/settings')).body.settings.dailyCalorieTarget;

    const lighter = await api(token, 'PATCH', '/api/settings', { weightKg: 74 });
    expect(lighter.body.settings.body.weightKg).toBe(74);
    expect(lighter.body.settings.dailyCalorieTarget).toBeLessThan(before);

    const heavier = await api(token, 'PATCH', '/api/settings', { weightKg: 90 });
    expect(heavier.body.settings.dailyCalorieTarget).toBeGreaterThan(before);
  });

  it('follows a change in activity', async () => {
    const { token } = await settled('activity');
    const before = (await api(token, 'GET', '/api/settings')).body.settings.dailyCalorieTarget;

    const less = await api(token, 'PATCH', '/api/settings', { activityLevel: 'sedentary' });
    expect(less.body.settings.dailyCalorieTarget).toBeLessThan(before);

    const more = await api(token, 'PATCH', '/api/settings', { activityLevel: 'very_active' });
    expect(more.body.settings.dailyCalorieTarget).toBeGreaterThan(before);
  });

  it('macros move with the target, not just the calories', async () => {
    const { token } = await settled('macros');
    const before = (await api(token, 'GET', '/api/settings')).body.settings;

    const after = (await api(token, 'PATCH', '/api/settings', { weightKg: 100 })).body.settings;
    expect(after.proteinTargetGrams).toBeGreaterThan(before.proteinTargetGrams);
  });

  it('a number typed by hand beats the formula', async () => {
    const { token } = await settled('manual');
    const set = await api(token, 'PATCH', '/api/settings', {
      weightGoal: 'lose',
      dailyCalorieTarget: 1850,
    });

    // saying both means the explicit number wins for this request
    expect(set.body.settings.dailyCalorieTarget).toBe(1850);
    expect(set.body.settings.recalculated).toBe(false);
    // and the body is untouched, so a later change still computes correctly
    expect(set.body.settings.body.weightKg).toBe(82);
  });

  it('leaves the target alone when nothing relevant changed', async () => {
    const { token } = await settled('unrelated');
    const before = (await api(token, 'GET', '/api/settings')).body.settings.dailyCalorieTarget;

    const after = await api(token, 'PATCH', '/api/settings', { adsEnabled: false });
    expect(after.body.settings.dailyCalorieTarget).toBe(before);
    expect(after.body.settings.recalculated).toBe(false);
  });

  it('still falls back to the flat baseline for an account with no body data', async () => {
    const created = await register('nobody');
    await api(created.body.token, 'POST', '/api/auth/onboarding', { skipped: true });

    const changed = await api(created.body.token, 'PATCH', '/api/settings', { weightGoal: 'lose' });
    expect(changed.body.settings.energy).toBeNull();
    expect(changed.body.settings.dailyCalorieTarget).toBe(1700);
  });
});
