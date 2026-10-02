import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { limit } from '../limits.js';
import { houseFor, housemates, inviteCode, joinHouse, leaveHouse, removeMember } from '../services/household.js';
import { syncPlanShopping } from '../services/mealPlan.js';

/** Planned meals follow the list they now share (or no longer do); never worth failing the change over. */
const resync = (...people: Array<string | undefined>) =>
  Promise.all(people.filter((id): id is string => Boolean(id)).map((id) => syncPlanShopping(id).catch(() => undefined)));

/** Housemates: one pantry and list, everything else each person's own. */
const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  app.get('/', async (request) => houseFor(request.userId));

  /** A code for one person to join, good for two days. */
  app.post('/invite', limit(10, '1 hour'), async (request, reply) => reply.code(201).send(await inviteCode(request.userId)));

  /** Codes are guessed slowly or not at all. */
  app.post('/join', limit(10, '15 minutes'), async (request) => {
    const { code } = z.object({ code: z.string().trim().min(6).max(12) }).parse(request.body);
    const joined = await joinHouse(request.userId, code);
    await resync(request.userId);
    return joined;
  });

  app.post('/leave', async (request) => {
    const before = await housemates(request.userId);
    const left = await leaveHouse(request.userId);
    await resync(request.userId, before.find((id) => id !== request.userId));
    return left;
  });

  app.post('/remove', async (request) => {
    const { userId } = z.object({ userId: z.string().min(1) }).parse(request.body);
    const removed = await removeMember(request.userId, userId);
    await resync(request.userId, userId);
    return removed;
  });
};

export default routes;
