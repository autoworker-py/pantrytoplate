import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { localDay } from '../zone.js';
import { planGoal } from '../services/energy.js';
import { clearGoal, deleteWeight, logWeight, setGoal, weightHistory } from '../services/body.js';
import { prisma } from '../db.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Weigh-ins and the goal they head for. */
const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  app.get('/weight', async (request) => {
    const { days } = z.object({ days: z.coerce.number().int().min(7).max(365).default(90) }).parse(request.query ?? {});
    return weightHistory(request.userId, days);
  });

  /** Today's weigh-in, or a day's; the same day again replaces it. Kilograms. */
  app.post('/weight', async (request, reply) => {
    const body = z.object({ kg: z.number().min(25).max(350), day: day.optional() }).parse(request.body);
    return reply.code(201).send(await logWeight(request.userId, body.kg, body.day));
  });

  app.delete('/weight/:day', async (request) => {
    const { day: which } = z.object({ day }).parse(request.params);
    return deleteWeight(request.userId, which);
  });

  /** What a goal would mean, before it is set: the pace, or why not. */
  app.post('/goal/preview', async (request) => {
    const body = z.object({ weightKg: z.number().min(25).max(350), date: day }).parse(request.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: request.userId }, select: { weightKg: true, heightCm: true, birthYear: true } });
    if (!user.weightKg) return { plan: null };
    return { plan: planGoal({ weightKg: user.weightKg, goalWeightKg: body.weightKg, goalDate: body.date, today: localDay(new Date()), heightCm: user.heightCm, birthYear: user.birthYear }) };
  });

  app.put('/goal', async (request) => {
    const body = z.object({ weightKg: z.number().min(25).max(350), date: day }).parse(request.body);
    return setGoal(request.userId, body.weightKg, body.date);
  });

  app.delete('/goal', async (request, reply) => {
    await clearGoal(request.userId);
    return reply.code(204).send();
  });
};

export default routes;
