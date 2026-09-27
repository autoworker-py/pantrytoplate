/**
 * Snap a meal: three free photos, then Plus, unlocked by a code while payments
 * are off. With no AI key the test server reads a sample plate.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { PRIVACY_VERSION } from '../src/content/privacy.js';

let app: FastifyInstance;
let auth: { authorization: string };
const photo = { image: 'x'.repeat(400), mediaType: 'image/jpeg' };

beforeAll(async () => {
  app = await buildApp();
  const registered = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: `snap-${Date.now()}@example.test`, password: 'testpassword', acceptPrivacyVersion: PRIVACY_VERSION },
  });
  auth = { authorization: `Bearer ${JSON.parse(registered.body).token}` };
});

afterAll(async () => {
  await app.close();
});

const snap = () => app.inject({ method: 'POST', url: '/api/snap', headers: auth, payload: photo });

describe('snap a meal', () => {
  it('starts with the free photos', async () => {
    const status = JSON.parse((await app.inject({ method: 'GET', url: '/api/snap/status', headers: auth })).body);
    expect(status).toMatchObject({ plus: false, freeLeft: 3, freeTotal: 3, available: true });
  });

  it('reads a plate into foods with portions, calories and macros', async () => {
    const response = await snap();
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items[0]).toMatchObject({ name: expect.any(String), portion: expect.any(String), calories: expect.any(Number) });
    expect(body.items[0].at).toHaveLength(2);
    expect(body.freeLeft).toBe(2);
  });

  it('asks for Plus once the free photos are used', async () => {
    await snap();
    await snap();
    const response = await snap();
    expect(response.statusCode).toBe(402);
    expect(JSON.parse(response.body).error).toBe('plus_required');
  });

  it('turns a wrong code away and unlocks Plus with a right one', async () => {
    const wrong = await app.inject({ method: 'POST', url: '/api/snap/redeem', headers: auth, payload: { code: 'NOPE-NOPE' } });
    expect(wrong.statusCode).toBe(400);
    const right = await app.inject({ method: 'POST', url: '/api/snap/redeem', headers: auth, payload: { code: 'test plus code' } });
    expect(JSON.parse(right.body)).toMatchObject({ plus: true, freeLeft: null });
    expect((await snap()).statusCode).toBe(200);
  });
});
