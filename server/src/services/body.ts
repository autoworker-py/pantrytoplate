/**
 * Weight, a goal by a date, and a calorie target that learns.
 *
 * Weigh-ins are noisy: water and salt move the scale a kilo either way in a
 * day. So the app follows a smoothed trend (each weigh-in moves it a tenth of
 * the way, the Hacker's Diet way) and talks about that, not the day's number.
 *
 * The target starts from the formula (energy.ts). Once there are three weeks of
 * diary and weigh-ins, what the person actually burns can be read off them: what
 * they ate, less what the trend says they stored or lost. Each week the target
 * is worked out again from that, so it follows the person rather than the
 * formula's guess about them. A target the person set themselves is left alone.
 */
import { prisma, type Tx } from '../db.js';
import { badRequest, HttpError } from '../errors.js';
import { addDays, localDay } from '../zone.js';
import { estimateEnergy, planGoal } from './energy.js';

const KCAL_PER_KG = 7700;
/** how far each weigh-in moves the trend */
const TREND_STEP = 0.1;
/** the window the expenditure is read over, and what it needs to be trusted */
const WINDOW_DAYS = 21;
const MIN_LOGGED_DAYS = 12;
const MIN_WEIGH_INS = 3;
/** a day with less than this logged is a day not fully logged, so it is left out */
const LOGGED_DAY_KCAL = 800;
const ADAPT_EVERY_DAYS = 7;

const dayNumber = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000);

/** The trend through a run of weigh-ins, one point a day from the first to the last. */
export function trendOf(weighIns: Array<{ day: string; kg: number }>): Array<{ day: string; kg: number }> {
  const sorted = [...weighIns].sort((a, b) => a.day.localeCompare(b.day));
  if (!sorted.length) return [];
  const byDay = new Map(sorted.map((w) => [w.day, w.kg]));
  const out: Array<{ day: string; kg: number }> = [];
  let trend = sorted[0]!.kg;
  for (let day = sorted[0]!.day; day <= sorted[sorted.length - 1]!.day; day = addDays(day, 1)) {
    const kg = byDay.get(day);
    if (kg !== undefined) trend += TREND_STEP * (kg - trend);
    out.push({ day, kg: Math.round(trend * 100) / 100 });
  }
  return out;
}

export async function weightHistory(userId: string, days = 90, db: Tx = prisma) {
  const today = localDay(new Date());
  // the trend needs the weigh-ins before the window too, or it starts cold
  const logs = await db.weightLog.findMany({ where: { userId, day: { gte: addDays(today, -(days + 60)) } }, orderBy: { day: 'asc' } });
  const trend = trendOf(logs);
  const from = addDays(today, -days);
  const at = (day: string) => [...trend].reverse().find((point) => point.day <= day)?.kg ?? null;
  const latest = logs[logs.length - 1] ?? null;
  const now = at(today);
  const weekAgo = at(addDays(today, -7));
  return {
    entries: logs.filter((log) => log.day >= from).map((log) => ({ day: log.day, kg: log.kg })),
    trend: trend.filter((point) => point.day >= from),
    latest: latest ? { day: latest.day, kg: latest.kg } : null,
    trendKg: now,
    weekChangeKg: now !== null && weekAgo !== null ? Math.round((now - weekAgo) * 100) / 100 : null,
  };
}

/** A weigh-in for a day (today unless said), replacing that day's; the latest becomes the weight on file. */
export async function logWeight(userId: string, kg: number, day = localDay(new Date())) {
  if (!(kg >= 25 && kg <= 350)) throw badRequest('That weight is outside what the app can use.');
  if (day > localDay(new Date())) throw badRequest('A weigh-in can’t be in the future.');
  await prisma.weightLog.upsert({ where: { userId_day: { userId, day } }, create: { userId, day, kg }, update: { kg, loggedAt: new Date() } });
  const latest = await prisma.weightLog.findFirst({ where: { userId }, orderBy: { day: 'desc' } });
  if (latest) await prisma.user.update({ where: { id: userId }, data: { weightKg: latest.kg } });
  await refreshTargets(userId);
  return weightHistory(userId);
}

export async function deleteWeight(userId: string, day: string) {
  await prisma.weightLog.deleteMany({ where: { userId, day } });
  const latest = await prisma.weightLog.findFirst({ where: { userId }, orderBy: { day: 'desc' } });
  if (latest) await prisma.user.update({ where: { id: userId }, data: { weightKg: latest.kg } });
  await refreshTargets(userId);
  return weightHistory(userId);
}

/**
 * The target, worked out again: from the goal (what is left to go, by when,
 * never faster than safe), the body on file, and the expenditure the diary has
 * shown when there is one. A target the person set is theirs and stays.
 */
export async function refreshTargets(userId: string, db: Tx = prisma) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.targetSetBy === 'person') return null;

  let weightGoal = user.weightGoal;
  let weeklyRateKg = user.weeklyRateKg;
  if (user.goalWeightKg !== null && user.goalDate && user.weightKg) {
    const plan = planGoal({
      weightKg: user.weightKg,
      goalWeightKg: user.goalWeightKg,
      goalDate: user.goalDate,
      today: localDay(new Date()),
      heightCm: user.heightCm,
      birthYear: user.birthYear,
    });
    weightGoal = plan.direction;
    // behind schedule, or the date passed: the safe pace, not a chase
    const safest = plan.direction === 'lose' ? Math.min(1, user.weightKg * 0.01) : user.weightKg * 0.005;
    weeklyRateKg = plan.direction === 'maintain' ? 0 : plan.ok ? plan.weeklyRateKg : plan.problem === 'too_fast' || plan.problem === 'too_soon' ? safest : 0;
    if (!plan.ok && plan.problem !== 'too_fast' && plan.problem !== 'too_soon') weightGoal = 'maintain';
  }

  const estimate = estimateEnergy({ ...user, weightGoal, weeklyRateKg, tdee: user.adaptedTdee });
  if (!estimate) {
    await db.user.update({ where: { id: userId }, data: { weightGoal, weeklyRateKg } });
    return null;
  }
  await db.user.update({
    where: { id: userId },
    data: {
      weightGoal,
      weeklyRateKg,
      dailyCalorieTarget: estimate.target,
      proteinTargetGrams: estimate.protein,
      carbsTargetGrams: estimate.carbs,
      fatTargetGrams: estimate.fat,
    },
  });
  return estimate;
}

/** A goal weight by a date: checked for safety, then the target follows it. */
export async function setGoal(userId: string, goalWeightKg: number, goalDate: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.weightKg) throw badRequest('Add your current weight first, so the app knows how far the goal is.', 'weight_needed');
  const plan = planGoal({ weightKg: user.weightKg, goalWeightKg, goalDate, today: localDay(new Date()), heightCm: user.heightCm, birthYear: user.birthYear });
  if (!plan.ok) {
    const message =
      plan.problem === 'too_fast'
        ? `That is ${plan.weeklyRateKg} kg a week, faster than is safe. The earliest safe date is ${plan.earliestSafeDate}.`
        : plan.problem === 'below_healthy'
          ? `That is under a healthy weight for your height. The lowest goal the app will set is ${plan.lowestGoalKg} kg.`
          : plan.problem === 'too_young'
            ? 'Weight-loss goals are for adults. A doctor can help set one safely.'
            : 'Pick a date at least a week away.';
    throw new HttpError(400, message, `goal_${plan.problem}`, { plan });
  }
  await prisma.user.update({ where: { id: userId }, data: { goalWeightKg, goalDate, targetSetBy: 'app' } });
  await refreshTargets(userId);
  return { plan, settings: await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { dailyCalorieTarget: true } }) };
}

export async function clearGoal(userId: string) {
  await prisma.user.update({ where: { id: userId }, data: { goalWeightKg: null, goalDate: null, weightGoal: 'maintain', weeklyRateKg: null } });
  await refreshTargets(userId);
}

/**
 * What the person actually burns, read off the last three weeks: the calories
 * they logged, less what the weight trend says went into (or came out of)
 * storage. Null until there are enough logged days and weigh-ins to trust it.
 * It is blended with the formula by how much there is to go on, and kept
 * within a sensible distance of it, so one odd fortnight can't swing it far.
 */
export async function observeTdee(userId: string, db: Tx = prisma) {
  const today = localDay(new Date());
  const start = addDays(today, -WINDOW_DAYS);
  const [user, weighIns, logs] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId } }),
    db.weightLog.findMany({ where: { userId, day: { gte: addDays(start, -30), lt: today } }, orderBy: { day: 'asc' } }),
    db.consumptionLog.findMany({
      where: { userId, consumedAt: { gte: new Date(Date.parse(`${start}T00:00:00Z`) - 86_400_000), lt: new Date() } },
      select: { consumedAt: true, calories: true },
    }),
  ]);

  const perDay = new Map<string, number>();
  for (const log of logs) {
    const day = localDay(log.consumedAt);
    if (day < start || day >= today) continue;
    perDay.set(day, (perDay.get(day) ?? 0) + (log.calories ?? 0));
  }
  const logged = [...perDay.values()].filter((kcal) => kcal >= LOGGED_DAY_KCAL);
  const inWindow = weighIns.filter((w) => w.day >= start);
  if (logged.length < MIN_LOGGED_DAYS || inWindow.length < MIN_WEIGH_INS) return null;
  if (dayNumber(inWindow[inWindow.length - 1]!.day) - dayNumber(inWindow[0]!.day) < 10) return null;

  const trend = trendOf(weighIns);
  const at = (day: string) => [...trend].reverse().find((point) => point.day <= day)?.kg;
  const from = at(start) ?? inWindow[0]!.kg;
  const to = at(addDays(today, -1)) ?? inWindow[inWindow.length - 1]!.kg;
  const intake = logged.reduce((sum, kcal) => sum + kcal, 0) / logged.length;
  let observed = intake - ((to - from) * KCAL_PER_KG) / WINDOW_DAYS;

  const formula = estimateEnergy({ ...user, tdee: null })?.tdee ?? null;
  if (formula) observed = Math.min(formula * 1.3, Math.max(formula * 0.7, observed));
  const trust = Math.min(1, logged.length / WINDOW_DAYS) * 0.8;
  return Math.round(formula ? formula * (1 - trust) + observed * trust : observed);
}

/**
 * Once a week, for someone with a goal whose target is the app's: read the
 * expenditure again and work the target out from it. Cheap to call on every
 * diary load; it only does anything once a week.
 */
export async function maybeAdapt(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { goalDate: true, targetSetBy: true, adaptedAt: true } });
  if (!user?.goalDate || user.targetSetBy !== 'app') return false;
  if (user.adaptedAt && Date.now() - user.adaptedAt.getTime() < ADAPT_EVERY_DAYS * 86_400_000) return false;
  const tdee = await observeTdee(userId);
  await prisma.user.update({ where: { id: userId }, data: { adaptedAt: new Date(), ...(tdee !== null ? { adaptedTdee: tdee } : {}) } });
  await refreshTargets(userId);
  return tdee !== null;
}
