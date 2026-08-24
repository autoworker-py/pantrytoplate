import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { addToPlan, listPlan, planShortfall, removeFromPlan } from '../services/mealPlan.js';
import { frequentRecipes, rateRecipe } from '../services/history.js';
import { predictRunOut } from '../services/forecast.js';
import { dailyDigest } from '../services/digest.js';
import { listLeftovers } from '../services/leftovers.js';

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  /** The week ahead. */
  app.get('/plan', async (request) => {
    const { days } = request.query as { days?: string };
    return { entries: await listPlan(request.userId, Number(days) || 7) };
  });

  app.post('/plan', async (request, reply) => {
    const body = z
      .object({
        recipeId: z.string().min(1),
        plannedFor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        servings: z.number().int().positive().optional(),
        mealSlot: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).optional(),
      })
      .parse(request.body);
    return reply.code(201).send({ entry: await addToPlan(request.userId, body) });
  });

  app.delete('/plan/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await removeFromPlan(request.userId, id);
    return reply.code(204).send();
  });

  /** One shop for the whole week, added up across meals. */
  app.get('/plan/shortfall', async (request) => {
    const { days } = request.query as { days?: string };
    return planShortfall(request.userId, Number(days) || 7);
  });

  /** Things you keep cooking, for one-tap repeats. */
  app.get('/frequent', async (request) => ({
    recipes: await frequentRecipes(request.userId, 8),
  }));

  app.put('/ratings/:recipeId', async (request) => {
    const { recipeId } = request.params as { recipeId: string };
    const body = z.object({ rating: z.number().min(1).max(5), note: z.string().nullish() }).parse(request.body);
    return { rating: await rateRecipe(request.userId, recipeId, body.rating, body.note) };
  });

  /** What you are about to run out of, from how fast you actually use things. */
  app.get('/run-out', async (request) => {
    const { days } = request.query as { days?: string };
    return { predictions: await predictRunOut(request.userId, undefined, Number(days) || 14) };
  });

  /** The one message worth interrupting someone for. */
  app.get('/digest', async (request) => dailyDigest(request.userId));

  /** Portions of things you cooked, sitting in the fridge. */
  app.get('/leftovers', async (request) => ({ leftovers: await listLeftovers(request.userId) }));
};

export default routes;
