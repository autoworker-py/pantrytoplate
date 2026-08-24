/**
 * User settings: weight goal, nutrition targets, and the two feature switches
 * (ads, auto-shopping).
 */
import { prisma } from '../db.js';
import { notFound } from '../errors.js';

export type WeightGoal = 'lose' | 'maintain' | 'gain';

/**
 * Starting calorie targets by goal. Deliberately a flat baseline rather than a
 * Mifflin-St Jeor calculation: we do not collect height, weight, age or
 * activity level, and inventing a precise-looking number from data we do not
 * have would be worse than an honest round one. The user can edit it.
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

export async function getSettings(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound('User not found.');

  const goal = user.weightGoal as WeightGoal;
  const suggested = suggestTargets(goal, user.dailyCalorieTarget);

  return {
    email: user.email,
    weightGoal: goal,
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

  // Changing the goal without naming a calorie target re-suggests the whole set,
  // so the targets never contradict the goal.
  const goalChanged = update.weightGoal && update.weightGoal !== current.weightGoal;
  const resuggest =
    goalChanged && update.dailyCalorieTarget === undefined
      ? suggestTargets(update.weightGoal as WeightGoal)
      : null;

  await prisma.user.update({
    where: { id: userId },
    data: {
      ...(update.weightGoal ? { weightGoal: update.weightGoal } : {}),
      ...(update.dailyCalorieTarget !== undefined
        ? { dailyCalorieTarget: update.dailyCalorieTarget }
        : resuggest
          ? { dailyCalorieTarget: resuggest.dailyCalorieTarget }
          : {}),
      ...(update.proteinTargetGrams !== undefined
        ? { proteinTargetGrams: update.proteinTargetGrams }
        : resuggest
          ? { proteinTargetGrams: resuggest.proteinTargetGrams }
          : {}),
      ...(update.carbsTargetGrams !== undefined
        ? { carbsTargetGrams: update.carbsTargetGrams }
        : resuggest
          ? { carbsTargetGrams: resuggest.carbsTargetGrams }
          : {}),
      ...(update.fatTargetGrams !== undefined
        ? { fatTargetGrams: update.fatTargetGrams }
        : resuggest
          ? { fatTargetGrams: resuggest.fatTargetGrams }
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

  return getSettings(userId);
}
