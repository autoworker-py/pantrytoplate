/**
 * Seed script.
 *
 * The catalog and the recipe book live in ./data — this file only loads them,
 * plus the tables that are not per-food: universal unit conversions, shelf life
 * by category, demo sponsorships, and a demo user whose pantry matches the
 * walkthrough in the product spec.
 *
 * Idempotent: safe to re-run.
 */
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { normalizeName } from '../src/services/matching.js';
import { FOODS, CATEGORY_CUP_GRAMS } from './data/foods.js';
import { RECIPES } from './data/recipes/index.js';
import { SUBSTITUTIONS } from './data/substitutions.js';

const prisma = new PrismaClient();

/**
 * Universal conversions. The engine knows these too; storing them keeps the
 * table authoritative and lets an operator correct one without a code change.
 */
const UNIVERSAL: Array<[string, string, number]> = [
  ['cup', 'ml', 236.5882365],
  ['tbsp', 'ml', 14.78676478125],
  ['tsp', 'ml', 4.92892159375],
  ['floz', 'ml', 29.5735295625],
  ['pint', 'ml', 473.176473],
  ['quart', 'ml', 946.352946],
  ['gallon', 'ml', 3785.411784],
  ['l', 'ml', 1000],
  ['oz', 'g', 28.349523125],
  ['lb', 'g', 453.59237],
  ['kg', 'g', 1000],
  ['dozen', 'count', 12],
];

/**
 * Typical shelf life by category, so expiry dates fill themselves in.
 * Conservative "use by" figures rather than absolute limits — the point is to
 * prompt in time, and every date stays editable.
 */
const SHELF_LIFE: Array<[category: string, pantry: number | null, fridge: number | null, freezer: number | null]> = [
  ['Produce', 5, 10, 240],
  ['Fruit', 7, 14, 240],
  ['Dairy & Eggs', null, 14, 90],
  ['Cheese', null, 21, 120],
  ['Meat & Seafood', null, 3, 180],
  ['Bakery', 5, 10, 90],
  ['Grains', 365, null, 730],
  ['Pasta', 730, null, null],
  ['Legumes', 730, null, null],
  ['Baking', 540, null, null],
  ['Canned Goods', 730, null, null],
  ['Snacks', 180, null, null],
  ['Spices', 1095, null, null],
  ['Herbs', 10, 14, 180],
  ['Condiments', 365, 180, null],
  ['Sauces', 365, 30, null],
  ['Oils & Vinegars', 540, null, null],
  ['Nuts & Seeds', 300, null, 540],
  ['Frozen', null, null, 300],
  ['Beverages', 180, 14, null],
];

/**
 * Demo sponsorships for the ad surfaces.
 *
 * Plain-text brand names only — no logos, no brand colours, no trade dress —
 * and everything renders behind a "Sponsored · Demo" label. Reproducing a real
 * company's branding would imply a commercial relationship that does not exist;
 * a name demonstrates the placement and claims nothing.
 */
const SPONSORS: Record<string, { name: string; tagline: string }> = {
  chocchips: { name: 'Nestlé', tagline: 'Baking chips for cookies, brownies and everything after dinner.' },
  flour: { name: 'King Arthur', tagline: 'Unbleached all-purpose flour, milled to a consistent protein level.' },
  spaghetti: { name: 'Barilla', tagline: 'Bronze-cut pasta that holds a sauce.' },
  yogurt: { name: 'Chobani', tagline: 'Strained Greek yogurt, 17g of protein a cup.' },
  oliveoil: { name: 'Bertolli', tagline: 'Extra virgin olive oil for finishing and frying.' },
  passata: { name: 'Mutti', tagline: 'Passata from tomatoes picked and pressed the same day.' },
};

/** Demo pantry — deliberately mirrors the walkthrough in the product spec. */
const DEMO_INVENTORY: Array<
  [foodKey: string, quantity: number, unit: string, expiresInDays: number | null, storage?: string, lowStock?: number]
> = [
  ['egg', 12, 'count', 18, 'fridge', 4],
  ['poptarts', 10, 'count', 240],
  ['milk', 1, 'gallon', 2, 'fridge', 0.25],
  ['spinach', 1, 'bag', 1, 'fridge'],
  ['butter', 227, 'g', 45, 'fridge'],
  ['cheddar', 250, 'g', 21, 'fridge', 100],
  ['yogurt', 500, 'g', 10, 'fridge'],
  ['chicken', 3, 'count', 3, 'fridge'],
  ['bacon', 8, 'slice', 6, 'fridge'],
  ['flour', 2, 'lb', 300],
  ['sugar', 1000, 'g', 400],
  ['brownsugar', 500, 'g', 300],
  ['rice', 1, 'bag', 500],
  ['basmati', 500, 'g', 500],
  ['oats', 1, 'cup', 200],
  ['spaghetti', 1, 'box', 400],
  ['penne', 500, 'g', 400],
  ['bread', 12, 'slice', 5, 'pantry', 4],
  ['tortilla', 8, 'count', 30],
  ['banana', 4, 'count', 4],
  ['apple', 5, 'count', 14],
  ['lemon', 3, 'count', 18],
  ['garlic', 8, 'count', 60],
  ['onion', 3, 'count', 30],
  ['carrot', 5, 'count', 14],
  ['potato', 6, 'count', 21],
  ['redpepper', 2, 'count', 8],
  ['mushroom', 250, 'g', 6, 'fridge'],
  ['tomato', 4, 'count', 6],
  ['oliveoil', 500, 'g', 400],
  ['vegoil', 500, 'g', 400],
  ['soysauce', 250, 'g', 500],
  ['tinnedtomato', 3, 'can', 600],
  ['blackbeans', 2, 'can', 500],
  ['chickpeas', 2, 'can', 500],
  ['passata', 1, 'jar', 300],
  ['stock', 1, 'l', 12],
  ['salt', 500, 'g', null],
  ['pepper', 50, 'g', null],
  ['cumin', 40, 'g', null],
  ['paprika', 40, 'g', null],
  ['oregano', 20, 'g', null],
  ['cinnamon', 40, 'g', null],
  ['bakingpowder', 100, 'g', 200],
  ['vanilla', 60, 'g', 500],
  ['chocchips', 1, 'bag', 300],
  ['honey', 340, 'g', 900],
  ['parmesan', 100, 'g', 40, 'fridge'],
];

const daysFromNow = (days: number) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
};

async function main() {
  /**
   * Seeding on a host with no shell.
   *
   * A free Render instance has no way to run a one-off command, so seeding has
   * to ride along with the build — and re-running the full seed on every deploy
   * would delete and recreate all 226 shipped recipes each time, taking every
   * rating and meal-plan entry attached to them along with it. So the build
   * asks for this: seed a database that has never been seeded, and otherwise do
   * nothing at all.
   */
  if (process.env.SEED_ONLY_IF_EMPTY === 'true') {
    const existing = await prisma.recipe.count();
    if (existing > 0) {
      console.log(`Database already has ${existing} recipes — nothing to seed.`);
      return;
    }
    console.log('Empty database: seeding for the first time.');
  }

  console.log('Seeding food catalog...');
  const foodIds = new Map<string, string>();

  for (const food of FOODS) {
    const sponsor = SPONSORS[food.key];
    const data = {
      name: food.name,
      nameNorm: normalizeName(food.name),
      brand: null,
      barcode: food.key === 'poptarts' ? '0000000000017' : null,
      source: 'manual',
      externalId: null,
      category: food.category,
      defaultUnit: food.defaultUnit,
      caloriesPerUnit: food.kcal,
      proteinPerUnit: food.protein,
      fatPerUnit: food.fat,
      carbsPerUnit: food.carbs,
      servingSizeGrams: food.gramsPerUnit,
      shelfLifeDays: food.shelfLifeDays ?? null,
      sponsorName: sponsor?.name ?? null,
      sponsorTagline: sponsor?.tagline ?? null,
    };

    const existing = await prisma.foodReference.findFirst({ where: { nameNorm: data.nameNorm } });
    const row = existing
      ? await prisma.foodReference.update({ where: { id: existing.id }, data })
      : await prisma.foodReference.create({ data });
    foodIds.set(food.key, row.id);

    for (const term of food.synonyms ?? []) {
      const normalized = normalizeName(term);
      if (normalized === data.nameNorm) continue;
      await prisma.foodSynonym.upsert({
        where: { term: normalized },
        create: { term: normalized, foodReferenceId: row.id },
        update: { foodReferenceId: row.id },
      });
    }

    // Every weight-based food needs one cup weight, or a recipe asking for a cup
    // of it could not be deducted at all. Fall back to the category's.
    const conversions = [...(food.conversions ?? [])];
    if (
      food.defaultUnit === 'g' &&
      !conversions.some(([from, to]) => from === 'cup' && to === 'g') &&
      CATEGORY_CUP_GRAMS[food.category]
    ) {
      conversions.push(['cup', 'g', CATEGORY_CUP_GRAMS[food.category]!]);
    }

    for (const [fromUnit, toUnit, multiplier] of conversions) {
      await prisma.unitConversion.upsert({
        where: { foodReferenceId_fromUnit_toUnit: { foodReferenceId: row.id, fromUnit, toUnit } },
        create: { foodReferenceId: row.id, fromUnit, toUnit, multiplier },
        update: { multiplier },
      });
    }
  }
  console.log(`  ${FOODS.length} foods`);

  console.log('Seeding universal unit conversions...');
  await prisma.unitConversion.deleteMany({ where: { foodReferenceId: null } });
  await prisma.unitConversion.createMany({
    data: UNIVERSAL.map(([fromUnit, toUnit, multiplier]) => ({ fromUnit, toUnit, multiplier })),
  });
  console.log(`  ${UNIVERSAL.length} universal conversions`);

  console.log('Seeding shelf life table...');
  for (const [category, pantryDays, fridgeDays, freezerDays] of SHELF_LIFE) {
    await prisma.shelfLife.upsert({
      where: { category },
      create: { category, pantryDays, fridgeDays, freezerDays },
      update: { pantryDays, fridgeDays, freezerDays },
    });
  }
  console.log(`  ${SHELF_LIFE.length} categories`);

  console.log('Seeding substitutions...');
  await prisma.substitution.deleteMany({});
  let subs = 0;
  for (const [ingredient, substitute, ratio, note, rank] of SUBSTITUTIONS) {
    const from = foodIds.get(ingredient);
    const to = foodIds.get(substitute);
    if (!from || !to) throw new Error(`Substitution references unknown food "${ingredient}" or "${substitute}"`);
    await prisma.substitution.create({
      data: { foodReferenceId: from, substituteId: to, ratio, note, rank: rank ?? 1 },
    });
    subs += 1;
  }
  console.log(`  ${subs} substitutions`);

  console.log('Seeding recipes...');
  const seen = new Set<string>();
  for (const recipe of RECIPES) {
    if (seen.has(recipe.name)) throw new Error(`Duplicate recipe name: ${recipe.name}`);
    seen.add(recipe.name);

    /**
     * Replace the shipped copy only.
     *
     * `ownerId: null` is load-bearing, not tidiness. Without it this matches by
     * name alone, and a person who imported their own "Chicken Alfredo" — a
     * name this book already uses — loses it the next time anyone re-seeds to
     * add recipes. deleteMany rather than delete so a stray duplicate in the
     * shipped set cannot leave one behind.
     */
    await prisma.recipe.deleteMany({ where: { name: recipe.name, ownerId: null } });

    await prisma.recipe.create({
      data: {
        name: recipe.name,
        description: recipe.description,
        instructions: recipe.steps.map((step, i) => `${i + 1}. ${step}`).join('\n'),
        servings: recipe.servings,
        source: 'seeded',
        prepMinutes: recipe.prep,
        cookMinutes: recipe.cook,
        difficulty: recipe.difficulty,
        cuisine: recipe.cuisine,
        tags: recipe.tags.join(','),
        ingredients: {
          create: recipe.ingredients.map(([key, quantity, unit, note]) => {
            const foodReferenceId = foodIds.get(key);
            if (!foodReferenceId) throw new Error(`Recipe "${recipe.name}" references unknown food "${key}"`);
            return { foodReferenceId, quantityRequired: quantity, unitRequired: unit, note: note ?? null };
          }),
        },
      },
    });
  }
  console.log(`  ${RECIPES.length} recipes`);

  /**
   * The demo account exists to make the walkthrough in the spec work, and
   * re-seeding it means wiping its pantry, diary and shopping list back to the
   * scripted state. That is right on a dev machine and catastrophic on a
   * deployed one, where somebody may be using that account for real food. So
   * re-seeding to pick up new recipes leaves accounts alone unless asked.
   */
  if (process.env.SEED_DEMO_USER === 'false') {
    console.log('Skipping the demo user (SEED_DEMO_USER=false).');
    console.log('Done.');
    return;
  }

  console.log('Seeding demo user...');
  const email = 'demo@pantry.local';
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, passwordHash: await bcrypt.hash('pantrydemo', 10) },
    update: {},
  });

  await prisma.consumptionLog.deleteMany({ where: { userId: user.id } });
  await prisma.inventoryRemoval.deleteMany({ where: { userId: user.id } });
  await prisma.inventoryItem.deleteMany({ where: { userId: user.id } });
  await prisma.shoppingListItem.deleteMany({ where: { userId: user.id } });

  for (const [key, quantity, unit, expiresInDays, storage, lowStock] of DEMO_INVENTORY) {
    const foodReferenceId = foodIds.get(key);
    if (!foodReferenceId) throw new Error(`Demo inventory references unknown food "${key}"`);
    await prisma.inventoryItem.create({
      data: {
        userId: user.id,
        foodReferenceId,
        quantity,
        unit,
        expirationDate: expiresInDays === null ? null : daysFromNow(expiresInDays),
        storageLocation: storage ?? 'pantry',
        lowStockThreshold: lowStock ?? null,
      },
    });
  }

  await prisma.shoppingListItem.create({
    data: { userId: user.id, name: 'Coffee beans', quantityNeeded: 1, unit: 'bag', addedFrom: 'manual' },
  });

  console.log(`  demo user ${email} / pantrydemo with ${DEMO_INVENTORY.length} pantry items`);
  console.log('Done.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
