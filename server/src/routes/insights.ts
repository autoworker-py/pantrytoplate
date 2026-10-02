import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { insights } from '../services/insights.js';

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  /** What the last month (or so) of the diary says. */
  app.get('/', async (request) => {
    const { days } = z.object({ days: z.coerce.number().int().min(7).max(90).default(30) }).parse(request.query ?? {});
    return insights(request.userId, days);
  });
};

export default routes;
