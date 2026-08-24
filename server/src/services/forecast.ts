/**
 * "You will run out of milk on Thursday."
 *
 * Every decrement has been recorded since the day the pantry was set up, which
 * is enough to know how fast a household actually gets through things. That
 * turns the shopping list from a record of what already ran out into a warning
 * about what is about to — the difference between a list that documents a
 * problem and one that prevents a second trip.
 *
 * Deliberately conservative: a rate from two data points is a coincidence, not a
 * pattern, so nothing is predicted until there is enough history to mean it.
 */
import { prisma, type Tx } from '../db.js';
import { convert } from './units.js';
import { loadConvertContexts } from './conversions.js';
import { roundQuantity } from './units.js';

/** Below this many separate uses we do not claim to know your habits. */
const MIN_EVENTS = 3;
/** How far back to look. Older than this says more about last month than now. */
const WINDOW_DAYS = 60;
/** Only warn about things running out within this horizon. */
const HORIZON_DAYS = 14;

export interface RunOutPrediction {
  foodReferenceId: string;
  name: string;
  /** what is left, in the unit it is stored in */
  remaining: number;
  unit: string;
  /** typical use per day, same unit */
  perDay: number;
  daysLeft: number;
  runsOutOn: string;
  /** how many separate uses this is based on */
  basedOn: number;
  alreadyOnList: boolean;
}

export async function predictRunOut(
  userId: string,
  db: Tx = prisma,
  horizonDays = HORIZON_DAYS,
): Promise<RunOutPrediction[]> {
  const since = new Date();
  since.setDate(since.getDate() - WINDOW_DAYS);

  const [logs, removals, lots, listed] = await Promise.all([
    db.consumptionLog.findMany({
      where: { userId, consumedAt: { gte: since } },
      select: { foodReferenceId: true, quantityConsumed: true, unit: true, consumedAt: true },
    }),
    db.inventoryRemoval.findMany({
      where: { userId, removedAt: { gte: since }, reason: { in: ['other_person', 'used_up'] } },
      select: { foodReferenceId: true, quantity: true, unit: true, removedAt: true },
    }),
    db.inventoryItem.findMany({
      where: { userId, quantity: { gt: 0 } },
      include: { foodReference: true },
    }),
    db.shoppingListItem.findMany({ where: { userId, isChecked: false }, select: { foodReferenceId: true } }),
  ]);

  const onList = new Set(listed.map((item) => item.foodReferenceId).filter(Boolean) as string[]);

  // group what is left by the generic ingredient, so brands of the same thing add up
  const stock = new Map<string, { name: string; unit: string; quantity: number; foodIds: string[] }>();
  for (const lot of lots) {
    if (lot.isLeftover) continue; // leftovers are one-offs, not a habit
    const key = lot.foodReference.canonicalId ?? lot.foodReferenceId;
    const existing = stock.get(key);
    if (existing && existing.unit === lot.unit) {
      existing.quantity += lot.quantity;
      existing.foodIds.push(lot.foodReferenceId);
    } else if (!existing) {
      stock.set(key, {
        name: lot.foodReference.canonicalId ? lot.foodReference.name : lot.foodReference.name,
        unit: lot.unit,
        quantity: lot.quantity,
        foodIds: [lot.foodReferenceId],
      });
    }
  }

  // and group past use the same way
  const uses = new Map<string, Array<{ quantity: number; unit: string; at: Date }>>();
  const add = (foodId: string, quantity: number, unit: string, at: Date) => {
    uses.set(foodId, [...(uses.get(foodId) ?? []), { quantity, unit, at }]);
  };
  for (const log of logs) add(log.foodReferenceId, log.quantityConsumed, log.unit, log.consumedAt);
  for (const removal of removals) add(removal.foodReferenceId, removal.quantity, removal.unit, removal.removedAt);

  const canonicalOf = new Map(lots.map((lot) => [lot.foodReferenceId, lot.foodReference.canonicalId ?? lot.foodReferenceId]));
  const contexts = await loadConvertContexts(
    lots.map((lot) => lot.foodReference),
    db,
  );

  const predictions: RunOutPrediction[] = [];

  for (const [ingredientId, held] of stock) {
    // every use of this ingredient, whichever brand it was
    const events = [...uses.entries()]
      .filter(([foodId]) => (canonicalOf.get(foodId) ?? foodId) === ingredientId)
      .flatMap(([foodId, list]) => list.map((event) => ({ ...event, foodId })));

    if (events.length < MIN_EVENTS) continue;

    let used = 0;
    let convertible = 0;
    for (const event of events) {
      const ctx = contexts.get(event.foodId) ?? contexts.get(held.foodIds[0] ?? '') ?? {};
      const converted = convert(event.quantity, event.unit, held.unit, ctx);
      if (!converted.ok) continue;
      used += converted.value;
      convertible += 1;
    }
    if (convertible < MIN_EVENTS || used <= 0) continue;

    // measure the rate over the span actually observed, not the whole window —
    // someone who started using the app last week has a week of history
    const times = events.map((event) => event.at.getTime());
    const spanDays = Math.max(1, (Date.now() - Math.min(...times)) / 86_400_000);
    const perDay = used / spanDays;
    if (perDay <= 0) continue;

    const daysLeft = held.quantity / perDay;
    if (daysLeft > horizonDays) continue;

    const runsOut = new Date();
    runsOut.setDate(runsOut.getDate() + Math.floor(daysLeft));

    predictions.push({
      foodReferenceId: ingredientId,
      name: held.name,
      remaining: roundQuantity(held.quantity),
      unit: held.unit,
      perDay: roundQuantity(perDay),
      daysLeft: Math.max(0, Math.floor(daysLeft)),
      runsOutOn: runsOut.toISOString(),
      basedOn: convertible,
      alreadyOnList: onList.has(ingredientId),
    });
  }

  return predictions.sort((a, b) => a.daysLeft - b.daysLeft);
}
