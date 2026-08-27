/**
 * Recipe <-> inventory matching.
 *
 * Answers two questions:
 *   - for a list of recipes: which ones can I make right now? (ranked first)
 *   - for one recipe: per ingredient, do I have it, am I short, or is it missing?
 */
import { prisma, type Tx } from '../db.js';
import { loadConvertContexts } from './conversions.js';
import { planDeduction, type DeductionPlan, type IngredientStatus } from './deduction.js';
import { roundQuantity } from './units.js';
import { goalFit, nutritionForRecipes, type RecipeNutrition } from './recipeNutrition.js';
import { warningDaysFor } from './inventory.js';
import { ratingsFor } from './history.js';
import { env } from '../env.js';

/**
 * Which recipes a person is allowed to see.
 *
 * The seeded book has no owner, so everyone gets it. Anything you import or
 * write is stamped with your id and stays yours — two people sharing this
 * instance should not find each other's recipes in their search results.
 */
export function visibleToUser(userId: string) {
  return { deletedAt: null, OR: [{ ownerId: null }, { ownerId: userId }] };
}

export interface IngredientMatch {
  recipeIngredientId: string;
  foodReferenceId: string;
  name: string;
  /** stand-ins you already own, when this one is missing */
  substitutes: Array<{
    substituteId: string;
    substituteName: string;
    quantity: number;
    unit: string;
    note: string | null;
    available: number;
    enough: boolean;
  }>;
  /** the products in your pantry that could satisfy this, when there is a choice */
  options: Array<{
    inventoryItemId: string;
    name: string;
    quantity: number;
    unit: string;
    chosen: boolean;
  }>;
  brand: string | null;
  requiredQuantity: number;
  requiredUnit: string;
  status: IngredientStatus;
  available: number;
  shortfall: number;
  note: string | null;
  plan: DeductionPlan;
}

export interface RecipeMatch {
  id: string;
  name: string;
  description: string | null;
  servings: number;
  instructions?: string;
  canMakeNow: boolean;
  counts: Record<IngredientStatus, number>;
  ingredients: IngredientMatch[];
  totalMinutes: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  difficulty: string | null;
  cuisine: string | null;
  tags: string[];
  nutrition: RecipeNutrition | null;
  /** ingredients the user chose to leave out of this cook */
  excludedIngredients: Array<{ foodReferenceId: string; name: string; quantity: number; unit: string }>;
  /** names of ingredients in this recipe that are about to expire */
  usesExpiring: string[];
  /** why this recipe is where it is in the list */
  reasons: string[];
  /** this person imported or wrote it, rather than it coming with the app */
  isMine: boolean;
  /** "seeded" | "imported" | "user" */
  source: string;
}

type RecipeWithIngredients = Awaited<ReturnType<typeof loadRecipes>>[number];

async function loadRecipes(where: object, take: number, db: Tx) {
  return db.recipe.findMany({
    where,
    take,
    orderBy: { name: 'asc' },
    include: { ingredients: { include: { foodReference: true } } },
  });
}

/**
 * Inventory lots for one user, keyed by the *generic* ingredient, plus which
 * of those are expiring.
 *
 * A scanned "ORGANIC EXTRA VIRGIN OLIVE OIL" is its own catalog row, but a
 * recipe asks for "Olive Oil" — so lots are filed under whatever generic
 * ingredient they are a version of. Without this the app tells you that you are
 * missing an ingredient you are holding.
 */
async function loadInventoryByFood(userId: string, db: Tx) {
  const lots = await db.inventoryItem.findMany({
    where: { userId, quantity: { gt: 0 } },
    include: { foodReference: true },
  });
  const byFood = new Map<string, typeof lots>();
  for (const lot of lots) {
    const key = lot.foodReference.canonicalId ?? lot.foodReferenceId;
    const list = byFood.get(key) ?? [];
    list.push(lot);
    byFood.set(key, list);
  }

  const warningDays = await warningDaysFor(userId, db);
  const cutoff = Date.now() + warningDays * 86_400_000;
  const expiring = new Set(
    lots
      .filter((lot) => lot.expirationDate !== null && lot.expirationDate.getTime() <= cutoff)
      .map((lot) => lot.foodReference.canonicalId ?? lot.foodReferenceId),
  );

  return { byFood, expiring };
}

export async function evaluateRecipes(
  userId: string,
  // eslint-disable-next-line prefer-const -- reassigned when swaps are applied
  recipes: RecipeWithIngredients[],
  servingsOverride: number | null,
  db: Tx = prisma,
  /** ingredient food id -> the inventory lot the user picked */
  choices: Record<string, string> = {},
  /** ingredient food ids the user left out — no carrots, thanks */
  excluded: Set<string> = new Set(),
  /** ingredient food id -> the stand-in to use, for this cook only */
  swaps: Record<string, string> = {},
): Promise<RecipeMatch[]> {
  if (Object.keys(swaps).length > 0) {
    const { applySwaps } = await import('./substitutions.js');
    recipes = await Promise.all(
      recipes.map(async (recipe) => ({ ...recipe, ingredients: await applySwaps(recipe.ingredients, swaps, db) })),
    );
  }

  const { byFood: inventory, expiring } = await loadInventoryByFood(userId, db);

  // Contexts are needed for the recipe's ingredients *and* for whatever the
  // user actually holds — a branded jar converts by its own serving weight, not
  // by the generic ingredient's.
  const foods = new Map<
    string,
    {
      id: string;
      name?: string;
      defaultUnit: string;
      servingSizeGrams: number | null;
      canonicalId?: string | null;
    }
  >();
  for (const recipe of recipes) {
    for (const ingredient of recipe.ingredients) foods.set(ingredient.foodReferenceId, ingredient.foodReference);
  }
  for (const lots of inventory.values()) {
    for (const lot of lots) foods.set(lot.foodReferenceId, lot.foodReference);
  }

  /**
   * What this kitchen would actually reach for, per generic ingredient, in the
   * order the deduction would take it: soonest expiry first, undated last.
   * The nutrition pass uses the head of each list, so a recipe's calories are
   * this household's calories rather than a generic figure.
   */
  const ownedFoods = new Map<string, typeof recipes[number]['ingredients'][number]['foodReference'][]>();
  for (const [ingredientId, lots] of inventory) {
    const ordered = [...lots].sort((a, b) => {
      const left = a.expirationDate?.getTime() ?? Number.POSITIVE_INFINITY;
      const right = b.expirationDate?.getTime() ?? Number.POSITIVE_INFINITY;
      return left - right;
    });
    ownedFoods.set(ingredientId, ordered.map((lot) => lot.foodReference));
  }

  const [contexts, nutrition] = await Promise.all([
    loadConvertContexts([...foods.values()], db),
    // leaving the carrots out means the calories drop; recompute on what is kept
    nutritionForRecipes(
      recipes.map((recipe) => ({
        ...recipe,
        ingredients: recipe.ingredients.filter((i) => !excluded.has(i.foodReferenceId)),
      })),
      db,
      ownedFoods,
    ),
  ]);

  /** the right conversion context for whatever this lot actually is */
  const lotContext = (lot: { foodReferenceId?: string }, fallback: string) =>
    contexts.get(lot.foodReferenceId ?? fallback) ?? contexts.get(fallback) ?? {};

  return recipes.map((recipe) => {
    const scale = servingsOverride ? servingsOverride / Math.max(1, recipe.servings) : 1;
    const counts: Record<IngredientStatus, number> = { ok: 0, short: 0, missing: 0, unknown_conversion: 0 };

    const kept = recipe.ingredients.filter((i) => !excluded.has(i.foodReferenceId));

    const ingredients: IngredientMatch[] = kept.map((ingredient) => {
      const lots = inventory.get(ingredient.foodReferenceId) ?? [];
      const required = ingredient.quantityRequired * scale;
      const plan = planDeduction(
        lots,
        required,
        ingredient.unitRequired,
        (lot) => lotContext(lot, ingredient.foodReferenceId),
        choices[ingredient.foodReferenceId],
      );
      counts[plan.status] += 1;
      const lotName = (id?: string) =>
        (id && foods.get(id) && 'name' in (foods.get(id) as object)
          ? (foods.get(id) as unknown as { name: string }).name
          : ingredient.foodReference.name);

      return {
        recipeIngredientId: ingredient.id,
        foodReferenceId: ingredient.foodReferenceId,
        name: ingredient.foodReference.name,
        substitutes: [],
        // only worth showing when there is genuinely more than one
        options:
          plan.candidates.length > 1
            ? plan.candidates.map((candidate) => ({
                inventoryItemId: candidate.inventoryItemId,
                name: lotName(candidate.foodReferenceId),
                quantity: roundQuantity(candidate.quantity),
                unit: candidate.unit,
                chosen: candidate.chosen,
              }))
            : [],
        brand: ingredient.foodReference.brand,
        requiredQuantity: roundQuantity(required),
        requiredUnit: plan.requiredUnit,
        status: plan.status,
        available: roundQuantity(plan.available),
        shortfall: roundQuantity(plan.shortfall),
        note: ingredient.note,
        plan,
      };
    });

    const canMakeNow = ingredients.length > 0 && ingredients.every((i) => i.status === 'ok');
    const usesExpiring = ingredients
      .filter((i) => expiring.has(i.foodReferenceId))
      .map((i) => i.name);

    const reasons: string[] = [];
    if (usesExpiring.length > 0) reasons.push(`Uses ${usesExpiring.join(', ')} before it goes off`);
    if (canMakeNow && usesExpiring.length === 0) reasons.push('You have everything');

    const totalMinutes =
      recipe.prepMinutes === null && recipe.cookMinutes === null
        ? null
        : (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);

    return {
      id: recipe.id,
      name: recipe.name,
      description: recipe.description,
      servings: recipe.servings,
      /** what the user chose to leave out, still listed so it can be put back */
      excludedIngredients: recipe.ingredients
        .filter((i) => excluded.has(i.foodReferenceId))
        .map((i) => ({
          foodReferenceId: i.foodReferenceId,
          name: i.foodReference.name,
          quantity: roundQuantity(i.quantityRequired * scale),
          unit: i.unitRequired,
        })),
      canMakeNow,
      counts,
      ingredients,
      totalMinutes,
      prepMinutes: recipe.prepMinutes,
      cookMinutes: recipe.cookMinutes,
      difficulty: recipe.difficulty,
      cuisine: recipe.cuisine,
      tags: recipe.tags ? recipe.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      nutrition: nutrition.get(recipe.id) ?? null,
      usesExpiring,
      reasons,
      isMine: recipe.ownerId === userId,
      source: recipe.source,
    };
  });
}

export interface RecipeSearchOptions {
  query?: string;
  limit?: number;
  /** only recipes that fit in this many minutes */
  maxMinutes?: number;
  /** only recipes at or under this many calories per serving */
  maxCaloriesPerServing?: number;
  /** only recipes missing at most this many ingredients */
  maxGaps?: number;
  tag?: string;
  /** only the recipes this person imported or wrote */
  mineOnly?: boolean;
}

export interface RankedRecipe extends RecipeMatch {
  gaps: number;
  score: number;
}

/** How many recipes get the expensive per-ingredient evaluation. */
const SHORTLIST_SIZE = 60;
/**
 * Slots reserved for recipes the cheap pass thinks you are 1-2 ingredients
 * short of.
 *
 * The cheap pass only knows whether you own a food at all, not how much — so a
 * recipe you have a teaspoon of everything for scores as complete and crowds
 * out the ones you are genuinely one shop away from. Reserving slots keeps the
 * "one or two items away" shelf populated no matter how full the pantry is.
 */
const NEAR_MISS_SLOTS = 24;
/**
 * Slots held for recipes this person added themselves, so an import is never
 * crowded out of the main list by the shipped book.
 */
const OWN_RECIPE_SLOTS = 20;

/**
 * Stage one: cheap shortlisting.
 *
 * Evaluating a recipe properly means running the unit-conversion planner over
 * every ingredient, which is far too expensive to do for a whole recipe book on
 * every search. So first we ask the database a much cheaper question — how many
 * of this recipe's ingredients does the user own *at all* — and only the best
 * candidates go through to the real evaluation. Cost stays flat as the book
 * grows from twelve recipes to twelve thousand.
 */
async function shortlistRecipeIds(
  userId: string,
  opts: RecipeSearchOptions,
  db: Tx,
): Promise<string[]> {
  const trimmed = (opts.query ?? '').trim();
  /**
   * Postgres matches LIKE case-sensitively; SQLite does not. Recipe names are
   * stored capitalised, so without this "Omelette" finds nothing on Postgres.
   * The tag and ingredient clauses below need no such help — they compare
   * lowercase input against columns that are already stored lowercase.
   */
  const anyCase = (env.dbProvider === 'postgresql' ? { mode: 'insensitive' } : {}) as {
    mode?: 'insensitive';
  };
  // ownership first: a search must never reach past what this person can see
  const scope = opts.mineOnly ? { ownerId: userId, deletedAt: null } : visibleToUser(userId);
  const where = trimmed
    ? {
        AND: [
          scope,
          {
            OR: [
              { name: { contains: trimmed, ...anyCase } },
              { description: { contains: trimmed, ...anyCase } },
              { cuisine: { contains: trimmed, ...anyCase } },
              { tags: { contains: trimmed.toLowerCase() } },
              { ingredients: { some: { foodReference: { nameNorm: { contains: trimmed.toLowerCase() } } } } },
            ],
          },
        ],
      }
    : scope;

  const candidates = await db.recipe.findMany({
    where,
    select: { id: true, name: true, prepMinutes: true, cookMinutes: true, tags: true, ownerId: true },
  });

  const timeFiltered = candidates.filter((recipe) => {
    if (opts.tag) {
      const tags = recipe.tags ? recipe.tags.split(',').map((t) => t.trim()) : [];
      if (!tags.includes(opts.tag)) return false;
    }
    if (opts.maxMinutes) {
      const total =
        recipe.prepMinutes === null && recipe.cookMinutes === null
          ? null
          : (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);
      if (total === null || total > opts.maxMinutes) return false;
    }
    return true;
  });

  if (timeFiltered.length <= SHORTLIST_SIZE) return timeFiltered.map((recipe) => recipe.id);

  const candidateIds = timeFiltered.map((recipe) => recipe.id);

  const lots = await db.inventoryItem.findMany({
    where: { userId, quantity: { gt: 0 } },
    select: { foodReferenceId: true, expirationDate: true, foodReference: { select: { canonicalId: true } } },
  });
  // count a branded product as the generic ingredient it is a version of
  const ownedIds = [
    ...new Set(lots.map((lot) => lot.foodReference.canonicalId ?? lot.foodReferenceId)),
  ];

  const warningDays = await warningDaysFor(userId, db);
  const cutoff = Date.now() + warningDays * 86_400_000;
  const expiringIds = [
    ...new Set(
      lots
        .filter((lot) => lot.expirationDate !== null && lot.expirationDate.getTime() <= cutoff)
        .map((lot) => lot.foodReference.canonicalId ?? lot.foodReferenceId),
    ),
  ];

  const [totals, owned, expiring] = await Promise.all([
    db.recipeIngredient.groupBy({
      by: ['recipeId'],
      where: { recipeId: { in: candidateIds } },
      _count: { _all: true },
    }),
    ownedIds.length > 0
      ? db.recipeIngredient.groupBy({
          by: ['recipeId'],
          where: { recipeId: { in: candidateIds }, foodReferenceId: { in: ownedIds } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    expiringIds.length > 0
      ? db.recipeIngredient.groupBy({
          by: ['recipeId'],
          where: { recipeId: { in: candidateIds }, foodReferenceId: { in: expiringIds } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  const totalBy = new Map(totals.map((row) => [row.recipeId, row._count._all]));
  const ownedBy = new Map(owned.map((row) => [row.recipeId, row._count._all]));
  const expiringBy = new Map(expiring.map((row) => [row.recipeId, row._count._all]));

  const scored = timeFiltered
    .map((recipe) => {
      const total = totalBy.get(recipe.id) ?? 0;
      const have = ownedBy.get(recipe.id) ?? 0;
      const missing = Math.max(0, total - have);
      // same priorities as the real ranking, using only counts
      const score =
        (missing === 0 ? 1000 : 0) + Math.min(expiringBy.get(recipe.id) ?? 0, 3) * 150 - missing * 40;
      return { id: recipe.id, name: recipe.name, score, missing, ownerId: recipe.ownerId };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  /**
   * Your own recipes get slots before anything competes for them.
   *
   * The cheap pass ranks on how much of a recipe you already own, which is the
   * right question for the shipped book and the wrong one for the five recipes
   * you went and imported. Losing those to two hundred seeded ones you have
   * never opened reads exactly like the import failed.
   */
  const chosen = scored.filter((recipe) => recipe.ownerId === userId).slice(0, OWN_RECIPE_SLOTS);
  const taken = new Set(chosen.map((recipe) => recipe.id));

  for (const recipe of scored) {
    if (chosen.length >= SHORTLIST_SIZE - NEAR_MISS_SLOTS) break;
    if (taken.has(recipe.id)) continue;
    chosen.push(recipe);
    taken.add(recipe.id);
  }

  // then fill the reserved slots with the closest near-misses
  for (const recipe of scored) {
    if (chosen.length >= SHORTLIST_SIZE) break;
    if (taken.has(recipe.id)) continue;
    if (recipe.missing < 1 || recipe.missing > 2) continue;
    chosen.push(recipe);
    taken.add(recipe.id);
  }

  // and top back up with whatever ranked next, if slots are left
  for (const recipe of scored) {
    if (chosen.length >= SHORTLIST_SIZE) break;
    if (taken.has(recipe.id)) continue;
    chosen.push(recipe);
    taken.add(recipe.id);
  }

  return chosen.map((recipe) => recipe.id);
}

/**
 * Recipe search and ranking.
 *
 * Order of priority, which is the product's whole opinion in one function:
 *   1. things you can cook now that use food about to expire  (limit waste)
 *   2. things you can cook now                                (zero friction)
 *   3. things you are barely missing                          (one shop away)
 *   4. everything else
 * Within a tier, recipes that suit the user's weight goal come first.
 */
export interface RecipeSearchResult {
  recipes: RankedRecipe[];
  /** how many shipped recipes the diet filter removed from this result */
  dietHidden: number;
  /** the diet tags doing the removing, so the UI can name them */
  dietTags: string[];
}

export async function searchRecipes(
  userId: string,
  options: RecipeSearchOptions | string | undefined = {},
  legacyLimit = 50,
  db: Tx = prisma,
): Promise<RecipeSearchResult> {
  // tolerate the older (userId, query, limit) call shape
  const opts: RecipeSearchOptions =
    typeof options === 'string' || options === undefined
      ? { query: options, limit: legacyLimit }
      : options;

  const shortlist = await shortlistRecipeIds(userId, opts, db);
  if (shortlist.length === 0) return { recipes: [], dietHidden: 0, dietTags: [] };

  const [recipes, user] = await Promise.all([
    loadRecipes({ id: { in: shortlist } }, SHORTLIST_SIZE, db),
    db.user.findUnique({ where: { id: userId } }),
  ]);
  const goal = (user?.weightGoal ?? 'maintain') as 'lose' | 'maintain' | 'gain';

  // A diet is a hard filter on *suggestions*, not on your own library: showing
  // a vegetarian a pork recipe because they own the other nine ingredients is
  // not a suggestion. But a recipe you imported yourself is not a suggestion
  // either — you went and fetched it — so it is never hidden from you. Silently
  // dropping someone's own import is how this filter first showed up as "my
  // recipes keep disappearing".
  const diet = (user?.dietTags ?? '').split(',').map((tag) => tag.trim()).filter(Boolean);
  const onDiet =
    diet.length === 0
      ? recipes
      : recipes.filter((recipe) => {
          if (recipe.ownerId === userId) return true;
          const tags = (recipe.tags ?? '').split(',').map((tag) => tag.trim());
          return diet.every((required) => tags.includes(required));
        });
  /** shipped recipes the diet filter removed — reported so it is never silent */
  const dietHidden = recipes.length - onDiet.length;

  const matches = await evaluateRecipes(userId, onDiet, null, db);
  const ratings = await ratingsFor(userId, onDiet.map((recipe) => recipe.id), db);

  const ranked: RankedRecipe[] = matches
    .map((match) => {
      const gaps = match.counts.missing + match.counts.short + match.counts.unknown_conversion;
      const fit = goalFit(match.nutrition ?? undefined, goal);

      let score = 0;
      if (match.canMakeNow) score += 1000;
      // something you rated highly beats something you have never tried
      const rating = ratings.get(match.id);
      if (rating !== undefined) score += (rating - 3) * 25;
      // each expiring ingredient used is worth more than anything except being
      // cookable at all — this is goal #1 of the product expressed as a number
      score += Math.min(match.usesExpiring.length, 3) * 150;
      score -= gaps * 40;
      score += fit * 30;

      if (match.canMakeNow && goal !== 'maintain') {
        match.reasons.push(goal === 'lose' ? 'Fits a calorie deficit' : 'Calorie dense for gaining');
      }
      if (rating !== undefined && rating >= 4) match.reasons.push(`You rated this ${rating}/5`);

      return { ...match, gaps, score };
    })
    .filter((recipe) => {
      if (opts.maxCaloriesPerServing) {
        const kcal = recipe.nutrition?.caloriesPerServing;
        if (kcal === null || kcal === undefined || kcal > opts.maxCaloriesPerServing) return false;
      }
      if (opts.maxGaps !== undefined && recipe.gaps > opts.maxGaps) return false;
      return true;
    });

  return {
    recipes: ranked
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .slice(0, opts.limit ?? SHORTLIST_SIZE),
    dietHidden,
    dietTags: diet,
  };
}

/** The list on its own, for the callers that do not care why it is that long. */
export async function searchRecipesForUser(
  userId: string,
  options: RecipeSearchOptions | string | undefined = {},
  legacyLimit = 50,
  db: Tx = prisma,
): Promise<RankedRecipe[]> {
  return (await searchRecipes(userId, options, legacyLimit, db)).recipes;
}

/**
 * Recipes you are one or two items away from making. This is the actionable
 * set — a recipe missing seven things is not a suggestion, it is a shopping
 * trip — and each one comes with exactly what to buy.
 */
export async function almostMakeable(userId: string, maxGaps = 2, limit = 10, db: Tx = prisma) {
  const all = await searchRecipesForUser(userId, { limit: 100 }, 100, db);
  return all
    .filter((recipe) => recipe.gaps > 0 && recipe.gaps <= maxGaps)
    .slice(0, limit)
    .map((recipe) => ({
      id: recipe.id,
      name: recipe.name,
      description: recipe.description,
      servings: recipe.servings,
      totalMinutes: recipe.totalMinutes,
      nutrition: recipe.nutrition,
      gaps: recipe.gaps,
      missing: recipe.ingredients
        .filter((i) => i.status !== 'ok')
        .map((i) => ({
          foodReferenceId: i.foodReferenceId,
          name: i.name,
          needed: i.status === 'short' && i.shortfall > 0 ? i.shortfall : i.requiredQuantity,
          unit: i.requiredUnit,
          status: i.status,
        })),
    }));
}

/**
 * Fill in stand-ins for whatever is missing.
 *
 * Only ever for a single recipe on screen — running it across a list would mean
 * a pantry scan per ingredient per recipe, for suggestions nobody is looking at.
 */
export async function attachSubstitutes(userId: string, match: RecipeMatch, db: Tx = prisma) {
  const { substitutionsFor } = await import('./substitutions.js');
  for (const ingredient of match.ingredients) {
    if (ingredient.status === 'ok') continue;
    ingredient.substitutes = await substitutionsFor(
      userId,
      ingredient.foodReferenceId,
      ingredient.requiredQuantity,
      ingredient.requiredUnit,
      db,
    );
  }
  return match;
}

export async function getRecipeForUser(
  userId: string,
  recipeId: string,
  servings: number | null,
  db: Tx = prisma,
  choices: Record<string, string> = {},
  excluded: Set<string> = new Set(),
  swaps: Record<string, string> = {},
): Promise<(RecipeMatch & { instructions: string; source: string; sourceUrl: string | null }) | null> {
  const recipe = await db.recipe.findUnique({
    where: { id: recipeId },
    include: { ingredients: { include: { foodReference: true } } },
  });
  // someone else's imported recipe is indistinguishable from one that does not
  // exist — guessing an id must not reveal that it does
  if (!recipe || recipe.deletedAt !== null) return null;
  if (recipe.ownerId !== null && recipe.ownerId !== userId) return null;

  const [match] = await evaluateRecipes(userId, [recipe], servings, db, choices, excluded, swaps);
  if (!match) return null;

  await attachSubstitutes(userId, match, db);

  return {
    ...match,
    instructions: recipe.instructions,
    source: recipe.source,
    sourceUrl: recipe.sourceUrl,
  };
}

/** How many recipes get the real per-ingredient evaluation for one food. */
const EVALUATION_CAP = 120;

export interface RecipeUsingFood {
  id: string;
  name: string;
  description: string | null;
  totalMinutes: number | null;
  /** how much of this food the recipe asks for */
  quantity: number;
  unit: string;
  canMakeNow: boolean;
  gaps: number;
  /** what else you would need, when you cannot make it yet */
  missing: string[];
  nutrition: RecipeNutrition | null;
  isMine: boolean;
}

/**
 * "I have this — what can I do with it?"
 *
 * Asked by tapping something in the pantry. The cheap ownership count used
 * elsewhere is not good enough here: the answer people act on is *can I cook
 * this tonight*, and owning a teaspoon of flour is not the same as having
 * enough. So the candidates go through the real per-ingredient evaluation,
 * which is affordable because one food appears in a bounded number of recipes.
 */
export async function recipesUsingFood(
  userId: string,
  foodReferenceId: string,
  limit = 40,
  db: Tx = prisma,
): Promise<{ foodReferenceId: string; foodName: string; recipes: RecipeUsingFood[]; total: number } | null> {
  const food = await db.foodReference.findUnique({ where: { id: foodReferenceId } });
  if (!food) return null;

  // a branded jar is used wherever the generic ingredient is
  const ingredientId = food.canonicalId ?? food.id;
  const ingredientName =
    ingredientId === food.id
      ? food.name
      : (await db.foodReference.findUnique({ where: { id: ingredientId } }))?.name ?? food.name;

  const rows = await db.recipeIngredient.findMany({
    where: { foodReferenceId: ingredientId, recipe: visibleToUser(userId) },
    select: { recipeId: true, quantityRequired: true, unitRequired: true },
  });
  if (rows.length === 0) {
    return { foodReferenceId: ingredientId, foodName: ingredientName, recipes: [], total: 0 };
  }

  const amountBy = new Map(rows.map((row) => [row.recipeId, row]));
  // Ceiling on the full evaluation. The most-used ingredient in the shipped
  // book appears in 87 recipes, so this evaluates all of them in practice while
  // still bounding the cost if someone imports a thousand more.
  const recipes = await loadRecipes({ id: { in: [...amountBy.keys()] } }, EVALUATION_CAP, db);
  const matches = await evaluateRecipes(userId, recipes, null, db);

  const out: RecipeUsingFood[] = matches.map((match) => {
    const amount = amountBy.get(match.id);
    const gaps = match.counts.missing + match.counts.short + match.counts.unknown_conversion;
    return {
      id: match.id,
      name: match.name,
      description: match.description,
      totalMinutes: match.totalMinutes,
      quantity: roundQuantity(amount?.quantityRequired ?? 0),
      unit: amount?.unitRequired ?? '',
      canMakeNow: match.canMakeNow,
      gaps,
      missing: match.ingredients.filter((i) => i.status !== 'ok').map((i) => i.name),
      nutrition: match.nutrition,
      isMine: match.isMine,
    };
  });

  // cookable first, then closest to cookable
  out.sort((a, b) => a.gaps - b.gaps || a.name.localeCompare(b.name));

  return {
    foodReferenceId: ingredientId,
    foodName: ingredientName,
    recipes: out.slice(0, limit),
    total: rows.length,
  };
}
