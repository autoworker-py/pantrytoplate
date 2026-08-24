/**
 * Deduction planning: "the recipe needs 2 cups of flour — which of the user's
 * flour lots do we take it from, and how much of each?"
 *
 * Two rules drive this:
 *   - first-expiring-first-out, because goal #1 is limiting food waste
 *   - never guess: a lot whose unit cannot be converted to the required unit is
 *     reported for manual confirmation instead of being silently ignored or
 *     silently consumed
 *
 * Planning is separated from applying so the UI can show the user exactly what
 * will be deducted before anything mutates (spec 8.5).
 */
import { convert, gte, roundQuantity, type ConvertContext } from './units.js';

export interface LotInput {
  id: string;
  quantity: number;
  unit: string;
  expirationDate: Date | null;
  createdAt: Date;
  /** which catalog row this lot actually is; may be a branded product */
  foodReferenceId?: string;
}

/**
 * How to convert a given lot.
 *
 * Lots of the same ingredient can need different conversions: a jar of "Creamy
 * Peanut Butter" is stocked in servings and knows its own serving weight, while
 * the generic Peanut Butter is measured in grams. Looking both up against the
 * ingredient's context would fail on the jar, so the caller can pass a function
 * that resolves the right context per lot.
 */
export type ContextSource = ConvertContext | ((lot: LotInput) => ConvertContext);

function contextFor(source: ContextSource, lot: LotInput): ConvertContext {
  return typeof source === 'function' ? source(lot) : source;
}

export interface LotDeduction {
  inventoryItemId: string;
  unit: string;
  quantityBefore: number;
  quantityDeducted: number;
  quantityAfter: number;
  expirationDate: Date | null;
}

export type IngredientStatus = 'ok' | 'short' | 'missing' | 'unknown_conversion';

export interface DeductionPlan {
  status: IngredientStatus;
  requiredQuantity: number;
  requiredUnit: string;
  /** total the user owns, expressed in the required unit (convertible lots only) */
  available: number;
  /** how much more is needed, in the required unit; 0 when status is ok */
  shortfall: number;
  deductions: LotDeduction[];
  /** lots we could not convert — surfaced to the user, never auto-consumed */
  unconvertibleLots: Array<{ inventoryItemId: string; quantity: number; unit: string }>;
  /**
   * Every lot that could have satisfied this, whether or not it was chosen.
   *
   * With two jars of different peanut butter open, picking one silently is a
   * decision the app should not make alone — the UI offers the choice.
   */
  candidates: Array<{
    inventoryItemId: string;
    foodReferenceId?: string;
    quantity: number;
    unit: string;
    availableInRequired: number;
    expirationDate: Date | null;
    chosen: boolean;
  }>;
}

/** First-expiring-first-out; undated lots go last, oldest purchase first. */
export function sortLotsFefo<T extends LotInput>(lots: T[]): T[] {
  return [...lots].sort((a, b) => {
    const aTime = a.expirationDate ? a.expirationDate.getTime() : Number.POSITIVE_INFINITY;
    const bTime = b.expirationDate ? b.expirationDate.getTime() : Number.POSITIVE_INFINITY;
    if (aTime !== bTime) return aTime - bTime;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

/**
 * Work out which lots to draw down. Pure: callers apply the result inside a
 * transaction.
 */
export function planDeduction(
  lots: LotInput[],
  requiredQuantity: number,
  requiredUnit: string,
  ctx: ContextSource,
  /** the user picked this jar; use it before anything else */
  preferredLotId?: string | null,
): DeductionPlan {
  const fefo = sortLotsFefo(lots.filter((lot) => lot.quantity > 0));
  const ordered = preferredLotId
    ? [...fefo.filter((lot) => lot.id === preferredLotId), ...fefo.filter((lot) => lot.id !== preferredLotId)]
    : fefo;
  const unconvertible: DeductionPlan['unconvertibleLots'] = [];

  interface Usable extends LotInput {
    /** lot quantity expressed in the required unit */
    availableInRequired: number;
    /** required-unit amount -> lot-unit amount */
    toLotUnits: (amount: number) => number;
  }

  const usable: Usable[] = [];
  for (const lot of ordered) {
    const converted = convert(lot.quantity, lot.unit, requiredUnit, contextFor(ctx, lot));
    if (!converted.ok) {
      unconvertible.push({ inventoryItemId: lot.id, quantity: lot.quantity, unit: lot.unit });
      continue;
    }
    const factor = converted.factor;
    usable.push({
      ...lot,
      availableInRequired: converted.value,
      toLotUnits: (amount: number) => amount / factor,
    });
  }

  const available = usable.reduce((sum, lot) => sum + lot.availableInRequired, 0);

  const describeCandidates = (chosenIds: Set<string>) =>
    usable.map((lot) => ({
      inventoryItemId: lot.id,
      foodReferenceId: lot.foodReferenceId,
      quantity: lot.quantity,
      unit: lot.unit,
      availableInRequired: lot.availableInRequired,
      expirationDate: lot.expirationDate,
      chosen: chosenIds.has(lot.id),
    }));

  if (ordered.length === 0) {
    return {
      status: 'missing',
      requiredQuantity,
      requiredUnit,
      available: 0,
      shortfall: requiredQuantity,
      deductions: [],
      unconvertibleLots: unconvertible,
      candidates: [],
    };
  }

  if (!gte(available, requiredQuantity)) {
    // Owning lots we cannot convert means we genuinely do not know whether the
    // user has enough, which is a different answer from "you are short".
    const status: IngredientStatus =
      unconvertible.length > 0 ? 'unknown_conversion' : available === 0 ? 'missing' : 'short';
    return {
      status,
      requiredQuantity,
      requiredUnit,
      available,
      shortfall: Math.max(0, requiredQuantity - available),
      deductions: [],
      unconvertibleLots: unconvertible,
      candidates: describeCandidates(new Set()),
    };
  }

  const deductions: LotDeduction[] = [];
  let remaining = requiredQuantity;
  for (const lot of usable) {
    if (!(remaining > 0)) break;
    const takeInRequired = Math.min(remaining, lot.availableInRequired);
    // if this lot covers the rest, take the exact remainder in lot units so
    // rounding never leaves a 1e-15 sliver behind
    const takeInLotUnits =
      takeInRequired >= lot.availableInRequired ? lot.quantity : lot.toLotUnits(takeInRequired);
    deductions.push({
      inventoryItemId: lot.id,
      unit: lot.unit,
      quantityBefore: lot.quantity,
      quantityDeducted: takeInLotUnits,
      quantityAfter: Math.max(0, lot.quantity - takeInLotUnits),
      expirationDate: lot.expirationDate,
    });
    remaining -= takeInRequired;
  }

  return {
    status: 'ok',
    requiredQuantity,
    requiredUnit,
    available,
    shortfall: 0,
    deductions,
    unconvertibleLots: unconvertible,
    candidates: describeCandidates(new Set(deductions.map((d) => d.inventoryItemId))),
  };
}

/** Human-readable one-liner for the confirmation screen. */
export function describePlan(plan: DeductionPlan, foodName: string): string {
  switch (plan.status) {
    case 'ok':
      return `Deduct ${roundQuantity(plan.requiredQuantity)} ${plan.requiredUnit} ${foodName}`;
    case 'short':
      return `Short ${roundQuantity(plan.shortfall)} ${plan.requiredUnit} ${foodName}`;
    case 'missing':
      return `No ${foodName} in inventory`;
    case 'unknown_conversion':
      return `Cannot convert your ${foodName} to ${plan.requiredUnit} — confirm manually`;
  }
}
