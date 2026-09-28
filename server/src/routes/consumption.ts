import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { calorieHistory, dailySummary, entryDetail, saveRest, undoEntry, undoSaveRest } from '../services/diary.js';
import { logEatingOut, recentEatingOut, searchEatOutFoods } from '../services/eatingOut.js';
import { localDay } from '../zone.js';

/**
 * The day asked for, on the person's calendar. A bare "2026-08-21" is that day
 * where they are, not midnight UTC; an instant is whichever day it falls on there.
 */
function parseDayParam(value: string | undefined): string {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = value ? new Date(value) : new Date();
  return localDay(Number.isNaN(parsed.getTime()) ? new Date() : parsed);
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
    return { days: await calorieHistory(request.userId, Math.min(Number(days) || 7, 366)) };
  });

  /** Recents for the eating-out flow — must come before the /:id route. */
  app.get('/eat-out/recent', async (request) => ({
    recent: await recentEatingOut(request.userId),
  }));

  app.get('/eat-out/search', async (request) => {
    const { q } = request.query as { q?: string };
    if (!q?.trim()) return { results: [] };
    return { results: await searchEatOutFoods(q, 12, undefined, request.userId) };
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
  /** "I only ate half": the rest becomes leftovers, or goes back to the pantry */
  app.post('/:id/save-rest', async (request) => {
    const { id } = request.params as { id: string };
    const { ate } = z.object({ ate: z.number().gt(0).lt(1) }).parse(request.body);
    return { result: await saveRest(request.userId, id, ate) };
  });

  app.post('/:id/save-rest/undo', async (request) => {
    const { id } = request.params as { id: string };
    const body = z.object({ ate: z.number().gt(0).lt(1), leftoverItemId: z.string().nullish() }).parse(request.body);
    return { result: await undoSaveRest(request.userId, id, body.ate, body.leftoverItemId) };
  });

  app.delete('/:id', async (request) => {
    const { id } = request.params as { id: string };
    return { result: await undoEntry(request.userId, id) };
  });
};

export default routes;
