/**
 * Generate the API contract by asking the running app, not by describing it.
 *
 * When the frontend and the backend are built by different people, the API is
 * the only thing they share — and a hand-written description of it drifts the
 * moment someone forgets to update it. Nobody notices until a screen renders
 * `undefined`.
 *
 * So this boots the real server, registers a real account, gives it a real
 * pantry, calls every safe endpoint, and writes down the shapes that actually
 * came back. It is regenerated, never edited:
 *
 *   npm run contract
 *
 * Anything it prints is true of the server as it stands today. If a shape here
 * is wrong, the server is wrong.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../dist/app.js';
import { PrismaClient } from '@prisma/client';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', '..', 'docs');
const prisma = new PrismaClient();

/** A JSON value's shape, as a TypeScript-ish string. */
function shapeOf(value, depth = 0, seen = 0) {
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'unknown[]';
    // one element stands for all of them; lists here are homogeneous
    return `${shapeOf(value[0], depth + 1)}[]`;
  }
  const type = typeof value;
  if (type !== 'object') return type;
  if (depth > 3) return '{ … }';

  const entries = Object.entries(value).map(([key, inner]) => {
    const safe = /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
    return `${'  '.repeat(depth + 1)}${safe}: ${shapeOf(inner, depth + 1)};`;
  });
  if (entries.length === 0) return '{}';
  return `{\n${entries.join('\n')}\n${'  '.repeat(depth)}}`;
}

const app = await buildApp();
await app.ready();

const stamp = Date.now();
const email = `contract-${stamp}@example.test`;
const registered = await app.inject({
  method: 'POST',
  url: '/api/auth/register',
  payload: { email, password: 'contractpassword' },
});
const { token, user } = JSON.parse(registered.body);
const auth = { authorization: `Bearer ${token}` };

// a pantry, so list endpoints return something with shape rather than []
const food = async (name) => (await prisma.foodReference.findFirstOrThrow({ where: { name } })).id;
const inDays = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

// Some of it about to go off, or the home screen's two most important arrays
// come back empty and get documented as `unknown[]`.
for (const [name, quantity, unit, expires] of [
  ['Egg', 12, 'count', 2],
  ['Unsalted Butter', 250, 'g', 1],
  ['Whole Milk', 2, 'l', 3],
  ['Table Salt', 500, 'g', null],
  ['Black Pepper', 50, 'g', null],
  ['Olive Oil', 500, 'ml', null],
]) {
  await app.inject({
    method: 'POST',
    url: '/api/inventory',
    headers: auth,
    payload: {
      foodReferenceId: await food(name),
      quantity,
      unit,
      ...(expires === null ? {} : { expirationDate: inDays(expires) }),
    },
  });
}
await app.inject({
  method: 'POST',
  url: '/api/shopping-list',
  headers: auth,
  payload: { name: 'Coffee beans', quantityNeeded: 1, unit: 'bag' },
});

// and something eaten, so the diary documents entries rather than an empty list
const eggLot = await prisma.inventoryItem.findFirst({
  where: { userId: user.id, foodReferenceId: await food('Egg') },
});
if (eggLot) {
  await app.inject({
    method: 'POST',
    url: `/api/inventory/${eggLot.id}/consume`,
    headers: auth,
    payload: { quantity: 2, unit: 'count', mealSlot: 'breakfast' },
  });
}

const anyRecipe = await prisma.recipe.findFirstOrThrow({ where: { ownerId: null, deletedAt: null } });
const anyItem = await prisma.inventoryItem.findFirstOrThrow({ where: { userId: user.id } });
const eggId = await food('Egg');

/** Every read endpoint worth documenting, with a working example call. */
const READS = [
  ['/api/health', 'Liveness, offline mode and the expiry window.', false],
  ['/api/auth/me', 'Who the token belongs to.'],
  ['/api/dashboard', 'Everything the home screen needs, in one call.'],
  ['/api/settings', 'Goals, targets, diet tags, ad and notification switches.'],
  ['/api/inventory?sort=expiration', 'The pantry. sort=expiration|category|name|recent.'],
  ['/api/inventory/expiring', 'Only what is about to go off.'],
  ['/api/inventory/stale', 'Bought and never touched.'],
  [`/api/inventory/${anyItem.id}`, 'One pantry item.'],
  ['/api/recipes?limit=3', 'Ranked search. q, limit, maxMinutes, maxCalories, maxGaps, tag, mine.'],
  ['/api/recipes/almost?limit=2', 'One or two ingredients away, with the gaps named.'],
  [`/api/recipes/${anyRecipe.id}`, 'One recipe, matched against your pantry.'],
  [`/api/recipes/${anyRecipe.id}/cook-preview`, 'Exactly what a cook would deduct. Show this before POST /cook.'],
  [`/api/recipes/for-food/${eggId}`, 'What you can make with one pantry item.'],
  ['/api/shopping-list', 'The list, open and checked.'],
  ['/api/consumption/today', 'Today’s diary, grouped so a cooked meal is one entry.'],
  ['/api/consumption/history?days=3', 'Calories and macros per day.'],
  ['/api/consumption/eat-out/recent', 'Things eaten out before, for one-tap repeat.'],
  ['/api/reports/waste', 'What was thrown away, and the pattern in it.'],
  ['/api/reports/waste/log', 'The waste log itself.'],
  ['/api/planning/plan', 'The meal plan.'],
  ['/api/planning/plan/shortfall', 'What the plan needs that you do not have.'],
  ['/api/planning/frequent', 'Recipes cooked most often.'],
  ['/api/planning/run-out', 'Staples forecast to run out soon.'],
  ['/api/planning/digest', 'The daily nudge.'],
  ['/api/planning/leftovers', 'Portions in the fridge.'],
  [`/api/foods/search?q=egg`, 'Catalog search.'],
  [`/api/foods/${eggId}/pack`, 'Pack size, and whether it is known or only guessed.'],
  ['/api/foods/units', 'Every unit the converter understands.'],
  ['/api/ads?slot=recipes', 'Demo sponsorships. Empty when ads are off.'],
];

/** Writes that change state — described, not called. */
const WRITES = [
  ['POST', '/api/auth/register', '{ email, password }', 'Creates an account, returns { token, user }.'],
  ['POST', '/api/auth/login', '{ email, password }', 'Returns { token, user }.'],
  ['POST', '/api/auth/password', '{ currentPassword, newPassword }', 'Changes your own password.'],
  ['POST', '/api/inventory', '{ foodReferenceId | name, quantity, unit, expirationDate?, storageLocation? }', 'Adds a lot.'],
  ['PATCH', '/api/inventory/:id', '{ quantity?, unit?, expirationDate?, lowStockThreshold? }', 'Corrects a lot.'],
  ['POST', '/api/inventory/:id/consume', '{ quantity, unit, mealSlot }', 'Eat some. Writes the diary.'],
  ['POST', '/api/inventory/:id/remove', '{ reason: wasted|other_person|used_up, quantity, unit }', 'Gone, but not eaten. No calories.'],
  ['POST', '/api/inventory/:id/freeze', '—', 'Moves to the freezer and extends the date.'],
  ['DELETE', '/api/inventory/:id', '—', 'Removes the lot entirely.'],
  ['POST', '/api/recipes/:id/cook', '{ servings?, mealSlot?, choices?, exclude?, keepServings?, swaps? }', 'Atomic: deducts every ingredient and logs it, or nothing.'],
  ['POST', '/api/recipes', '{ name, instructions, servings, ingredients[] }', 'Your own recipe. Owned by you.'],
  ['POST', '/api/recipes/import', '{ url }', 'Imports from a link into your own book.'],
  ['DELETE', '/api/recipes/:id', '—', 'Soft-deletes a recipe you added. 404 for anyone else’s.'],
  ['POST', '/api/shopping-list', '{ name, quantityNeeded, unit }', 'Adds an item.'],
  ['PATCH', '/api/shopping-list/:id', '{ isChecked?, quantityNeeded? }', 'Ticks or edits.'],
  ['POST', '/api/shopping-list/:id/stock', '{ quantity?, unit?, expirationDate? }', 'Bought it — moves it into the pantry.'],
  ['POST', '/api/shopping-list/from-recipe/:recipeId', '{ servings? }', 'Adds a recipe’s gaps.'],
  ['POST', '/api/consumption/eat-out', '{ name, calories?, mealSlot }', 'Logs food you did not own.'],
  ['PATCH', '/api/settings', '{ weightGoal?, dailyCalorieTarget?, dietTags?, adsEnabled?, … }', 'Updates settings.'],
  ['PUT', '/api/foods/:id/counts-as', '{ canonicalId }', 'Says what a scanned product really is.'],
  ['POST', '/api/foods/:id/conversions', '{ fromUnit, toUnit, multiplier }', 'Teaches a conversion, e.g. package→g.'],
  ['PUT', '/api/planning/ratings/:recipeId', '{ rating, note? }', 'Rates a recipe 1–5.'],
];

const sections = [];
const types = [];
let ok = 0;
let failed = 0;

for (const [url, note, needsAuth = true] of READS) {
  const response = await app.inject({ method: 'GET', url, headers: needsAuth ? auth : {} });
  let body;
  try {
    body = JSON.parse(response.body);
  } catch {
    body = null;
  }
  if (response.statusCode !== 200 || body === null) {
    failed += 1;
    sections.push(`### \`GET ${url}\`\n\n${note}\n\n> Probe returned ${response.statusCode}. Shape not captured.\n`);
    continue;
  }
  ok += 1;
  sections.push(`### \`GET ${url}\`\n\n${note}\n\n\`\`\`ts\n${shapeOf(body)}\n\`\`\`\n`);
}

const generated = `# API contract

Generated by \`npm run contract\` in \`server/\`. **Do not edit by hand** — every
shape below was captured from a live response, so if something here is wrong,
the server is wrong.

The frontend and the backend share nothing but this. \`web/\` imports no server
code, and it should stay that way: the moment it does, the two halves cannot be
worked on separately.

- Base URL: \`/api\`, same origin in production.
- Auth: \`Authorization: Bearer <token>\` on everything except \`/api/health\`,
  \`/api/auth/register\` and \`/api/auth/login\`.
- Errors: \`{ error: string, message: string, details?: unknown }\` with a real
  status code. \`message\` is written to be shown to a person as-is.
- Dates are ISO strings. A bare \`YYYY-MM-DD\` is read as local noon, never UTC
  midnight — that distinction was a real bug once.

Probed ${ok + failed} read endpoints: ${ok} captured${failed ? `, ${failed} failed` : ''}.

\`unknown[]\` means the probe account's list was genuinely empty — no waste
history, no forecasts, no meal plan yet — not that the server does not know
the shape. Those arrays hold the same objects their non-empty siblings do.

## Reads

${sections.join('\n')}

## Writes

These change state, so they are described rather than called.

| Method | Path | Body | What it does |
|---|---|---|---|
${WRITES.map(([m, p, b, d]) => `| \`${m}\` | \`${p}\` | \`${b}\` | ${d} |`).join('\n')}

## Rules that outlive any screen

1. **Never show a cook without its preview.** \`GET /cook-preview\` says exactly
   what will be deducted; \`POST /cook\` then does it atomically. A cook that is
   short one ingredient changes nothing at all.
2. **A quantity without a unit is meaningless.** Every amount in this API is a
   \`{ quantity, unit }\` pair. Do not add two of them in the frontend — the
   server converts, and it refuses when it cannot.
3. **\`status\` on an ingredient is one of \`ok | short | missing | unknown_conversion\`.**
   The last one means the engine declined to guess, not that it failed. Say so.
4. **Anything owned shows \`isMine\`.** A recipe with \`ownerId\` set belongs to one
   account and 404s for everybody else.
`;

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'API.md'), generated);
console.log(`Wrote docs/API.md — ${ok} endpoints captured, ${failed} failed.`);

await prisma.consumptionLog.deleteMany({ where: { userId: user.id } });
await prisma.inventoryItem.deleteMany({ where: { userId: user.id } });
await prisma.shoppingListItem.deleteMany({ where: { userId: user.id } });
await prisma.user.deleteMany({ where: { id: user.id } });
await app.close();
await prisma.$disconnect();
process.exit(failed > 0 ? 1 : 0);
