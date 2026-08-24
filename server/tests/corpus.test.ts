/**
 * The guarantee that every recipe in the book actually works.
 *
 * A recipe is only useful to this app if the app can *act* on it: every
 * ingredient must resolve to a real catalog food, and the unit the recipe asks
 * for must convert to that food's own units — otherwise cooking it could not
 * deduct from a pantry and its calories could not be counted.
 *
 * These tests walk the entire corpus. Adding a recipe with a typo'd ingredient
 * or an impossible unit fails the build rather than shipping a broken recipe.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { loadConvertContexts } from '../src/services/conversions.js';
import { nutritionFor } from '../src/services/nutrition.js';
import { convert } from '../src/services/units.js';
import { FOODS } from '../prisma/data/foods.js';
import { RECIPES } from '../prisma/data/recipes/index.js';

type Loaded = Awaited<ReturnType<typeof loadRecipes>>;

/**
 * The shipped book only. A user's own import is not part of the corpus this
 * file makes promises about — it comes from someone else's web page, and its
 * calories and units are theirs to be wrong about.
 */
async function loadRecipes() {
  return prisma.recipe.findMany({
    where: { ownerId: null, deletedAt: null },
    include: { ingredients: { include: { foodReference: true } } },
  });
}

let recipes: Loaded;
let contexts: Awaited<ReturnType<typeof loadConvertContexts>>;

beforeAll(async () => {
  recipes = await loadRecipes();
  const foods = new Map<string, (typeof recipes)[number]['ingredients'][number]['foodReference']>();
  for (const recipe of recipes) {
    for (const ingredient of recipe.ingredients) foods.set(ingredient.foodReferenceId, ingredient.foodReference);
  }
  contexts = await loadConvertContexts([...foods.values()], prisma);
});

describe('the corpus is big enough to be useful', () => {
  it('ships a substantial catalog and recipe book', () => {
    expect(FOODS.length).toBeGreaterThanOrEqual(180);
    expect(RECIPES.length).toBeGreaterThanOrEqual(180);
    expect(recipes.length).toBe(RECIPES.length);
  });

  it('covers a wide spread of cuisines and meal types', () => {
    const cuisines = new Set(recipes.map((r) => r.cuisine));
    const tags = new Set(recipes.flatMap((r) => (r.tags ?? '').split(',').filter(Boolean)));
    expect(cuisines.size).toBeGreaterThanOrEqual(15);
    for (const meal of ['breakfast', 'lunch', 'dinner', 'dessert', 'side', 'snack']) {
      expect([...tags]).toContain(meal);
    }
  });

  it('has no duplicate recipe or food names', () => {
    expect(new Set(RECIPES.map((r) => r.name)).size).toBe(RECIPES.length);
    expect(new Set(FOODS.map((f) => f.key)).size).toBe(FOODS.length);
    expect(new Set(FOODS.map((f) => f.name)).size).toBe(FOODS.length);
  });
});

describe('every recipe is complete', () => {
  it('has ingredients, steps, servings and a time', () => {
    for (const recipe of RECIPES) {
      expect(recipe.ingredients.length, recipe.name).toBeGreaterThan(0);
      expect(recipe.steps.length, recipe.name).toBeGreaterThan(0);
      expect(recipe.servings, recipe.name).toBeGreaterThan(0);
      expect(recipe.prep + recipe.cook, recipe.name).toBeGreaterThan(0);
      expect(recipe.tags.length, recipe.name).toBeGreaterThan(0);
    }
  });

  it('asks for a positive quantity of everything', () => {
    for (const recipe of RECIPES) {
      for (const [key, quantity] of recipe.ingredients) {
        expect(quantity, `${recipe.name} / ${key}`).toBeGreaterThan(0);
      }
    }
  });

  it('never lists the same ingredient twice', () => {
    for (const recipe of RECIPES) {
      const keys = recipe.ingredients.map(([key]) => key);
      expect(new Set(keys).size, recipe.name).toBe(keys.length);
    }
  });
});

describe('every ingredient links to a real food', () => {
  it('references only foods that exist in the catalog', () => {
    const known = new Set(FOODS.map((food) => food.key));
    const missing: string[] = [];
    for (const recipe of RECIPES) {
      for (const [key] of recipe.ingredients) {
        if (!known.has(key)) missing.push(`${recipe.name} -> ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('is linked in the database, not just in the source file', () => {
    for (const recipe of recipes) {
      for (const ingredient of recipe.ingredients) {
        expect(ingredient.foodReference, `${recipe.name}`).toBeTruthy();
      }
    }
  });
});

describe('every ingredient can actually be deducted', () => {
  /**
   * The load-bearing test. If a recipe says "2 cups flour" the app has to be
   * able to turn that into the unit the user's flour is stored in — otherwise
   * "cook this" cannot work, which is the entire product.
   */
  it('converts every recipe unit into its food default unit', () => {
    const failures: string[] = [];

    for (const recipe of recipes) {
      for (const ingredient of recipe.ingredients) {
        const ctx = contexts.get(ingredient.foodReferenceId) ?? {};
        const result = convert(
          ingredient.quantityRequired,
          ingredient.unitRequired,
          ingredient.foodReference.defaultUnit,
          ctx,
        );
        if (!result.ok) {
          failures.push(
            `${recipe.name}: ${ingredient.quantityRequired} ${ingredient.unitRequired} ` +
              `${ingredient.foodReference.name} -> ${ingredient.foodReference.defaultUnit}`,
          );
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it('converts every recipe unit into grams, so weights are comparable', () => {
    const failures: string[] = [];
    for (const recipe of recipes) {
      for (const ingredient of recipe.ingredients) {
        const ctx = contexts.get(ingredient.foodReferenceId) ?? {};
        if (!convert(1, ingredient.unitRequired, 'g', ctx).ok) {
          failures.push(`${recipe.name}: ${ingredient.unitRequired} ${ingredient.foodReference.name}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

describe('every recipe has usable nutrition', () => {
  it('computes calories for every single ingredient', () => {
    const failures: string[] = [];
    for (const recipe of recipes) {
      for (const ingredient of recipe.ingredients) {
        const totals = nutritionFor(
          ingredient.quantityRequired,
          ingredient.unitRequired,
          ingredient.foodReference,
          contexts.get(ingredient.foodReferenceId) ?? {},
        );
        if (totals.calories === null) {
          failures.push(`${recipe.name}: ${ingredient.foodReference.name}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('lands every recipe in a sane calories-per-serving range', () => {
    const suspicious: string[] = [];

    for (const recipe of recipes) {
      let calories = 0;
      for (const ingredient of recipe.ingredients) {
        const totals = nutritionFor(
          ingredient.quantityRequired,
          ingredient.unitRequired,
          ingredient.foodReference,
          contexts.get(ingredient.foodReferenceId) ?? {},
        );
        calories += totals.calories ?? 0;
      }
      const perServing = calories / recipe.servings;
      // a real dish is not 20 kcal and not 3,000 — anything outside that is a
      // data error (a quantity in the wrong unit, usually)
      if (perServing < 40 || perServing > 2000) {
        suspicious.push(`${recipe.name}: ${Math.round(perServing)} kcal per serving`);
      }
    }

    expect(suspicious).toEqual([]);
  });

  it('keeps macro totals physically possible', () => {
    const impossible: string[] = [];
    for (const recipe of recipes) {
      let calories = 0;
      let fromMacros = 0;
      for (const ingredient of recipe.ingredients) {
        const totals = nutritionFor(
          ingredient.quantityRequired,
          ingredient.unitRequired,
          ingredient.foodReference,
          contexts.get(ingredient.foodReferenceId) ?? {},
        );
        calories += totals.calories ?? 0;
        fromMacros += (totals.protein ?? 0) * 4 + (totals.carbs ?? 0) * 4 + (totals.fat ?? 0) * 9;
      }
      // macros should roughly account for the calories; a wild mismatch means
      // one of the nutrition rows is wrong
      if (calories > 0 && (fromMacros > calories * 1.5 || fromMacros < calories * 0.5)) {
        impossible.push(`${recipe.name}: ${Math.round(calories)} kcal vs ${Math.round(fromMacros)} from macros`);
      }
    }
    expect(impossible).toEqual([]);
  });
});

describe('the catalog itself is sound', () => {
  it('gives every food a positive gram weight for one unit', () => {
    for (const food of FOODS) {
      expect(food.gramsPerUnit, food.key).toBeGreaterThan(0);
    }
  });

  it('keeps every weight-based food within a believable calorie density', () => {
    for (const food of FOODS) {
      if (food.defaultUnit !== 'g' || food.kcal === null) continue;
      // nothing edible exceeds 9 kcal per gram (pure fat)
      expect(food.kcal, food.key).toBeLessThanOrEqual(9.1);
      expect(food.kcal, food.key).toBeGreaterThanOrEqual(0);
    }
  });

  it('can convert a cup of every weight-based catalog ingredient to grams', async () => {
    // Scoped to generic catalog entries, because those are what recipes point
    // at. A scanned branded product needs no density of its own — it inherits
    // one from the ingredient it counts as, which the next test checks.
    const foods = await prisma.foodReference.findMany({ where: { defaultUnit: 'g', barcode: null } });
    const ctxs = await loadConvertContexts(foods, prisma);
    const failures = foods
      .filter((food) => !convert(1, 'cup', 'g', ctxs.get(food.id) ?? {}).ok)
      .map((food) => food.name);
    expect(failures).toEqual([]);
  });

  it('lets a branded product inherit its ingredient density', async () => {
    const oliveOil = await prisma.foodReference.findFirstOrThrow({ where: { name: 'Olive Oil' } });
    const product = await prisma.foodReference.create({
      data: {
        name: 'Corpus Test Extra Virgin Olive Oil',
        nameNorm: 'corpus test extra virgin olive oil',
        barcode: 'corpus-density-test',
        source: 'openfoodfacts',
        defaultUnit: 'g',
        caloriesPerUnit: 8.84,
        servingSizeGrams: 1,
        canonicalId: oliveOil.id,
        canonicalSource: 'auto',
      },
    });

    // the bottle carries no density row of its own
    expect(await prisma.unitConversion.count({ where: { foodReferenceId: product.id } })).toBe(0);

    // ...but a tablespoon of it still converts, via the generic olive oil
    const ctxs = await loadConvertContexts([product], prisma);
    const tbsp = convert(1, 'tbsp', 'g', ctxs.get(product.id) ?? {});
    expect(tbsp.ok).toBe(true);
    if (tbsp.ok) expect(tbsp.value).toBeCloseTo(13.5, 1);

    await prisma.foodReference.delete({ where: { id: product.id } });
  });
});
