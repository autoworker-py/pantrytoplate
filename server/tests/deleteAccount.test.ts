/**
 * Deleting an account takes everything with it, including foods the person
 * added themselves, even when their own pantry and recipes use those foods.
 * A product they taught by barcode is a description of a product, not of
 * them: it stays for everyone else who scanned it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { PRIVACY_VERSION } from '../src/content/privacy.js';

let app: FastifyInstance;
const stamp = Date.now();
type Who = { token: string; id: string };

async function register(label: string): Promise<Who> {
  const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: `${label}-${stamp}@example.test`, password: 'testpassword', acceptPrivacyVersion: PRIVACY_VERSION } });
  const body = JSON.parse(response.body);
  return { token: body.token, id: body.user.id };
}
async function call(who: Who, method: 'GET' | 'POST', url: string, payload?: unknown) {
  const response = await app.inject({ method, url, headers: { authorization: `Bearer ${who.token}` }, ...(payload === undefined ? {} : { payload: payload as object }) });
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : null };
}

beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: `-${stamp}@example.test` } } });
  await app.close();
});

describe('deleting an account', () => {
  it('works when the person’s own foods are in their pantry, recipes and diary', async () => {
    const leaving = await register('leaving');
    const staying = await register('staying');
    const stew = (await call(leaving, 'POST', '/api/foods', { name: `Nan's stew ${stamp}`, defaultUnit: 'serving', caloriesPerUnit: 300 })).body.food;
    await call(leaving, 'POST', '/api/inventory', { foodReferenceId: stew.id, quantity: 2, unit: 'serving', storageLocation: 'fridge' });
    await call(leaving, 'POST', '/api/recipes', { name: 'Stew on toast', instructions: '1. Heat the stew.', servings: 1, ingredients: [{ foodReferenceId: stew.id, quantityRequired: 1, unitRequired: 'serving' }, { name: `Grandad's relish ${stamp}`, quantityRequired: 1, unitRequired: 'tbsp' }] });
    await call(leaving, 'POST', '/api/shopping-list', { name: 'More stew', foodReferenceId: stew.id });
    // a product they taught by barcode, which someone else has since put in their pantry
    const barcode = `98${String(stamp).slice(-10)}`;
    const product = (await call(leaving, 'POST', `/api/foods/barcode/${barcode}`, { name: 'Taught Granola', caloriesPerUnit: 4 })).body.food;
    const theirs = (await call(staying, 'POST', '/api/inventory', { foodReferenceId: product.id, quantity: 1, unit: 'count', storageLocation: 'pantry' })).body.item;

    const deleted = await call(leaving, 'POST', '/api/auth/delete-account', { password: 'testpassword' });
    expect(deleted.status).toBe(200);
    expect(await prisma.user.findUnique({ where: { id: leaving.id } })).toBeNull();
    expect(await prisma.foodReference.findUnique({ where: { id: stew.id } })).toBeNull();
    expect(await prisma.foodReference.count({ where: { ownerId: leaving.id } })).toBe(0);
    // the other person's granola is still in their pantry, now a shared product
    expect(await prisma.inventoryItem.findUnique({ where: { id: theirs.id } })).not.toBeNull();
    expect((await prisma.foodReference.findUniqueOrThrow({ where: { id: product.id } })).ownerId).toBeNull();
    await prisma.foodReference.delete({ where: { id: product.id } }).catch(() => undefined);
  });
});
