import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { addToPlan, listPlan, planShortfall, removeFromPlan, syncPlanShopping } from '../services/mealPlan.js';
import { requirePlus } from '../services/plus.js';
import { frequentRecipes, rateRecipe } from '../services/history.js';
import { predictRunOut } from '../services/forecast.js';
import { dailyDigest } from '../services/digest.js';
import { listLeftovers } from '../services/leftovers.js';

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  /** The week planner is Pro, for now (the owner's call, 2026-10-02). */
  const planner = (userId: string) => requirePlus(userId, 'Planning the week is part of Pantry2Plate Pro.');
  const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

  /**
   * The days ahead, from the person's today unless `from` names another day,
   * with the shopping list brought in step with the plan and the pantry.
   */
  app.get('/plan', async (request) => {
    await planner(request.userId);
    const query = z.object({ days: z.coerce.number().int().min(1).max(28).default(7), from: day.optional() }).parse(request.query ?? {});
    const { toBuy } = await syncPlanShopping(request.userId);
    return { entries: await listPlan(request.userId, query.days, undefined, query.from), toBuy };
  });

  app.post('/plan', async (request, reply) => {
    await planner(request.userId);
    const body = z
      .object({
        recipeId: z.string().min(1),
        plannedFor: day,
        servings: z.number().int().positive().max(24).optional(),
        mealSlot: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).optional(),
      })
      .parse(request.body);
    const entry = await addToPlan(request.userId, body);
    const { toBuy } = await syncPlanShopping(request.userId);
    return reply.code(201).send({ entry, toBuy });
  });

  app.delete('/plan/:id', async (request) => {
    await planner(request.userId);
    const { id } = request.params as { id: string };
    await removeFromPlan(request.userId, id);
    return syncPlanShopping(request.userId);
  });

  /** One shop for the whole week, added up across meals. */
  app.get('/plan/shortfall', async (request) => {
    await planner(request.userId);
    const query = z.object({ days: z.coerce.number().int().min(1).max(28).default(7), from: day.optional() }).parse(request.query ?? {});
    return planShortfall(request.userId, query.days, undefined, query.from);
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
