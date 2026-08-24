/**
 * "You're about to run out" → the shopping list, automatically.
 *
 * Runs after any decrement (eating, cooking, a roommate raiding the fridge).
 *
 * Two triggers, because relying on the first alone meant this almost never
 * fired: an explicit per-item threshold if one is set, and — always — running
 * out entirely. Nobody sets thresholds on forty pantry items, but everybody
 * wants the thing they just finished to appear on the list.
 */
import type { Tx } from '../db.js';
import { normalizeUnit } from './units.js';
import { shoppingQuantity } from './shoppingQuantity.js';

export interface LowStockResult {
  added: boolean;
  name?: string;
  quantity?: number;
  unit?: string;
  /** true when it was added because the pantry ran out, not because of a threshold */
  ranOut?: boolean;
}

/**
 * How much to buy when we don't know any better.
 *
 * With a threshold, buy enough to clear it comfortably. Without one, "1" of
 * whatever it is measured in — a jar, a loaf, a bag — which is what a person
 * would actually pick up.
 */
function suggestPurchaseQuantity(threshold: number | null, _remaining: number, unit: string): number {
  if (threshold && threshold > 0) return shoppingQuantity(threshold * 2, unit);
  return 1;
}

export async function checkLowStock(
  userId: string,
  inventoryItemId: string,
  db: Tx,
): Promise<LowStockResult> {
  const item = await db.inventoryItem.findUnique({
    where: { id: inventoryItemId },
    include: { foodReference: true },
  });
  if (!item) return { added: false };

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user?.autoShoppingEnabled) return { added: false };

  // out entirely, or under a threshold the user set for this item
  const ranOut = item.quantity <= 0;
  const underThreshold = item.lowStockThreshold !== null && item.quantity < item.lowStockThreshold;
  if (!ranOut && !underThreshold) return { added: false };

  // Anything left of this food anywhere in the pantry counts, not just this lot
  // — including other brands of the same generic ingredient.
  const sameIngredient = item.foodReference.canonicalId ?? item.foodReferenceId;
  const lots = await db.inventoryItem.findMany({
    where: {
      userId,
      quantity: { gt: 0 },
      unit: item.unit,
      OR: [
        { foodReferenceId: sameIngredient },
        { foodReference: { canonicalId: sameIngredient } },
      ],
    },
  });
  const total = lots.reduce((sum, lot) => sum + lot.quantity, 0);
  if (ranOut ? total > 0 : total >= (item.lowStockThreshold ?? 0)) return { added: false };

  const unit = normalizeUnit(item.unit);
  const existing = await db.shoppingListItem.findFirst({
    where: {
      userId,
      isChecked: false,
      OR: [{ foodReferenceId: sameIngredient }, { foodReferenceId: item.foodReferenceId }],
    },
  });
  if (existing) return { added: false };

  const quantity = suggestPurchaseQuantity(item.lowStockThreshold, item.quantity, item.unit);
  // name it after the generic ingredient — "Peanut Butter", not the brand you
  // happened to finish
  const ingredient = item.foodReference.canonicalId
    ? await db.foodReference.findUnique({ where: { id: item.foodReference.canonicalId } })
    : null;

  await db.shoppingListItem.create({
    data: {
      userId,
      foodReferenceId: ingredient?.id ?? item.foodReferenceId,
      name: ingredient?.name ?? item.foodReference.name,
      quantityNeeded: quantity,
      unit,
      addedFrom: 'low_stock',
    },
  });

  return { added: true, name: item.foodReference.name, quantity, unit, ranOut };
}
