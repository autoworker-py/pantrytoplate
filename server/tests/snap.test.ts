/**
 * Snap a meal: three free photos, then Plus, unlocked by a code while payments
 * are off. With no AI key the test server reads a sample plate.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { PRIVACY_VERSION } from '../src/content/privacy.js';
import { photoSize, tidy } from '../src/services/snap.js';

/** The start of a real JPEG, enough for its size to be read. */
function jpeg(width: number, height: number): string {
  const header = Buffer.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
  ]);
  return Buffer.concat([header, Buffer.alloc(300)]).toString('base64');
}

function png(width: number, height: number): string {
  const bytes = Buffer.alloc(300);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes.toString('base64');
}

let app: FastifyInstance;
let auth: { authorization: string };
const photo = { image: jpeg(768, 768), mediaType: 'image/jpeg' };

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

  it('only reads photos of exactly 768 by 768, and a refused one is not a free photo', async () => {
    for (const image of [jpeg(1280, 960), jpeg(768, 767), png(1024, 1024), 'x'.repeat(400)]) {
      const response = await app.inject({ method: 'POST', url: '/api/snap', headers: auth, payload: { image, mediaType: 'image/jpeg' } });
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toBe('photo_size');
    }
    const status = JSON.parse((await app.inject({ method: 'GET', url: '/api/snap/status', headers: auth })).body);
    expect(status.freeLeft).toBe(3);
  });

  it('reads a plate into foods with portions, calories and macros', async () => {
    const response = await snap();
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items[0]).toMatchObject({ name: expect.any(String), portion: expect.any(String), calories: expect.any(Number) });
    expect(body.items[0]).not.toHaveProperty('at');
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

describe('the photo and the reply', () => {
  it('reads a photo size from the header alone', () => {
    expect(photoSize(jpeg(768, 768))).toEqual({ width: 768, height: 768 });
    expect(photoSize(jpeg(1280, 960))).toEqual({ width: 1280, height: 960 });
    expect(photoSize(png(768, 768))).toEqual({ width: 768, height: 768 });
    expect(photoSize('x'.repeat(400))).toBeNull();
  });

  it('turns the compact reply into the items the app shows', () => {
    const items = tidy([
      { n: 'white rice', g: 158, k: 205, p: 4, c: 45, f: 0 },
      { n: 'butter', g: 10, k: 72, p: 0, c: 0, f: 8, e: true },
      { n: '', g: 10, k: 10 },
      'not an item',
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({ id: 'i0', name: 'White rice', grams: 158, portion: 'About 158 g', calories: 205, protein: 4, carbs: 45, fat: 0 });
    expect(items[1]).toMatchObject({ name: 'Butter', note: expect.stringContaining('Not visible') });
  });
});
