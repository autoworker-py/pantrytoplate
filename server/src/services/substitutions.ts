/**
 * "You have not got butter, but you have got oil."
 *
 * Missing a single ingredient is the commonest reason a recipe sits just out of
 * reach, and the kitchen very often already holds a workable stand-in. This only
 * ever *suggests*: swapping one fat for another changes a dish, and that is the
 * cook's call, not the app's.
 *
 * Ratios matter — oil for butter is not one for one — and the note says what
 * changes, so nobody discovers the difference at the table.
 */
import { prisma, type Tx } from '../db.js';
import { convert } from './units.js';
import { loadConvertContexts } from './conversions.js';
import { roundQuantity } from './units.js';

export interface SubstitutionOption {
  substituteId: string;
  substituteName: string;
  /** how much of the substitute to use, in the recipe's unit */
  quantity: number;
  unit: string;
  note: string | null;
  /** what you have, expressed in that unit */
  available: number;
  enough: boolean;
}

/**
 * Stand-ins for a missing ingredient that the user actually has in the pantry.
 * Anything they do not own is left out — a suggestion you cannot act on is
 * noise.
 */
export async function substitutionsFor(
  userId: string,
  foodReferenceId: string,
  requiredQuantity: number,
  requiredUnit: string,
  db: Tx = prisma,
): Promise<SubstitutionOption[]> {
  const rules = await db.substitution.findMany({
    where: { foodReferenceId },
    include: { substitute: true },
    orderBy: { rank: 'asc' },
  });
  if (rules.length === 0) return [];

  const lots = await db.inventoryItem.findMany({
    where: { userId, quantity: { gt: 0 } },
    include: { foodReference: true },
  });

  // a branded jar counts as the ingredient it is a version of
  const byIngredient = new Map<string, typeof lots>();
  for (const lot of lots) {
    const key = lot.foodReference.canonicalId ?? lot.foodReferenceId;
    byIngredient.set(key, [...(byIngredient.get(key) ?? []), lot]);
  }

  const contexts = await loadConvertContexts(
    lots.map((lot) => lot.foodReference),
    db,
  );

  const options: SubstitutionOption[] = [];

  for (const rule of rules) {
    const held = byIngredient.get(rule.substituteId);
    if (!held || held.length === 0) continue;

    const needed = requiredQuantity * rule.ratio;

    let available = 0;
    let convertible = false;
    for (const lot of held) {
      const converted = convert(lot.quantity, lot.unit, requiredUnit, contexts.get(lot.foodReferenceId) ?? {});
      if (!converted.ok) continue;
      convertible = true;
      available += converted.value;
    }
    if (!convertible) continue;

    options.push({
      substituteId: rule.substituteId,
      substituteName: rule.substitute.name,
      quantity: roundQuantity(needed),
      unit: requiredUnit,
      note: rule.note,
      available: roundQuantity(available),
      enough: available + 1e-6 >= needed,
    });
  }

  // ones you have enough of are the only ones worth acting on
  return options.sort((a, b) => Number(b.enough) - Number(a.enough));
}

/**
 * Rewrite a recipe's ingredients to use stand-ins the cook picked.
 *
 * A swap is deliberately per-cook and nothing more: the recipe is not edited,
 * no preference is remembered, and next time it asks for butter again. Someone
 * using oil tonight because the butter ran out has not decided anything about
 * the recipe — they have decided about tonight.
 *
 * The ratio is applied here, so everything downstream — the deduction plan, the
 * calorie total, the diary — sees the real ingredient in the real amount.
 */
export async function applySwaps<
  T extends {
    foodReferenceId: string;
    quantityRequired: number;
    unitRequired: string;
    note: string | null;
    foodReference: { id: string; name: string };
  },
>(
  ingredients: T[],
  swaps: Record<string, string>,
  db: Tx = prisma,
): Promise<T[]> {
  const wanted = Object.entries(swaps).filter(([from, to]) => from && to);
  if (wanted.length === 0) return ingredients;

  const rules = await db.substitution.findMany({
    where: {
      OR: wanted.map(([foodReferenceId, substituteId]) => ({ foodReferenceId, substituteId })),
    },
    include: { substitute: true },
  });

  return ingredients.map((ingredient) => {
    const substituteId = swaps[ingredient.foodReferenceId];
    if (!substituteId) return ingredient;

    const rule = rules.find(
      (candidate) =>
        candidate.foodReferenceId === ingredient.foodReferenceId && candidate.substituteId === substituteId,
    );
    // an unknown pairing is not a licence to guess a ratio
    if (!rule) return ingredient;

    return {
      ...ingredient,
      foodReferenceId: rule.substituteId,
      quantityRequired: ingredient.quantityRequired * rule.ratio,
      foodReference: { ...ingredient.foodReference, id: rule.substituteId, name: rule.substitute.name },
      note: [`instead of ${ingredient.foodReference.name}`, ingredient.note].filter(Boolean).join(' · '),
    };
  });
}
