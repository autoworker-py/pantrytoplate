/**
 * What a stranger with an account can and cannot do.
 *
 * Every id-taking route is tried by a second account against the first
 * account's things, and must answer as if they do not exist. The shared
 * catalogue must not be rewritable by anyone, sign-in must not leak who has
 * an account or let a stolen session outlive a password change, and recipe
 * import must not reach the server's own network.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { PRIVACY_VERSION } from '../src/content/privacy.js';
import { DUMMY_HASH, deleteAccount } from '../src/services/auth.js';
import { enforceLimits } from '../src/limits.js';
import { BlockedAddressError, fetchPublicPage, isPrivateAddress } from '../src/external/safeFetch.js';
import { refuseLeaked, timesLeaked } from '../src/services/leakedPasswords.js';

let app: FastifyInstance;
const stamp = Date.now();
type Who = { token: string; id: string; email: string };

async function register(label: string): Promise<Who> {
  const email = `${label}-${stamp}@example.test`;
  const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email, password: 'testpassword', acceptPrivacyVersion: PRIVACY_VERSION } });
  const body = JSON.parse(response.body);
  return { token: body.token, id: body.user.id, email };
}

async function api(who: { token: string }, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: Record<string, unknown>) {
  const response = await app.inject({ method, url, headers: { authorization: `Bearer ${who.token}` }, ...(payload === undefined ? {} : { payload }) });
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : null };
}

const catalogue = async (name: string) => prisma.foodReference.findFirstOrThrow({ where: { name, ownerId: null, barcode: null } });

let owner: Who;
let stranger: Who;
const mine: Record<string, string> = {};

beforeAll(async () => {
  app = await buildApp();
  owner = await register('owner');
  stranger = await register('stranger');

  const milk = await catalogue('Whole Milk');
  mine.item = (await api(owner, 'POST', '/api/inventory', { foodReferenceId: milk.id, quantity: 1, unit: 'gallon', storageLocation: 'fridge' })).body.item.id;
  mine.entry = (await api(owner, 'POST', '/api/consumption/eat-out', { name: 'Owner lunch', calories: 500, mealSlot: 'lunch' })).body.entry.id;
  mine.shopping = (await api(owner, 'POST', '/api/shopping-list', { name: 'Owner eggs' })).body.item.id;
  mine.food = (await api(owner, 'POST', '/api/foods', { name: `Owner secret stew ${stamp}`, defaultUnit: 'serving', caloriesPerUnit: 300 })).body.food.id;
  const taught = await api(owner, 'POST', `/api/foods/barcode/99${String(stamp).slice(-10)}`, { name: 'Owner Taught Bar', caloriesPerUnit: 4 });
  mine.product = taught.body.food.id;
  mine.barcode = taught.body.food.barcode;
});

afterAll(async () => {
  // the way the app deletes an account: these people own the meals they ate out
  for (const user of await prisma.user.findMany({ where: { email: { contains: `-${stamp}@example.test` } }, select: { id: true } })) await deleteAccount(user.id);
  await prisma.foodReference.deleteMany({ where: { barcode: mine.barcode } });
  await app.close();
});

describe('one account cannot reach another’s things', () => {
  it('cannot read, change, eat, bin, freeze or delete their pantry items', async () => {
    for (const [method, path, payload] of [
      ['GET', '', undefined],
      ['PATCH', '', { quantity: 0 }],
      ['POST', '/consume', { quantity: 1 }],
      ['POST', '/remove', { reason: 'wasted' }],
      ['POST', '/freeze', {}],
      ['DELETE', '', undefined],
    ] as const) {
      const response = await api(stranger, method, `/api/inventory/${mine.item}${path}`, payload);
      expect([403, 404], `${method} ${path}`).toContain(response.status);
    }
    const still = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: mine.item } });
    expect(still.quantity).toBe(1);
    expect(still.storageLocation).toBe('fridge');
  });

  it('cannot open, split or undo their diary entries', async () => {
    expect((await api(stranger, 'GET', `/api/consumption/${mine.entry}`)).status).toBe(404);
    expect([403, 404]).toContain((await api(stranger, 'POST', `/api/consumption/${mine.entry}/save-rest`, { ate: 0.5 })).status);
    expect([403, 404]).toContain((await api(stranger, 'DELETE', `/api/consumption/${mine.entry}`)).status);
    expect(await prisma.consumptionLog.findUnique({ where: { id: mine.entry } })).not.toBeNull();
  });

  it('cannot tick, stock, look into or delete their shopping list', async () => {
    expect([403, 404]).toContain((await api(stranger, 'PATCH', `/api/shopping-list/${mine.shopping}`, { isChecked: true })).status);
    expect([403, 404]).toContain((await api(stranger, 'POST', `/api/shopping-list/${mine.shopping}/stock`, {})).status);
    expect([403, 404]).toContain((await api(stranger, 'GET', `/api/shopping-list/${mine.shopping}/uses`)).status);
    expect([403, 404]).toContain((await api(stranger, 'DELETE', `/api/shopping-list/${mine.shopping}`)).status);
    const still = await prisma.shoppingListItem.findUniqueOrThrow({ where: { id: mine.shopping } });
    expect(still.isChecked).toBe(false);
  });

  it('cannot see or change a food they typed in', async () => {
    expect((await api(stranger, 'GET', `/api/foods/${mine.food}`)).status).toBe(404);
    expect((await api(stranger, 'GET', `/api/foods/${mine.food}/pack`)).status).toBe(404);
    expect((await api(stranger, 'PUT', `/api/foods/${mine.food}/counts-as`, { canonicalId: null })).status).toBe(404);
    expect((await api(stranger, 'POST', `/api/foods/${mine.food}/conversions`, { fromUnit: 'serving', toUnit: 'g', multiplier: 999 })).status).toBe(404);
  });

  it('cannot rewrite a product someone else described, though they can still scan it', async () => {
    const hijack = await api(stranger, 'POST', `/api/foods/barcode/${mine.barcode}`, { name: 'Hijacked', caloriesPerUnit: 0 });
    expect(hijack.status).toBe(409);
    const product = await prisma.foodReference.findUniqueOrThrow({ where: { id: mine.product } });
    expect(product.name).toBe('Owner Taught Bar');
    expect(product.caloriesPerUnit).toBe(4);
    expect((await api(stranger, 'GET', `/api/foods/barcode/${mine.barcode}`)).body.food.name).toBe('Owner Taught Bar');
    // its author can still correct their own description
    expect((await api(owner, 'POST', `/api/foods/barcode/${mine.barcode}`, { name: 'Owner Taught Bar', caloriesPerUnit: 4.2 })).status).toBe(200);
  });
});

describe('the shared catalogue is nobody’s to rewrite', () => {
  it('will not relink a catalogue food or change how it converts', async () => {
    const milk = await catalogue('Whole Milk');
    const flour = await catalogue('All-Purpose Flour');
    expect((await api(stranger, 'PUT', `/api/foods/${milk.id}/counts-as`, { canonicalId: flour.id })).status).toBe(403);
    expect((await api(stranger, 'POST', `/api/foods/${flour.id}/conversions`, { fromUnit: 'cup', toUnit: 'g', multiplier: 99999 })).status).toBe(403);
    expect((await prisma.foodReference.findUniqueOrThrow({ where: { id: milk.id } })).canonicalId).toBeNull();
  });

  it('keeps one person’s pack size theirs', async () => {
    const rice = await catalogue('White Rice');
    const before = (await api(owner, 'GET', `/api/foods/${rice.id}/pack`)).body;
    expect((await api(stranger, 'POST', `/api/foods/${rice.id}/conversions`, { fromUnit: 'package', toUnit: 'g', multiplier: 5000 })).status).toBe(201);
    expect((await api(stranger, 'GET', `/api/foods/${rice.id}/pack`)).body).toMatchObject({ amount: 5000, unit: 'g', known: true });
    expect((await api(owner, 'GET', `/api/foods/${rice.id}/pack`)).body).toMatchObject({ amount: before.amount, unit: before.unit });
  });
});

describe('signing in', () => {
  it('takes as long to refuse an unknown email as a wrong password', () => {
    // a malformed stand-in is refused instantly, which is exactly the tell
    expect(bcrypt.getRounds(DUMMY_HASH)).toBe(10);
  });

  it('ends every other session when the password changes', async () => {
    const someone = await register('changer');
    const lostPhone = someone.token;
    await new Promise((resolve) => setTimeout(resolve, 1100)); // tokens carry seconds
    const changed = await api(someone, 'POST', '/api/auth/password', { currentPassword: 'testpassword', newPassword: 'a-new-password' });
    expect(changed.status).toBe(200);
    expect((await api({ token: lostPhone }, 'GET', '/api/auth/me')).status).toBe(401);
    expect((await api({ token: changed.body.token }, 'GET', '/api/auth/me')).status).toBe(200);
  });

  it('refuses a deleted account’s token cleanly', async () => {
    const leaving = await register('leaving');
    expect((await api(leaving, 'POST', '/api/auth/delete-account', { password: 'testpassword' })).status).toBe(200);
    expect((await api(leaving, 'GET', '/api/inventory')).status).toBe(401);
  });

  it('slows down someone guessing a password', async () => {
    enforceLimits(true);
    try {
      const tries = [];
      for (let i = 0; i < 11; i++) {
        tries.push((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: owner.email, password: `wrong-guess-${i}` } })).statusCode);
      }
      expect(tries.slice(0, 10).every((status) => status === 401)).toBe(true);
      expect(tries[10]).toBe(429);
    } finally {
      enforceLimits(false);
    }
  });
});

describe('recipe import stays on the public internet', () => {
  it('knows a private address when it sees one', () => {
    for (const address of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '100.64.0.1']) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
    for (const address of ['93.184.216.34', '8.8.8.8', '2606:4700:4700::1111']) expect(isPrivateAddress(address), address).toBe(false);
  });

  it('will not fetch the server’s own machine or network', async () => {
    for (const url of ['http://127.0.0.1/', 'http://169.254.169.254/latest/meta-data/', 'http://[::1]/', 'http://localhost/', 'http://printer.local/', 'https://example.com:8443/', 'http://user:pass@example.com/', 'file:///etc/passwd']) {
      await expect(fetchPublicPage(url, { timeoutMs: 2000, maxBytes: 1000, headers: {} }), url).rejects.toBeInstanceOf(BlockedAddressError);
    }
  });
});

describe('passwords already leaked elsewhere', () => {
  // the hashes Pwned Passwords would return for the prefix of "password123", one of them its own
  const leakedRange = async (prefix: string) => {
    expect(prefix).toBe('CBFDA'); // only five characters of the hash ever leave
    return ['0018A45C4D1DEF81644B54AB7F969B88D65:1', 'C6D2AF1E4BE9D97EB2A1A4E9F5E27D0E6F3:0', 'C7F1E0D6E2A43A2C66BB2D5B4F8E35C5B5A:2', '25F7C1F6BEAC0C5A2CD94E8D0D8C1E2F7A0:7'].join('\r\n');
  };

  it('knows a leaked password from its hash prefix alone', async () => {
    const { createHash } = await import('node:crypto');
    const hash = createHash('sha1').update('password123').digest('hex').toUpperCase();
    const range = async (prefix: string) => `${(await leakedRange(prefix)).replace('25F7C1F6BEAC0C5A2CD94E8D0D8C1E2F7A0', hash.slice(5))}`;
    expect(await timesLeaked('password123', range)).toBe(7);
    await expect(refuseLeaked('password123', range)).rejects.toMatchObject({ code: 'password_leaked' });
  });

  it('lets a password through when the list cannot be reached', async () => {
    expect(await timesLeaked('anything-at-all', async () => { throw new Error('offline'); })).toBe(0);
  });
});
