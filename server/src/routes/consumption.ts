import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { calorieHistory, dailySummary, entryDetail, undoEntry } from '../services/diary.js';
import { logEatingOut, recentEatingOut, searchEatOutFoods } from '../services/eatingOut.js';

/**
 * A bare "2026-08-21" is a calendar day, not an instant. `new Date()` would read
 * it as midnight UTC, which lands on the previous day for anyone west of
 * Greenwich — so anchor it at local noon instead.
 */
function parseDayParam(value: string | undefined): Date {
  if (!value) return new Date();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T12:00:00`);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  /** Today's diary: entries by meal, calories, macros, targets. */
  app.get('/today', async (request) => {
    const { date } = request.query as { date?: string };
    return dailySummary(request.userId, parseDayParam(date));
  });

  app.get('/history', async (request) => {
    const { days } = request.query as { days?: string };
    return { days: await calorieHistory(request.userId, Number(days) || 7) };
  });

  /** Recents for the eating-out flow — must come before the /:id route. */
  app.get('/eat-out/recent', async (request) => ({
    recent: await recentEatingOut(request.userId),
  }));

  app.get('/eat-out/search', async (request) => {
    const { q } = request.query as { q?: string };
    if (!q?.trim()) return { results: [] };
    return { results: await searchEatOutFoods(q) };
  });

  /**
   * Ate out: calories with no pantry involvement. A Costco hot dog was never
   * inventory, so logging it must not create something to delete later.
   */
  app.post('/eat-out', async (request, reply) => {
    const body = z
      .object({
        foodReferenceId: z.string().optional(),
        name: z.string().optional(),
        quantity: z.number().positive().default(1),
        unit: z.string().optional(),
        mealSlot: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).default('snack'),
        calories: z.number().nonnegative().nullish(),
        protein: z.number().nonnegative().nullish(),
        carbs: z.number().nonnegative().nullish(),
        fat: z.number().nonnegative().nullish(),
      })
      .parse(request.body);

    return reply.code(201).send({ entry: await logEatingOut(request.userId, body) });
  });

  /** One entry, broken down — including every ingredient of a cooked meal. */
  app.get('/:id', async (request) => {
    const { id } = request.params as { id: string };
    return { entry: await entryDetail(request.userId, id) };
  });

  /** Undo: removes the entry and puts the food back in the pantry. */
  app.delete('/:id', async (request) => {
    const { id } = request.params as { id: string };
    return { result: await undoEntry(request.userId, id) };
  });
};

export default routes;
