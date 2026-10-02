import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError } from '../errors.js';
import { limit } from '../limits.js';
import { IdeaSchema, OrderSchema, SaveSchema, kitchenIdeas, kitchenRecipe, saveKitchenRecipe } from '../services/kitchen.js';

/**
 * Make me something. Each order costs a model call, so it is Pro only, with no
 * free tries (the owner's call, 2026-10-02), and orders are paced per network:
 * a dozen every ten minutes is far more than anyone cooks.
 */
const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', async (request) => {
    const user = await prisma.user.findUnique({ where: { id: request.userId }, select: { plusSince: true } });
    if (!user?.plusSince) throw new HttpError(403, 'Make me something is part of Pantry2Plate Pro.', 'plus_required');
  });

  /** An order in, three short ideas out. */
  app.post('/ideas', limit(12, '10 minutes'), async (request) => {
    const order = OrderSchema.parse(request.body ?? {});
    return kitchenIdeas(request.userId, order);
  });

  /** The full recipe for the idea that was picked. */
  app.post('/recipe', limit(24, '10 minutes'), async (request) => {
    const body = z.object({ order: OrderSchema, idea: IdeaSchema }).parse(request.body ?? {});
    return { recipe: await kitchenRecipe(request.userId, body.order, body.idea) };
  });

  /** Keep it in the person's own recipe book. */
  app.post('/save', limit(30, '10 minutes'), async (request, reply) => {
    const body = SaveSchema.parse(request.body ?? {});
    return reply.code(201).send({ recipe: await saveKitchenRecipe(request.userId, body) });
  });
};

export default routes;
