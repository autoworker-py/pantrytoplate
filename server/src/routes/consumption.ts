import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { calorieHistory, dailySummary, eatLess, entryDetail, saveRest, undoEntry, undoSaveRest } from '../services/diary.js';
import { logEatOutMeal, logEatingOut, recentEatingOut, searchEatOutFoods } from '../services/eatingOut.js';
import { localDay } from '../zone.js';
import { maybeAdapt } from '../services/body.js';

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
    // once a week, a goal's target is worked out again from the diary and the weigh-ins
    await maybeAdapt(request.userId).catch((error) => request.log.warn({ err: error }, 'adapting the target failed'));
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

  /** A plate eaten out, item by item under one name: what Snap a meal logs. */
  app.post('/eat-out/meal', async (request, reply) => {
    const amount = z.number().min(0).max(100000).nullish();
    const body = z
      .object({
        name: z.string().trim().min(1).max(120),
        mealSlot: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).default('snack'),
        items: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(80),
              grams: z.number().min(0).max(5000).default(0),
              calories: z.number().min(0).max(10000),
              protein: z.number().min(0).max(1000).default(0),
              carbs: z.number().min(0).max(1000).default(0),
              fat: z.number().min(0).max(1000).default(0),
              fiber: amount,
              sugar: amount,
              satFat: amount,
              sodium: amount,
            }),
          )
          .min(1)
          .max(20),
      })
      .parse(request.body);
    return reply.code(201).send({ meal: await logEatOutMeal(request.userId, body) });
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
    const body = z.object({ ate: z.number().gt(0).lt(1), rest: z.enum(['keep', 'bin']).default('keep') }).parse(request.body);
    return { result: await saveRest(request.userId, id, body.ate, body.rest) };
  });

  app.post('/:id/save-rest/undo', async (request) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({ ate: z.number().gt(0).lt(1), leftoverItemId: z.string().nullish(), binnedId: z.string().nullish() })
      .parse(request.body);
    return { result: await undoSaveRest(request.userId, id, body.ate, body.leftoverItemId, body.binnedId) };
  });

  /** One line of a meal eaten out: how much of it was eaten, and whether the rest went home or in the bin. */
  app.post('/:id/eat-less', async (request) => {
    const { id } = request.params as { id: string };
    const body = z.object({ ate: z.number().min(0).max(1), rest: z.enum(['pantry', 'bin']).default('pantry') }).parse(request.body);
    return { result: await eatLess(request.userId, id, body.ate, body.rest) };
  });

  app.delete('/:id', async (request) => {
    const { id } = request.params as { id: string };
    return { result: await undoEntry(request.userId, id) };
  });
};

export default routes;
