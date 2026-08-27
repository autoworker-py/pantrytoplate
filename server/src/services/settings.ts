/**
 * User settings: weight goal, nutrition targets, and the two feature switches
 * (ads, auto-shopping).
 */
import { prisma } from '../db.js';
import { notFound } from '../errors.js';
import { estimateEnergy, type EnergyEstimate } from './energy.js';

export type WeightGoal = 'lose' | 'maintain' | 'gain';

/**
 * Fallback calorie targets by goal, for an account that has told us nothing
 * about itself.
 *
 * Deliberately flat and round: inventing a precise-looking number from data we
 * do not have would be worse than an honest approximation. When height, weight,
 * age and activity *are* on file, `estimateEnergy` replaces these entirely —
 * see `resolveTargets` below.
 */
export const SUGGESTED_CALORIES: Record<WeightGoal, number> = {
  lose: 1700,
  maintain: 2000,
  gain: 2500,
};

/** Macro splits that match each goal's intent (protein/carbs/fat, % of kcal). */
const MACRO_SPLIT: Record<WeightGoal, { protein: number; carbs: number; fat: number }> = {
  lose: { protein: 0.35, carbs: 0.35, fat: 0.3 },
  maintain: { protein: 0.25, carbs: 0.45, fat: 0.3 },
  gain: { protein: 0.3, carbs: 0.45, fat: 0.25 },
};

export function suggestTargets(goal: WeightGoal, calories = SUGGESTED_CALORIES[goal]) {
  const split = MACRO_SPLIT[goal];
  return {
    dailyCalorieTarget: calories,
    // protein and carbs are 4 kcal/g, fat is 9
    proteinTargetGrams: Math.round((calories * split.protein) / 4),
    carbsTargetGrams: Math.round((calories * split.carbs) / 4),
    fatTargetGrams: Math.round((calories * split.fat) / 9),
  };
}

/**
 * The targets a person's own numbers imply.
 *
 * Body data on file beats the flat baseline every time — that is the whole
 * reason for collecting it. Returns null when there is not enough to compute
 * from, so callers fall back rather than presenting arithmetic done on gaps.
 */
function derivedTargets(user: {
  heightCm: number | null;
  weightKg: number | null;
  birthYear: number | null;
  sex: string | null;
  activityLevel: string | null;
  weeklyRateKg: number | null;
  weightGoal: string;
}): { estimate: EnergyEstimate; targets: ReturnType<typeof suggestTargets> } | null {
  const estimate = estimateEnergy(user);
  if (!estimate) return null;
  return {
    estimate,
    targets: {
      dailyCalorieTarget: estimate.target,
      proteinTargetGrams: estimate.protein,
      carbsTargetGrams: estimate.carbs,
      fatTargetGrams: estimate.fat,
    },
  };
}

export async function getSettings(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound('User not found.');

  const goal = user.weightGoal as WeightGoal;
  const suggested = suggestTargets(goal, user.dailyCalorieTarget);
  const derived = derivedTargets(user);

  return {
    email: user.email,
    weightGoal: goal,
    /** what is on file, so it can be shown and corrected */
    body: {
      heightCm: user.heightCm,
      weightKg: user.weightKg,
      birthYear: user.birthYear,
      sex: user.sex,
      activityLevel: user.activityLevel,
      weeklyRateKg: user.weeklyRateKg,
    },
    /** null when there is not enough on file to compute one */
    energy: derived?.estimate ?? null,
    dailyCalorieTarget: user.dailyCalorieTarget,
    proteinTargetGrams: user.proteinTargetGrams ?? suggested.proteinTargetGrams,
    carbsTargetGrams: user.carbsTargetGrams ?? suggested.carbsTargetGrams,
    fatTargetGrams: user.fatTargetGrams ?? suggested.fatTargetGrams,
    adsEnabled: user.adsEnabled,
    autoShoppingEnabled: user.autoShoppingEnabled,
    expiryWarningDays: user.expiryWarningDays,
    unitSystem: user.unitSystem as 'metric' | 'imperial',
    dietTags: user.dietTags ? user.dietTags.split(',').filter(Boolean) : [],
    notifyExpiry: user.notifyExpiry,
  };
}

export interface SettingsUpdate {
  weightGoal?: WeightGoal;
  /** body data, so a weight that moved can be corrected without re-onboarding */
  heightCm?: number | null;
  weightKg?: number | null;
  birthYear?: number | null;
  sex?: string | null;
  activityLevel?: string | null;
  weeklyRateKg?: number | null;
  dailyCalorieTarget?: number;
  proteinTargetGrams?: number | null;
  carbsTargetGrams?: number | null;
  fatTargetGrams?: number | null;
  adsEnabled?: boolean;
  autoShoppingEnabled?: boolean;
  expiryWarningDays?: number;
  unitSystem?: 'metric' | 'imperial';
  dietTags?: string[];
  notifyExpiry?: boolean;
}

export async function updateSettings(userId: string, update: SettingsUpdate) {
  const current = await prisma.user.findUnique({ where: { id: userId } });
  if (!current) throw notFound('User not found.');

  const body = {
    ...(update.heightCm !== undefined ? { heightCm: update.heightCm } : {}),
    ...(update.weightKg !== undefined ? { weightKg: update.weightKg } : {}),
    ...(update.birthYear !== undefined ? { birthYear: update.birthYear } : {}),
    ...(update.sex !== undefined ? { sex: update.sex } : {}),
    ...(update.activityLevel !== undefined ? { activityLevel: update.activityLevel } : {}),
    ...(update.weeklyRateKg !== undefined ? { weeklyRateKg: update.weeklyRateKg } : {}),
  };

  const goalChanged = Boolean(update.weightGoal && update.weightGoal !== current.weightGoal);
  const bodyChanged = (
    ['heightCm', 'weightKg', 'birthYear', 'sex', 'activityLevel', 'weeklyRateKg'] as const
  ).some((field) => update[field] !== undefined && update[field] !== current[field]);

  /*
   * Recalculate when the goal or the body changes.
   *
   * Both are deliberate acts that mean "my situation is different now", which
   * is exactly when a target computed from the old situation stops being right.
   * Weight in particular drifts, and a target from three kilos ago is quietly
   * wrong in a way nobody would think to check.
   *
   * A calorie target named explicitly in the same request still wins — someone
   * typing a number has said what they want more directly than the formula can.
   */
  const after = {
    heightCm: update.heightCm !== undefined ? update.heightCm : current.heightCm,
    weightKg: update.weightKg !== undefined ? update.weightKg : current.weightKg,
    birthYear: update.birthYear !== undefined ? update.birthYear : current.birthYear,
    sex: update.sex !== undefined ? update.sex : current.sex,
    activityLevel: update.activityLevel !== undefined ? update.activityLevel : current.activityLevel,
    weeklyRateKg: update.weeklyRateKg !== undefined ? update.weeklyRateKg : current.weeklyRateKg,
    weightGoal: update.weightGoal ?? current.weightGoal,
  };

  const shouldRecalculate = (goalChanged || bodyChanged) && update.dailyCalorieTarget === undefined;
  const derived = shouldRecalculate ? derivedTargets(after) : null;

  // with nothing on file to compute from, a goal change still needs targets
  // that do not contradict it
  const resuggest =
    shouldRecalculate && !derived && goalChanged ? suggestTargets(after.weightGoal as WeightGoal) : null;

  const recomputed = derived?.targets ?? resuggest;

  await prisma.user.update({
    where: { id: userId },
    data: {
      ...(update.weightGoal ? { weightGoal: update.weightGoal } : {}),
      ...body,
      ...(update.dailyCalorieTarget !== undefined
        ? { dailyCalorieTarget: update.dailyCalorieTarget }
        : recomputed
          ? { dailyCalorieTarget: recomputed.dailyCalorieTarget }
          : {}),
      ...(update.proteinTargetGrams !== undefined
        ? { proteinTargetGrams: update.proteinTargetGrams }
        : recomputed
          ? { proteinTargetGrams: recomputed.proteinTargetGrams }
          : {}),
      ...(update.carbsTargetGrams !== undefined
        ? { carbsTargetGrams: update.carbsTargetGrams }
        : recomputed
          ? { carbsTargetGrams: recomputed.carbsTargetGrams }
          : {}),
      ...(update.fatTargetGrams !== undefined
        ? { fatTargetGrams: update.fatTargetGrams }
        : recomputed
          ? { fatTargetGrams: recomputed.fatTargetGrams }
          : {}),
      ...(update.adsEnabled !== undefined ? { adsEnabled: update.adsEnabled } : {}),
      ...(update.autoShoppingEnabled !== undefined
        ? { autoShoppingEnabled: update.autoShoppingEnabled }
        : {}),
      ...(update.expiryWarningDays !== undefined
        ? { expiryWarningDays: update.expiryWarningDays }
        : {}),
      ...(update.unitSystem ? { unitSystem: update.unitSystem } : {}),
      ...(update.dietTags !== undefined ? { dietTags: update.dietTags.join(',') || null } : {}),
      ...(update.notifyExpiry !== undefined ? { notifyExpiry: update.notifyExpiry } : {}),
    },
  });

  const settings = await getSettings(userId);
  // the UI says so out loud rather than the number changing under the user
  return { ...settings, recalculated: Boolean(recomputed) };
}
