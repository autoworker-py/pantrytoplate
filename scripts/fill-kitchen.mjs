#!/usr/bin/env node
/**
 * Fill an account's pantry with a typical kitchen, for testing.
 *
 *   npm run fill-kitchen -- --email you@example.com     the live server; asks for the password
 *   npm run fill-kitchen -- --local                     the local server's tester account
 *
 * It empties the account's pantry first (it asks, unless --yes), then puts
 * away about sixty everyday things across the fridge, cupboard and freezer:
 * everything a household keeps, with a few due in the next couple of days so
 * "use it up" has something to say. Every item is a food from the shipped
 * catalogue, so nothing new is added to anyone's search.
 *
 * The local tester account (below) exists only on a development database and
 * is created here if it is missing. On the live server, sign up in the app
 * first: this script never creates accounts there.
 */
import readline from 'node:readline';

const LIVE = 'https://pantry-to-plate-h55k.onrender.com';
const LOCAL = 'http://localhost:4000';
/** development only, like the seeded demo account */
const LOCAL_TESTER = { email: 'tester@pantry.local', password: 'pantrytester' };

// [catalogue name, quantity, unit, where, days until it goes off (omit to let the server estimate)]
const KITCHEN = [
  // fridge
  ['Whole Milk', 1, 'gallon', 'fridge', 4],
  ['Egg', 12, 'count', 'fridge'],
  ['Unsalted Butter', 4, 'stick', 'fridge'],
  ['Cheddar Cheese', 8, 'oz', 'fridge'],
  ['Cream Cheese', 8, 'oz', 'fridge'],
  ['Plain Greek Yogurt', 32, 'oz', 'fridge'],
  ['Chicken Breast', 3, 'count', 'fridge', 2],
  ['Ground Beef 85/15', 1, 'lb', 'fridge', 1],
  ['Streaky Bacon', 12, 'oz', 'fridge'],
  ['Sliced Ham', 8, 'oz', 'fridge'],
  ['Baby Spinach', 1, 'bag', 'fridge', 1],
  ['Romaine Lettuce', 1, 'head', 'fridge'],
  ['Carrot', 6, 'count', 'fridge'],
  ['Celery Stalk', 8, 'count', 'fridge'],
  ['Red Bell Pepper', 2, 'count', 'fridge'],
  ['Cucumber', 1, 'count', 'fridge'],
  ['Strawberries', 1, 'punnet', 'fridge', 2],
  ['Lemon', 2, 'count', 'fridge'],
  ['Orange Juice', 1.5, 'l', 'fridge'],
  ['Mayonnaise', 15, 'oz', 'fridge'],
  ['Tomato Ketchup', 20, 'oz', 'fridge'],
  ['Dijon Mustard', 8, 'oz', 'fridge'],
  // cupboard
  ['All-Purpose Flour', 5, 'lb', 'pantry'],
  ['Granulated Sugar', 4, 'lb', 'pantry'],
  ['Brown Sugar', 2, 'lb', 'pantry'],
  ['Table Salt', 26, 'oz', 'pantry'],
  ['Black Pepper', 2, 'oz', 'pantry'],
  ['Ground Cinnamon', 2, 'oz', 'pantry'],
  ['Baking Powder', 8, 'oz', 'pantry'],
  ['Vanilla Extract', 2, 'floz', 'pantry'],
  ['Olive Oil', 500, 'ml', 'pantry'],
  ['Vegetable Oil', 1, 'l', 'pantry'],
  ['Soy Sauce', 10, 'floz', 'pantry'],
  ['Honey', 12, 'oz', 'pantry'],
  ['Peanut Butter', 1, 'jar', 'pantry'],
  ['White Rice', 2, 'lb', 'pantry'],
  ['Spaghetti', 1, 'box', 'pantry'],
  ['Penne', 1, 'box', 'pantry'],
  ['Rolled Oats', 2, 'lb', 'pantry'],
  ['Black Beans', 2, 'can', 'pantry'],
  ['Chopped Tomatoes', 2, 'can', 'pantry'],
  ['Tinned Tuna', 3, 'can', 'pantry'],
  ['Chicken Stock', 1, 'l', 'pantry'],
  ['Ground Coffee', 12, 'oz', 'pantry'],
  ['White Bread', 1, 'loaf', 'pantry', 4],
  ['Yellow Onion', 3, 'count', 'pantry'],
  ['Garlic Clove', 1, 'head', 'pantry'],
  ['Russet Potato', 5, 'count', 'pantry'],
  ['Banana', 6, 'count', 'pantry', 3],
  ['Apple', 6, 'count', 'pantry'],
  // freezer
  ['Garden Peas', 1, 'bag', 'freezer'],
  ['Frozen Mixed Vegetables', 16, 'oz', 'freezer'],
  ['Frozen Mixed Berries', 1, 'bag', 'freezer'],
  ['Salmon Fillet', 4, 'fillet', 'freezer'],
  ['Hash Browns', 30, 'oz', 'freezer'],
  ['Sweet Potato Fries', 20, 'oz', 'freezer'],
  ['Frozen Pizza', 20, 'oz', 'freezer'],
  ['Ice Cream', 32, 'oz', 'freezer'],
];

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const local = flag('local');
const api = (option('api') ?? (local ? LOCAL : LIVE)).replace(/\/$/, '');
const isLocalHost = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(api);

function ask(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // the password is typed, never shown
      rl._writeToOutput = (text) => { if (text.includes(question)) process.stdout.write(question); };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

async function call(method, path, token, body) {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.error ?? data?.message ?? `${method} ${path} failed with ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

/** A local calendar day n days from now, sent as local noon like the app sends dates. */
function daysFromNow(n) {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12).toISOString();
}

async function signIn() {
  if (local) {
    try {
      return (await call('POST', '/api/auth/login', null, LOCAL_TESTER)).token;
    } catch (error) {
      if (error.status !== 401) throw error;
      if (!isLocalHost) throw new Error('The tester account is only ever created on a local server.');
      const { version } = await call('GET', '/api/auth/privacy');
      const { token } = await call('POST', '/api/auth/register', null, { ...LOCAL_TESTER, acceptPrivacyVersion: version });
      await call('POST', '/api/auth/onboarding', token, { skipped: true });
      console.log(`Created the local tester account (${LOCAL_TESTER.email}).`);
      return token;
    }
  }
  const email = option('email') ?? (await ask('Email: '));
  const password = await ask('Password: ', true);
  return (await call('POST', '/api/auth/login', null, { email, password })).token;
}

async function inBatches(items, size, work) {
  const results = [];
  for (let i = 0; i < items.length; i += size) results.push(...(await Promise.all(items.slice(i, i + size).map(work))));
  return results;
}

async function main() {
  console.log(`Filling a pantry on ${api}`);
  const token = await signIn();

  const { items: current } = await call('GET', '/api/inventory', token);
  if (current.length) {
    const sure = flag('yes') || local || /^y/i.test(await ask(`This account has ${current.length} things in its pantry. Remove them first? (y/N) `));
    if (!sure) {
      console.log('Left as it is. Nothing was changed.');
      return;
    }
    await inBatches(current, 6, (item) => call('DELETE', `/api/inventory/${item.id}`, token));
    console.log(`Removed ${current.length} old ${current.length === 1 ? 'item' : 'items'}.`);
  }

  // every item is a catalogue food, found by its exact name, so nothing new is created
  const missing = [];
  const counts = { fridge: 0, pantry: 0, freezer: 0 };
  await inBatches(KITCHEN, 4, async ([name, quantity, unit, where, days]) => {
    const { foods } = await call('GET', `/api/foods/search?q=${encodeURIComponent(name)}&limit=10`, token);
    const food = foods.find((f) => f.name.toLowerCase() === name.toLowerCase());
    if (!food) {
      missing.push(name);
      return;
    }
    await call('POST', '/api/inventory', token, {
      foodReferenceId: food.id,
      quantity,
      unit,
      storageLocation: where,
      ...(days !== undefined ? { expirationDate: daysFromNow(days) } : {}),
    });
    counts[where] += 1;
  });

  const total = counts.fridge + counts.pantry + counts.freezer;
  console.log(`Put ${total} things away: ${counts.fridge} in the fridge, ${counts.pantry} in the cupboard, ${counts.freezer} in the freezer.`);
  if (missing.length) console.log(`Not in this server's catalogue, so skipped: ${missing.join(', ')}.`);
}

main().catch((error) => {
  console.error(`Stopped: ${error.message}`);
  process.exit(1);
});
