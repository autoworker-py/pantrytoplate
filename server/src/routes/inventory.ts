import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { badRequest, notFound } from '../errors.js';
import { env } from '../env.js';
import {
  addInventoryItem,
  consumeInventoryItem,
  deleteInventoryItem,
  expiringSoon,
  freezeInventoryItem,
  listInventory,
  removeInventoryQuantity,
  staleInventory,
  updateInventoryItem,
  type InventorySort,
  type RemovalReason,
} from '../services/inventory.js';
import { findOrCreateFoodByName, resolveBarcode } from '../services/foodRef.js';

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

/**
 * One add endpoint, three ways to identify the food, in order of precision:
 * an existing catalog id, a scanned barcode, or a free-text name.
 */
const addBody = z
  .object({
    foodReferenceId: z.string().optional(),
    barcode: z.string().optional(),
    name: z.string().optional(),
    quantity: z.number().positive(),
    unit: z.string().default('count'),
    category: z.string().nullish(),
    expirationDate: dateish,
    purchasedAt: dateish,
    storageLocation: z.enum(['pantry', 'fridge', 'freezer']).optional(),
    lowStockThreshold: z.number().nonnegative().nullish(),
    // only used when a brand-new catalog entry has to be created
    caloriesPerUnit: z.number().nonnegative().nullish(),
    servingSizeGrams: z.number().positive().nullish(),
  })
  .refine((body) => body.foodReferenceId || body.barcode || body.name, {
    message: 'Provide foodReferenceId, barcode, or name.',
  });

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  app.get('/', async (request) => {
    const query = request.query as { sort?: InventorySort; search?: string; includeDepleted?: string };
    const items = await listInventory(request.userId, {
      sort: query.sort ?? 'expiration',
      search: query.search,
      includeDepleted: query.includeDepleted === 'true',
    });
    return { items };
  });

  app.get('/expiring', async (request) => {
    const { days } = request.query as { days?: string };
    const window = Number(days) || undefined;
    const items = await expiringSoon(request.userId, window);
    return { days: window ?? env.expiryWarningDays, items };
  });

  /** Reconciliation: things the pantry claims you own but probably does not. */
  app.get('/stale', async (request) => {
    const { days } = request.query as { days?: string };
    return { items: await staleInventory(request.userId, Number(days) || 45) };
  });

  app.post('/', async (request, reply) => {
    const body = addBody.parse(request.body);

    let foodReferenceId = body.foodReferenceId;
    let resolvedFrom: 'catalog' | 'barcode' | 'name' = 'catalog';
    let createdFood = false;

    if (!foodReferenceId && body.barcode) {
      const result = await resolveBarcode(body.barcode);
      if (!result.ok) {
        return reply.code(result.reason === 'not_found' ? 404 : 502).send({
          error: result.reason,
          message: result.message,
          fallback: 'manual_entry',
        });
      }
      foodReferenceId = result.result.food.id;
      resolvedFrom = 'barcode';
      createdFood = !result.result.cached;
    }

    if (!foodReferenceId && body.name) {
      const result = await findOrCreateFoodByName({
        name: body.name,
        defaultUnit: body.unit,
        category: body.category ?? null,
        caloriesPerUnit: body.caloriesPerUnit ?? null,
        servingSizeGrams: body.servingSizeGrams ?? null,
      });
      foodReferenceId = result.food.id;
      resolvedFrom = 'name';
      createdFood = result.created;
    }

    if (!foodReferenceId) throw badRequest('Could not resolve the food to add.');

    // a category typed during manual entry fills a gap in the catalog entry
    if (body.category) {
      const food = await prisma.foodReference.findUnique({ where: { id: foodReferenceId } });
      if (food && !food.category) {
        await prisma.foodReference.update({ where: { id: food.id }, data: { category: body.category } });
      }
    }

    const added = await addInventoryItem(request.userId, {
      foodReferenceId,
      quantity: body.quantity,
      unit: body.unit,
      expirationDate: body.expirationDate ?? null,
      purchasedAt: body.purchasedAt ?? null,
      storageLocation: body.storageLocation,
      lowStockThreshold: body.lowStockThreshold ?? null,
    });

    return reply.code(201).send({
      item: added.item,
      resolvedFrom,
      createdFood,
      // the UI says "we guessed this date" rather than pretending to know
      expirationEstimated: added.expirationEstimated,
      estimatedFrom: added.estimatedFrom,
    });
  });

  app.patch('/:id', async (request) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({
        quantity: z.number().nonnegative().optional(),
        unit: z.string().optional(),
        expirationDate: dateish,
        storageLocation: z.enum(['pantry', 'fridge', 'freezer']).optional(),
        lowStockThreshold: z.number().nonnegative().nullish(),
      })
      .parse(request.body);
    return { item: await updateInventoryItem(request.userId, id, body) };
  });

  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await deleteInventoryItem(request.userId, id);
    return reply.code(204).send();
  });

  /** The core loop: log what you ate straight off an item you already own. */
  app.post('/:id/consume', async (request) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({
        quantity: z.number().positive().default(1),
        unit: z.string().optional(),
        mealSlot: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).default('snack'),
      })
      .parse(request.body ?? {});
    return {
      result: await consumeInventoryItem(request.userId, id, body.quantity, body.unit, body.mealSlot),
    };
  });

  /**
   * Food left the pantry but you did not eat it — a roommate did, it ran out,
   * or it went in the bin. Never touches your calorie diary.
   */
  app.post('/:id/remove', async (request) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({
        reason: z.enum(['other_person', 'used_up', 'wasted']),
        quantity: z.number().positive().optional(),
        unit: z.string().optional(),
      })
      .parse(request.body ?? {});
    return {
      result: await removeInventoryQuantity(
        request.userId,
        id,
        body.reason as RemovalReason,
        body.quantity,
        body.unit,
      ),
    };
  });

  /** Freeze it: moves the item and pushes the expiry date out. */
  app.post('/:id/freeze', async (request) => {
    const { id } = request.params as { id: string };
    return { item: await freezeInventoryItem(request.userId, id) };
  });

  app.get('/:id', async (request) => {
    const { id } = request.params as { id: string };
    const item = await prisma.inventoryItem.findFirst({
      where: { id, userId: request.userId },
      include: { foodReference: true },
    });
    if (!item) throw notFound('Inventory item not found.');
    const { toInventoryView } = await import('../services/inventory.js');
    return { item: await toInventoryView(item) };
  });
};

export default routes;
