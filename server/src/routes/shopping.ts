import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import {
  addRecipeGaps,
  addShoppingItem,
  checkOffAndStock,
  clearChecked,
  listShoppingList,
  removeShoppingItem,
  setChecked,
} from '../services/shopping.js';
import { badRequest } from '../errors.js';
import { shoppingAds } from '../services/ads.js';
import { ingredientUses } from '../services/ingredientUses.js';
import { resolveBarcode } from '../services/foodRef.js';
import { notFound } from '../errors.js';

const dateish = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw badRequest('Invalid date.');
    return parsed;
  });

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  app.get('/', async (request) => {
    const [items, ads] = await Promise.all([
      listShoppingList(request.userId),
      shoppingAds(request.userId),
    ]);
    return { items, ads };
  });

  app.post('/', async (request, reply) => {
    const body = z
      .object({
        name: z.string().min(1),
        quantityNeeded: z.number().positive().default(1),
        unit: z.string().default('count'),
        foodReferenceId: z.string().nullish(),
      })
      .parse(request.body);
    const item = await addShoppingItem(request.userId, { ...body, addedFrom: 'manual' });
    return reply.code(201).send({ item });
  });

  /** One tap: everything this recipe is short on goes on the list. */
  app.post('/from-recipe/:recipeId', async (request, reply) => {
    const { recipeId } = request.params as { recipeId: string };
    const body = z.object({ servings: z.number().positive().nullish() }).parse(request.body ?? {});
    const result = await addRecipeGaps(request.userId, recipeId, body.servings ?? null);
    return reply.code(201).send(result);
  });

  app.patch('/:id', async (request) => {
    const { id } = request.params as { id: string };
    const { isChecked } = z.object({ isChecked: z.boolean() }).parse(request.body);
    return { item: await setChecked(request.userId, id, isChecked) };
  });

  /** Bought it: check off and put it in inventory in one transaction. */
  app.post('/:id/stock', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({
        quantity: z.number().positive().optional(),
        unit: z.string().optional(),
        expirationDate: dateish,
      })
      .parse(request.body ?? {});
    const result = await checkOffAndStock(request.userId, id, body);
    return reply.code(201).send({ result });
  });

  /**
   * What a line on the list is actually for — "1 tbsp for Scrambled Eggs on
   * Toast", plus what else it unlocks. Far more use in a shop than a precise
   * fraction of a tablespoon.
   */
  app.get('/:id/uses', async (request) => {
    const { id } = request.params as { id: string };
    const item = await prisma.shoppingListItem.findFirst({ where: { id, userId: request.userId } });
    if (!item) throw notFound('Shopping list item not found.');
    if (!item.foodReferenceId) {
      return { uses: [], totalRecipes: 0, foodName: item.name, foodReferenceId: null };
    }
    return (
      (await ingredientUses(request.userId, item.foodReferenceId)) ?? {
        uses: [],
        totalRecipes: 0,
        foodName: item.name,
        foodReferenceId: item.foodReferenceId,
      }
    );
  });

  /**
   * Standing in a shop holding something: scan it and see what you could make.
   * Nothing is added to the pantry — this is a question, not a purchase.
   */
  app.get('/scan/:barcode', async (request, reply) => {
    const { barcode } = request.params as { barcode: string };
    const result = await resolveBarcode(barcode);
    if (!result.ok) {
      return reply.code(result.reason === 'not_found' ? 404 : 502).send({
        error: result.reason,
        message: result.message,
        fallback: 'manual_entry',
      });
    }

    const food = result.result.food;
    const uses = await ingredientUses(request.userId, food.id, 10);
    return {
      food: { id: food.id, name: food.name, brand: food.brand },
      countsAs: uses && uses.foodReferenceId !== food.id ? uses.foodName : null,
      uses: uses?.uses ?? [],
      totalRecipes: uses?.totalRecipes ?? 0,
    };
  });

  app.delete('/checked', async (request) => clearChecked(request.userId));

  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await removeShoppingItem(request.userId, id);
    return reply.code(204).send();
  });
};

export default routes;
