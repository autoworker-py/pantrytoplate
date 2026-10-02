/**
 * Water: a glass or a bottle at a time, against a daily goal. Days are the
 * person's own calendar days, like the diary's.
 */
import { prisma, type Tx } from '../db.js';
import { notFound } from '../errors.js';
import { addDays, dayStart, localDay } from '../zone.js';

export async function waterDay(userId: string, day = localDay(new Date()), db: Tx = prisma) {
  const [logs, user] = await Promise.all([
    db.waterLog.findMany({
      where: { userId, loggedAt: { gte: dayStart(day), lt: dayStart(addDays(day, 1)) } },
      orderBy: { loggedAt: 'desc' },
    }),
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { waterGoalMl: true } }),
  ]);
  return {
    date: day,
    ml: logs.reduce((sum, log) => sum + log.ml, 0),
    goalMl: user.waterGoalMl,
    entries: logs.map((log) => ({ id: log.id, ml: log.ml, at: log.loggedAt.toISOString() })),
  };
}

export async function drinkWater(userId: string, ml: number, db: Tx = prisma) {
  const entry = await db.waterLog.create({ data: { userId, ml: Math.round(ml) } });
  return { entry: { id: entry.id, ml: entry.ml, at: entry.loggedAt.toISOString() }, day: await waterDay(userId, undefined, db) };
}

export async function unDrinkWater(userId: string, id: string, db: Tx = prisma) {
  const { count } = await db.waterLog.deleteMany({ where: { id, userId } });
  if (count === 0) throw notFound('That glass is not in your day.');
  return waterDay(userId, undefined, db);
}
