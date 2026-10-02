/**
 * Working out a daily calorie target from body data.
 *
 * Mifflin-St Jeor for resting metabolic rate, a standard activity multiplier
 * for total expenditure, then an adjustment for the goal. This is the same
 * arithmetic every calorie app runs; the value here is that it is stated once,
 * in one file, with its limits written down rather than implied.
 *
 * What this is not: it is an estimate for a healthy adult, not a clinical
 * measurement and not advice. Real expenditure varies by more than ten percent
 * between people of identical height, weight, age and activity. The interface
 * says so, and every figure remains editable — the estimate is a starting
 * point, and the user's own number always wins.
 */

export type Sex = 'male' | 'female' | 'unspecified';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type Goal = 'lose' | 'maintain' | 'gain';

/** How much of the resting rate a week's living adds on top. */
export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'Desk job, little exercise',
  light: 'Light exercise 1–3 days a week',
  moderate: 'Moderate exercise 3–5 days a week',
  active: 'Hard exercise 6–7 days a week',
  very_active: 'Physical job, or training twice a day',
};

/** A kilogram of body fat is about 7,700 kcal. */
const KCAL_PER_KG = 7700;

/**
 * The most anyone should shift per week by default.
 *
 * Faster loss than this costs muscle rather than fat, and the deficit needed
 * for it leaves most people unable to hit their protein target. Capped rather
 * than offered, and the floor below is the harder limit.
 */
const DEFAULT_WEEKLY_RATE_KG = 0.5;
const MAX_WEEKLY_RATE_KG = 1;

/**
 * No estimate is allowed to recommend eating less than this.
 *
 * Widely used clinical floors for unsupervised dieting are roughly 1,500 kcal
 * for men and 1,200 for women. An arithmetic result below that is a sign the
 * inputs are unusual, not a target to hand somebody.
 */
export const FLOOR_KCAL: Record<Sex, number> = {
  male: 1500,
  female: 1200,
  unspecified: 1350,
};

export interface BodyInput {
  heightCm?: number | null;
  weightKg?: number | null;
  birthYear?: number | null;
  sex?: string | null;
  activityLevel?: string | null;
  weightGoal?: string | null;
  weeklyRateKg?: number | null;
  /** daily expenditure seen in the diary and the weight trend, used in place of the formula's */
  tdee?: number | null;
}

export interface EnergyEstimate {
  /** resting metabolic rate: what the body spends doing nothing */
  bmr: number;
  /** total daily energy expenditure: resting rate scaled for activity */
  tdee: number;
  /** the recommended daily intake for the goal */
  target: number;
  /** grams a day */
  protein: number;
  carbs: number;
  fat: number;
  /** how much weight a week this target implies */
  weeklyRateKg: number;
  /** true when the floor overrode the arithmetic */
  flooredAt: number | null;
  /** anything the user should know about how this number was reached */
  notes: string[];
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const round = (value: number) => Math.round(value);

function ageFrom(birthYear: number | null | undefined): number | null {
  if (!birthYear) return null;
  const age = new Date().getFullYear() - birthYear;
  return age >= 13 && age <= 110 ? age : null;
}

/** Everything needed is present and inside a sane range. */
export function canEstimate(input: BodyInput): boolean {
  const height = input.heightCm ?? 0;
  const weight = input.weightKg ?? 0;
  return height >= 120 && height <= 250 && weight >= 30 && weight <= 350 && ageFrom(input.birthYear) !== null;
}

/**
 * Mifflin-St Jeor. Chosen over Harris-Benedict because it is the more accurate
 * of the two for modern populations and is what current dietetic practice uses.
 */
export function basalRate(heightCm: number, weightKg: number, age: number, sex: Sex): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  // the sex constant is +5 / -161; "unspecified" takes the midpoint rather
  // than silently assuming one
  const constant = sex === 'male' ? 5 : sex === 'female' ? -161 : -78;
  return base + constant;
}

/**
 * A full estimate, or null when there is not enough to work with.
 *
 * Returning null rather than a default is deliberate: a number presented as
 * "your target" should never be arithmetic performed on absent data.
 */
export function estimateEnergy(input: BodyInput): EnergyEstimate | null {
  if (!canEstimate(input)) return null;

  const height = input.heightCm!;
  const weight = input.weightKg!;
  const age = ageFrom(input.birthYear)!;
  const sex = (['male', 'female', 'unspecified'].includes(input.sex ?? '') ? input.sex : 'unspecified') as Sex;
  const activity = (
    input.activityLevel && input.activityLevel in ACTIVITY_FACTORS ? input.activityLevel : 'sedentary'
  ) as ActivityLevel;
  const goal = (['lose', 'maintain', 'gain'].includes(input.weightGoal ?? '') ? input.weightGoal : 'maintain') as Goal;

  const notes: string[] = [];
  const bmr = basalRate(height, weight, age, sex);
  const tdee = input.tdee ?? bmr * ACTIVITY_FACTORS[activity];

  const requested = input.weeklyRateKg ?? DEFAULT_WEEKLY_RATE_KG;
  const weeklyRate = goal === 'maintain' ? 0 : clamp(Math.abs(requested), 0.1, MAX_WEEKLY_RATE_KG);
  if (goal !== 'maintain' && Math.abs(requested) > MAX_WEEKLY_RATE_KG) {
    notes.push(`Capped at ${MAX_WEEKLY_RATE_KG} kg a week — faster than that costs muscle, not fat.`);
  }

  const dailyShift = (weeklyRate * KCAL_PER_KG) / 7;
  const raw = goal === 'lose' ? tdee - dailyShift : goal === 'gain' ? tdee + dailyShift : tdee;

  const floor = FLOOR_KCAL[sex];
  let target = raw;
  let flooredAt: number | null = null;
  if (target < floor) {
    target = floor;
    flooredAt = floor;
    notes.push(
      `Held at ${floor} kcal. Eating less than that without medical supervision is not something this app will suggest.`,
    );
  }

  /*
   * Macros. Protein first because it is the one that matters when losing
   * weight — it is what keeps the loss coming off fat rather than muscle — and
   * it is set per kilogram of body weight rather than as a share of calories,
   * which is how the evidence actually expresses it. Fat gets a floor of about
   * a quarter of intake for hormone function; carbohydrate takes the rest.
   */
  const proteinPerKg = goal === 'lose' ? 1.8 : goal === 'gain' ? 1.8 : 1.6;
  let protein = weight * proteinPerKg;
  const fat = (target * 0.28) / 9;
  let carbs = (target - protein * 4 - fat * 9) / 4;

  // a very low target cannot carry that much protein; give carbohydrate a floor
  if (carbs < 50) {
    carbs = 50;
    protein = Math.max(weight * 1.2, (target - carbs * 4 - fat * 9) / 4);
    notes.push('Protein trimmed to leave room for a workable amount of carbohydrate.');
  }

  const actualShift = goal === 'maintain' ? 0 : Math.abs(tdee - target);

  return {
    bmr: round(bmr),
    tdee: round(tdee),
    target: round(target),
    protein: round(protein),
    carbs: round(Math.max(0, carbs)),
    fat: round(fat),
    weeklyRateKg: Math.round(((actualShift * 7) / KCAL_PER_KG) * 100) / 100,
    flooredAt,
    notes,
  };
}

/* ---------- a goal weight by a date ---------- */

/**
 * The fastest the app will plan for: about 1% of body weight a week down
 * (and never over the 1 kg cap above), half that up. Faster loss comes off
 * muscle and is hard to keep; faster gain is mostly fat.
 */
const MAX_LOSS_SHARE = 0.01;
const MAX_GAIN_SHARE = 0.005;
/** the lowest healthy body mass index, below which no goal is set */
const LOWEST_HEALTHY_BMI = 18.5;

export type Pace = 'gentle' | 'steady' | 'faster';
export type GoalProblem = 'too_soon' | 'too_fast' | 'below_healthy' | 'too_young';

export interface GoalPlan {
  ok: boolean;
  direction: Goal;
  /** kilograms a week the date asks for */
  weeklyRateKg: number;
  pace: Pace | null;
  days: number;
  /** the earliest date that is safe, when the one asked for is not */
  earliestSafeDate: string | null;
  /** the lowest goal weight the app will set for this height */
  lowestGoalKg: number | null;
  problem: GoalProblem | null;
}

const dayNumber = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
const dayString = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);

/**
 * Whether a goal weight by a date is safe to plan for, and at what pace. Too
 * fast is refused with the earliest safe date instead; a goal under a healthy
 * weight for the person's height, or weight loss for someone under 18, is
 * refused outright.
 */
export function planGoal(input: { weightKg: number; goalWeightKg: number; goalDate: string; today: string; heightCm?: number | null; birthYear?: number | null }): GoalPlan {
  const days = dayNumber(input.goalDate) - dayNumber(input.today);
  const change = input.goalWeightKg - input.weightKg;
  const direction: Goal = Math.abs(change) < 0.5 ? 'maintain' : change < 0 ? 'lose' : 'gain';
  const lowestGoalKg = input.heightCm ? Math.ceil(LOWEST_HEALTHY_BMI * (input.heightCm / 100) ** 2 * 10) / 10 : null;
  const base = { direction, days, earliestSafeDate: null, lowestGoalKg };

  if (direction === 'maintain') return { ok: true, ...base, weeklyRateKg: 0, pace: null, problem: null };
  if (days < 7) return { ok: false, ...base, weeklyRateKg: 0, pace: null, problem: 'too_soon' };

  const age = input.birthYear ? new Date().getFullYear() - input.birthYear : null;
  if (direction === 'lose' && age !== null && age < 18) return { ok: false, ...base, weeklyRateKg: 0, pace: null, problem: 'too_young' };
  if (direction === 'lose' && lowestGoalKg !== null && input.goalWeightKg < lowestGoalKg) {
    return { ok: false, ...base, weeklyRateKg: 0, pace: null, problem: 'below_healthy' };
  }

  const weeklyRateKg = Math.abs(change) / (days / 7);
  const maxRate = direction === 'lose' ? Math.min(MAX_WEEKLY_RATE_KG, input.weightKg * MAX_LOSS_SHARE) : input.weightKg * MAX_GAIN_SHARE;
  const rounded = Math.round(weeklyRateKg * 100) / 100;
  if (weeklyRateKg > maxRate + 1e-9) {
    const safeDays = Math.ceil((Math.abs(change) / maxRate) * 7);
    return { ok: false, ...base, weeklyRateKg: rounded, pace: null, earliestSafeDate: dayString(dayNumber(input.today) + safeDays), problem: 'too_fast' };
  }

  const share = weeklyRateKg / input.weightKg;
  const pace: Pace =
    direction === 'lose' ? (share <= 0.005 ? 'gentle' : share <= 0.0075 ? 'steady' : 'faster') : share <= 0.0025 ? 'gentle' : share <= 0.004 ? 'steady' : 'faster';
  return { ok: true, ...base, weeklyRateKg: rounded, pace, problem: null };
}
