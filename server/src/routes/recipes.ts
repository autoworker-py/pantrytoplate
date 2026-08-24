import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { notFound } from '../errors.js';
import {
  almostMakeable,
  getRecipeForUser,
  recipesUsingFood,
  searchRecipes,
} from '../services/recipeMatch.js';
import { previewImport, saveImport } from '../services/recipeImport.js';
import { cookRecipe, previewCook } from '../services/cook.js';
import { normalizeUnit } from '../services/units.js';
import { findOrCreateFoodByName } from '../services/foodRef.js';

/** "foodIdA,foodIdB" from the query string. */
function parseExcluded(raw: string | undefined): Set<string> {
  return new Set((raw ?? '').split(',').map((id) => id.trim()).filter(Boolean));
}

/** "foodId:lotId,foodId:lotId" from the query string. */
function parseChoices(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const pair of raw.split(',')) {
    const [food, lot] = pair.split(':');
    if (food && lot) out[food] = lot;
  }
  return out;
}

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  /**
   * Search and ranking. Cookable-now recipes that use food about to expire come
   * first, then cookable-now, then near-misses — with the user's weight goal
   * breaking ties.
   */
  app.get('/', async (request) => {
    const query = request.query as {
      q?: string;
      limit?: string;
      maxMinutes?: string;
      maxCalories?: string;
      maxGaps?: string;
      tag?: string;
      mine?: string;
    };

    const result = await searchRecipes(request.userId, {
      query: query.q,
      limit: Number(query.limit) || 60,
      ...(query.mine === '1' || query.mine === 'true' ? { mineOnly: true } : {}),
      ...(query.maxMinutes ? { maxMinutes: Number(query.maxMinutes) } : {}),
      ...(query.maxCalories ? { maxCaloriesPerServing: Number(query.maxCalories) } : {}),
      ...(query.maxGaps ? { maxGaps: Number(query.maxGaps) } : {}),
      ...(query.tag ? { tag: query.tag } : {}),
    });

    return {
      /**
       * Why the list is this long. A diet tag quietly removing two hundred
       * recipes is indistinguishable from a broken search, so the count comes
       * back with the results and the UI says so.
       */
      dietHidden: result.dietHidden,
      dietTags: result.dietTags,
      recipes: result.recipes.map((recipe) => ({
        id: recipe.id,
        name: recipe.name,
        description: recipe.description,
        servings: recipe.servings,
        canMakeNow: recipe.canMakeNow,
        counts: recipe.counts,
        gaps: recipe.gaps,
        totalMinutes: recipe.totalMinutes,
        difficulty: recipe.difficulty,
        tags: recipe.tags,
        nutrition: recipe.nutrition,
        usesExpiring: recipe.usesExpiring,
        reasons: recipe.reasons,
        isMine: recipe.isMine,
        source: recipe.source,
        missing: recipe.ingredients.filter((i) => i.status !== 'ok').map((i) => i.name),
      })),
    };
  });

  /** Recipes you are one or two items away from — with the gaps listed. */
  app.get('/almost', async (request) => {
    const { maxGaps, limit } = request.query as { maxGaps?: string; limit?: string };
    return { recipes: await almostMakeable(request.userId, Number(maxGaps) || 2, Number(limit) || 10) };
  });

  /** Paste a link: read the page's structured recipe data, change nothing yet. */
  app.post('/import/preview', async (request) => {
    const { url } = z.object({ url: z.string().min(4) }).parse(request.body);
    return { preview: await previewImport(url) };
  });

  /**
   * Save a previewed import into *this person's* recipe book. The id comes back
   * so the client can open the recipe straight away — you imported it because
   * you wanted to read it, not to go looking for it in a list afterwards.
   */
  app.post('/import', async (request, reply) => {
    const { url } = z.object({ url: z.string().min(4) }).parse(request.body);
    const preview = await previewImport(url);
    const saved = await saveImport(preview, request.userId);
    return reply.code(201).send({
      recipe: { id: saved.recipe.id, name: saved.recipe.name },
      newFoods: saved.newFoods,
      ingredientCount: preview.ingredients.length,
    });
  });

  /**
   * "I have this — what can I make with it?" Asked by tapping something in the
   * pantry. Splitting cookable-now from the rest is the whole point: the first
   * list is dinner, the second is a shopping trip.
   */
  app.get('/for-food/:foodId', async (request) => {
    const { foodId } = request.params as { foodId: string };
    const { limit } = request.query as { limit?: string };
    const result = await recipesUsingFood(request.userId, foodId, Number(limit) || 40);
    if (!result) throw notFound('Food not found.');
    return result;
  });

  /**
   * Delete a recipe you added. Soft: the row stays so the diary can still name
   * a meal you cooked from it, but it is gone from every list and cannot be
   * opened, cooked or planned. Only your own — the shipped book is not yours
   * to remove, and someone else's import is a 404, not a 403.
   */
  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const recipe = await prisma.recipe.findUnique({ where: { id } });
    if (!recipe || recipe.deletedAt !== null || recipe.ownerId !== request.userId) {
      throw notFound('Recipe not found.');
    }
    await prisma.$transaction([
      prisma.recipe.update({ where: { id }, data: { deletedAt: new Date() } }),
      // a plan pointing at a recipe you can no longer open is a dead entry
      prisma.mealPlanEntry.deleteMany({ where: { recipeId: id, userId: request.userId } }),
    ]);
    return reply.code(204).send();
  });

  app.get('/:id', async (request) => {
    const { id } = request.params as { id: string };
    const { servings, choices, exclude } = request.query as {
      servings?: string;
      choices?: string;
      exclude?: string;
    };
    const recipe = await getRecipeForUser(
      request.userId,
      id,
      servings ? Number(servings) : null,
      undefined,
      parseChoices(choices),
      parseExcluded(exclude),
    );
    if (!recipe) throw notFound('Recipe not found.');
    return { recipe };
  });

  /**
   * Exactly what will be deducted, before anything changes. The UI must show
   * this before calling POST /cook (spec 8.5).
   */
  app.get('/:id/cook-preview', async (request) => {
    const { id } = request.params as { id: string };
    const { servings, choices, exclude } = request.query as {
      servings?: string;
      choices?: string;
      exclude?: string;
    };
    return {
      preview: await previewCook(
        request.userId,
        id,
        servings ? Number(servings) : null,
        undefined,
        parseChoices(choices),
        parseExcluded(exclude),
      ),
    };
  });

  /** Atomic: every ingredient is decremented and logged, or nothing is. */
  app.post('/:id/cook', async (request) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({
        servings: z.number().positive().nullish(),
        mealSlot: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).default('dinner'),
        /** ingredient food id -> the pantry item the user picked */
        choices: z.record(z.string()).optional(),
        /** ingredient food ids to leave out of this cook */
        exclude: z.array(z.string()).optional(),
        /** servings going in the fridge rather than onto a plate */
        keepServings: z.number().min(0).optional(),
      })
      .parse(request.body ?? {});
    return {
      result: await cookRecipe(
        request.userId,
        id,
        body.servings ?? null,
        body.mealSlot,
        body.choices ?? {},
        new Set(body.exclude ?? []),
        body.keepServings ?? 0,
      ),
    };
  });

  /** User-created recipes; ingredients link to (or create) catalog entries. */
  app.post('/', async (request, reply) => {
    const body = z
      .object({
        name: z.string().min(1),
        description: z.string().nullish(),
        instructions: z.string().min(1),
        servings: z.number().int().positive().default(1),
        prepMinutes: z.number().int().nonnegative().nullish(),
        cookMinutes: z.number().int().nonnegative().nullish(),
        difficulty: z.enum(['easy', 'medium', 'hard']).nullish(),
        cuisine: z.string().nullish(),
        tags: z.array(z.string()).optional(),
        ingredients: z
          .array(
            z.object({
              foodReferenceId: z.string().optional(),
              name: z.string().optional(),
              quantityRequired: z.number().positive(),
              unitRequired: z.string().default('count'),
              note: z.string().nullish(),
            }),
          )
          .min(1),
      })
      .parse(request.body);

    const ingredients = [];
    for (const ingredient of body.ingredients) {
      let foodReferenceId = ingredient.foodReferenceId;
      if (!foodReferenceId) {
        const resolved = await findOrCreateFoodByName({
          name: ingredient.name ?? 'Unnamed ingredient',
          defaultUnit: ingredient.unitRequired,
        });
        foodReferenceId = resolved.food.id;
      }
      ingredients.push({
        foodReferenceId,
        quantityRequired: ingredient.quantityRequired,
        unitRequired: normalizeUnit(ingredient.unitRequired),
        note: ingredient.note ?? null,
      });
    }

    const recipe = await prisma.recipe.create({
      data: {
        name: body.name,
        description: body.description ?? null,
        instructions: body.instructions,
        servings: body.servings,
        source: 'user',
        ownerId: request.userId,
        prepMinutes: body.prepMinutes ?? null,
        cookMinutes: body.cookMinutes ?? null,
        difficulty: body.difficulty ?? null,
        cuisine: body.cuisine ?? null,
        tags: body.tags?.join(',') ?? null,
        ingredients: { create: ingredients },
      },
      include: { ingredients: { include: { foodReference: true } } },
    });
    return reply.code(201).send({ recipe });
  });
};

export default routes;
