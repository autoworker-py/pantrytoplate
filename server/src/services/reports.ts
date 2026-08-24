/**
 * What food is leaving the house without being eaten.
 *
 * Deliberately counts items and amounts rather than money. Food prices move
 * constantly, vary by shop and by week, and we do not track receipts — so a
 * pound figure here would be a confident-looking guess. What you threw away and
 * how often is true, and is the number that changes behaviour anyway.
 */
import { prisma, type Tx } from '../db.js';
import { roundQuantity } from './units.js';

export interface WasteEntry {
  id: string;
  name: string;
  category: string | null;
  quantity: number;
  unit: string;
  reason: string;
  removedAt: string;
}

export async function wasteReport(userId: string, days = 30, db: Tx = prisma) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const removals = await db.inventoryRemoval.findMany({
    where: { userId, removedAt: { gte: since } },
    include: { foodReference: true },
    orderBy: { removedAt: 'desc' },
  });

  const wasted = removals.filter((r) => r.reason === 'wasted');

  const byFood = new Map<string, { name: string; quantity: number; unit: string; times: number }>();
  for (const removal of wasted) {
    const existing = byFood.get(removal.foodReferenceId);
    if (existing) {
      existing.quantity += removal.quantity;
      existing.times += 1;
    } else {
      byFood.set(removal.foodReferenceId, {
        name: removal.foodReference.name,
        quantity: removal.quantity,
        unit: removal.unit,
        times: 1,
      });
    }
  }

  const byCategory = new Map<string, number>();
  for (const removal of wasted) {
    const category = removal.foodReference.category ?? 'Other';
    byCategory.set(category, (byCategory.get(category) ?? 0) + 1);
  }

  /** wasted items per week, so "getting better or worse" is answerable */
  const weeks = Math.max(1, days / 7);

  return {
    days,
    wastedItems: wasted.length,
    perWeek: Math.round((wasted.length / weeks) * 10) / 10,
    /** how many of everything that left the pantry was binned */
    shareOfRemovals: removals.length === 0 ? 0 : Math.round((wasted.length / removals.length) * 100),
    topWasted: [...byFood.values()]
      .sort((a, b) => b.times - a.times || b.quantity - a.quantity)
      .slice(0, 5)
      .map((entry) => ({
        name: entry.name,
        quantity: roundQuantity(entry.quantity),
        unit: entry.unit,
        times: entry.times,
      })),
    byCategory: [...byCategory.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count),
    byReason: {
      wasted: wasted.length,
      other_person: removals.filter((r) => r.reason === 'other_person').length,
      used_up: removals.filter((r) => r.reason === 'used_up').length,
    },
  };
}

/** The full log: every item that left the pantry, newest first. */
export async function wasteLog(
  userId: string,
  options: { days?: number; reason?: string; limit?: number } = {},
  db: Tx = prisma,
): Promise<WasteEntry[]> {
  const since = new Date();
  since.setDate(since.getDate() - (options.days ?? 90));

  const removals = await db.inventoryRemoval.findMany({
    where: {
      userId,
      removedAt: { gte: since },
      ...(options.reason ? { reason: options.reason } : {}),
    },
    include: { foodReference: true },
    orderBy: { removedAt: 'desc' },
    take: options.limit ?? 200,
  });

  return removals.map((removal) => ({
    id: removal.id,
    name: removal.foodReference.name,
    category: removal.foodReference.category,
    quantity: roundQuantity(removal.quantity),
    unit: removal.unit,
    reason: removal.reason,
    removedAt: removal.removedAt.toISOString(),
  }));
}

/**
 * Things you bin again and again.
 *
 * One wasted bunch of coriander is life. Four is a buying habit, and that is
 * something you can act on — buy the smaller bunch, or stop buying it.
 */
export async function wastePatterns(userId: string, db: Tx = prisma) {
  const since = new Date();
  since.setDate(since.getDate() - 120);

  const removals = await db.inventoryRemoval.findMany({
    where: { userId, reason: 'wasted', removedAt: { gte: since } },
    include: { foodReference: true },
  });

  const byFood = new Map<string, { name: string; times: number; last: Date }>();
  for (const removal of removals) {
    const existing = byFood.get(removal.foodReferenceId);
    if (existing) {
      existing.times += 1;
      if (removal.removedAt > existing.last) existing.last = removal.removedAt;
    } else {
      byFood.set(removal.foodReferenceId, {
        name: removal.foodReference.name,
        times: 1,
        last: removal.removedAt,
      });
    }
  }

  return [...byFood.values()]
    .filter((entry) => entry.times >= 2)
    .sort((a, b) => b.times - a.times)
    .slice(0, 5)
    .map((entry) => ({
      name: entry.name,
      times: entry.times,
      lastWasted: entry.last.toISOString(),
      suggestion:
        entry.times >= 4
          ? `You have binned ${entry.name} ${entry.times} times. Buy a smaller amount, or skip it.`
          : `${entry.name} has gone off ${entry.times} times — try freezing it next time.`,
    }));
}

/** This month against last, so the number means something. */
export async function wasteTrend(userId: string, db: Tx = prisma) {
  const now = new Date();
  const thisPeriodStart = new Date(now);
  thisPeriodStart.setDate(thisPeriodStart.getDate() - 30);
  const lastPeriodStart = new Date(now);
  lastPeriodStart.setDate(lastPeriodStart.getDate() - 60);

  const [current, previous] = await Promise.all([
    db.inventoryRemoval.count({ where: { userId, reason: 'wasted', removedAt: { gte: thisPeriodStart } } }),
    db.inventoryRemoval.count({
      where: { userId, reason: 'wasted', removedAt: { gte: lastPeriodStart, lt: thisPeriodStart } },
    }),
  ]);

  return {
    current,
    previous,
    change: current - previous,
    direction: current < previous ? 'better' : current > previous ? 'worse' : 'same',
    /** only meaningful once there is something to compare against */
    comparable: previous > 0 || current > 0,
  };
}
