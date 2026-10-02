/**
 * Insights: things the diary can tell a person about themselves, worked out on
 * request from what they logged. The sleep side of "late meals and sleep" is
 * worked out on the phone, from Apple Health, which never comes here; this
 * sends the meal side (when the day's last food was eaten).
 */
import { prisma } from '../db.js';
import { addDays, dayStart, localDay, localMinutes } from '../zone.js';
import { MEAL_SLOTS } from './diary.js';
import { foodPoints, mixedGrade } from './healthScore.js';
import { pantryOf } from './household.js';

export async function insights(userId: string, days = 30) {
  const today = localDay(new Date());
  const from = dayStart(addDays(today, -days));
  const before = dayStart(addDays(today, -2 * days));
  const [logs, earlier, pantry, wasted] = await Promise.all([
    prisma.consumptionLog.findMany({ where: { userId, consumedAt: { gte: from } }, include: { foodReference: true, recipe: true }, orderBy: { consumedAt: 'asc' } }),
    prisma.consumptionLog.findMany({ where: { userId, consumedAt: { gte: before, lt: from } }, include: { foodReference: true } }),
    prisma.inventoryItem.findMany({ where: { userId: await pantryOf(userId), quantity: { gt: 0 } }, include: { foodReference: true } }),
    prisma.inventoryRemoval.findMany({ where: { userId, reason: 'wasted', removedAt: { gte: before } }, select: { removedAt: true } }),
  ]);

  // when each meal is eaten: its first bite each day, averaged; and each day's last food
  const firstBite = new Map<string, number>();
  const lastFood = new Map<string, number>();
  for (const log of logs) {
    const day = localDay(log.consumedAt);
    const minutes = localMinutes(log.consumedAt);
    const key = `${log.mealSlot}|${day}`;
    if (!firstBite.has(key) || minutes < firstBite.get(key)!) firstBite.set(key, minutes);
    if (!lastFood.has(day) || minutes > lastFood.get(day)!) lastFood.set(day, minutes);
  }
  const mealTimes = MEAL_SLOTS.map((slot) => {
    const times = [...firstBite].filter(([key]) => key.startsWith(`${slot}|`)).map(([, minutes]) => minutes);
    return { slot, minutes: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null, days: times.length };
  });

  // what is eaten most: a cooked or snapped meal counts once, by its name
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  for (const log of logs) {
    if (log.cookEventId) {
      if (seen.has(log.cookEventId)) continue;
      seen.add(log.cookEventId);
    }
    const name = log.cookEventId ? log.recipe?.name ?? log.mealName ?? log.foodReference.name : log.foodReference.name;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const topFoods = [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, times]) => ({ name, times }));

  // protein at each meal, on the days that meal was eaten
  const proteinByMeal = MEAL_SLOTS.map((slot) => {
    const theirs = logs.filter((log) => log.mealSlot === slot);
    const mealDays = new Set(theirs.map((log) => localDay(log.consumedAt))).size;
    const grams = theirs.reduce((sum, log) => sum + (log.proteinGrams ?? 0), 0);
    return { slot, grams: mealDays ? Math.round(grams / mealDays) : null };
  });

  const graded = (rows: Array<{ calories: number | null; foodReference: Parameters<typeof foodPoints>[0] }>) =>
    mixedGrade(rows.map((row) => ({ points: foodPoints(row.foodReference), weight: row.calories })));

  return {
    days,
    mealTimes,
    lastMeals: [...lastFood].map(([day, minutes]) => ({ day, minutes })),
    topFoods,
    proteinByMeal,
    grade: {
      now: graded(logs),
      before: graded(earlier),
      // what is on the shelves, each thing counting once
      pantry: mixedGrade(pantry.map((item) => ({ points: foodPoints(item.foodReference), weight: 1 }))),
    },
    waste: {
      now: wasted.filter((w) => w.removedAt >= from).length,
      before: wasted.filter((w) => w.removedAt < from).length,
    },
  };
}
