/**
 * A scanned product's pack size is the product database's. Adding half a pack
 * once must never make "full pack" mean half a pack afterwards.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { PRIVACY_VERSION } from '../src/content/privacy.js';

let app: FastifyInstance;
let auth: { authorization: string };
let milkId: string;
const barcode = `99${Date.now()}`.slice(0, 13);

beforeAll(async () => {
  app = await buildApp();
  const registered = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: `pack-${Date.now()}@example.test`, password: 'testpassword', acceptPrivacyVersion: PRIVACY_VERSION },
  });
  auth = { authorization: `Bearer ${JSON.parse(registered.body).token}` };
  // a gallon of milk whose pack size was overwritten with half a gallon by the old app
  const milk = await prisma.foodReference.create({
    data: { name: 'Test Whole Milk Gallon', nameNorm: 'test whole milk gallon', barcode, source: 'openfoodfacts', externalId: barcode, category: 'Beverages', defaultUnit: 'g', packageGramsScanned: 3785 },
  });
  milkId = milk.id;
  await prisma.unitConversion.create({ data: { foodReferenceId: milk.id, fromUnit: 'package', toUnit: 'g', multiplier: 1893 } });
});

afterAll(async () => {
  await prisma.foodReference.delete({ where: { id: milkId } }).catch(() => undefined);
  await app.close();
});

describe('the scanner knows what a full pack is', () => {
  it('offers the scanned pack size, not a portion saved since', async () => {
    const scanned = JSON.parse((await app.inject({ method: 'GET', url: `/api/foods/barcode/${barcode}`, headers: auth })).body);
    expect(scanned.packageGrams).toBe(3785);
    const pack = JSON.parse((await app.inject({ method: 'GET', url: `/api/foods/${milkId}/pack`, headers: auth })).body);
    expect(pack.grams).toBe(3785);
  });

  it('keeps the scanned size when something tries to change it', async () => {
    const response = await app.inject({ method: 'POST', url: `/api/foods/${milkId}/conversions`, headers: auth, payload: { fromUnit: 'package', toUnit: 'g', multiplier: 1000 } });
    expect(JSON.parse(response.body).kept).toBe('scanned');
    const pack = JSON.parse((await app.inject({ method: 'GET', url: `/api/foods/${milkId}/pack`, headers: auth })).body);
    expect(pack.grams).toBe(3785);
  });
});

describe('a pack size in any unit', () => {
  let juiceId: string;
  beforeAll(async () => {
    const juice = await prisma.foodReference.create({ data: { name: 'Test Pack Juice', nameNorm: 'test pack juice', source: 'manual', category: 'Beverages', defaultUnit: 'g' } });
    juiceId = juice.id;
  });
  afterAll(async () => {
    await prisma.foodReference.delete({ where: { id: juiceId } }).catch(() => undefined);
  });

  it('keeps a pack taught in fluid ounces as fluid ounces', async () => {
    await app.inject({ method: 'POST', url: `/api/foods/${juiceId}/conversions`, headers: auth, payload: { fromUnit: 'package', toUnit: 'floz', multiplier: 52 } });
    const pack = JSON.parse((await app.inject({ method: 'GET', url: `/api/foods/${juiceId}/pack`, headers: auth })).body);
    expect(pack).toMatchObject({ amount: 52, unit: 'floz', known: true });
  });

  it('lets a new pack size replace the old one, whatever its unit', async () => {
    await app.inject({ method: 'POST', url: `/api/foods/${juiceId}/conversions`, headers: auth, payload: { fromUnit: 'package', toUnit: 'ml', multiplier: 1500 } });
    const pack = JSON.parse((await app.inject({ method: 'GET', url: `/api/foods/${juiceId}/pack`, headers: auth })).body);
    expect(pack).toMatchObject({ amount: 1500, unit: 'ml' });
    expect(await prisma.unitConversion.count({ where: { foodReferenceId: juiceId, fromUnit: 'package' } })).toBe(1);
  });
});
