import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { limit } from '../limits.js';
import { drinkWater, unDrinkWater, waterDay } from '../services/water.js';

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  /** A day's water: how much, the goal, and each glass. */
  app.get('/day', async (request) => {
    const { date } = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).parse(request.query ?? {});
    return waterDay(request.userId, date);
  });

  /** A glass, a bottle, or any amount up to two litres at once. */
  app.post('/', limit(120, '10 minutes'), async (request, reply) => {
    const { ml } = z.object({ ml: z.number().min(25).max(2000) }).parse(request.body);
    return reply.code(201).send(await drinkWater(request.userId, ml));
  });

  /** Take one back. */
  app.delete('/:id', async (request) => {
    const { id } = request.params as { id: string };
    return unDrinkWater(request.userId, id);
  });
};

export default routes;
