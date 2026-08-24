/**
 * Inventory: the one place a food is ever entered. Everything downstream
 * (consumption, cooking, shopping, calories) is a decrement or a read against
 * these rows.
 */
import type { FoodReference, InventoryItem } from '@prisma/client';
import { prisma, type Tx } from '../db.js';
import { badRequest, conflict, notFound } from '../errors.js';
import { env } from '../env.js';
import { loadConvertContext } from './conversions.js';
import { nutritionFor } from './nutrition.js';
import { clampZero, convert, gte, normalizeUnit, roundQuantity } from './units.js';
import { estimateShelfLife, freezeExtension, type StorageLocation } from './shelfLife.js';
import { checkLowStock, type LowStockResult } from './lowStock.js';

export type InventorySort = 'expiration' | 'category' | 'name' | 'recent';

export interface InventoryView {
  id: string;
  quantity: number;
  unit: string;
  expirationDate: string | null;
  purchasedAt: string;
  daysUntilExpiration: number | null;
  expiryStatus: 'expired' | 'expiring_soon' | 'ok' | 'unknown';
  storageLocation: string;
  lowStockThreshold: number | null;
  isLowStock: boolean;
  /** a portion of something you cooked rather than an ingredient you bought */
  isLeftover: boolean;
  food: {
    id: string;
    name: string;
    brand: string | null;
    barcode: string | null;
    category: string | null;
    source: string;
    defaultUnit: string;
    caloriesPerUnit: number | null;
    /** the generic ingredient this product counts as, when it is a branded one */
    countsAs: { id: string; name: string; source: string | null } | null;
  };
  /** calories for the whole remaining lot; null when no conversion exists */
  caloriesRemaining: number | null;
  /** protein / carbs / fat for the whole remaining lot */
  macrosRemaining: { protein: number | null; carbs: number | null; fat: number | null };
}

/**
 * Whole calendar days until a date, counted in LOCAL time.
 *
 * Doing this in UTC meant that after 5pm Pacific the app rolled over to
 * tomorrow and told everyone their food expired a day sooner than it does.
 */
export function daysUntil(date: Date | null, now = new Date()): number | null {
  if (!date) return null;
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000);
}

function expiryStatus(days: number | null, warningDays: number): InventoryView['expiryStatus'] {
  if (days === null) return 'unknown';
  if (days < 0) return 'expired';
  if (days <= warningDays) return 'expiring_soon';
  return 'ok';
}

/** The user's own expiry window, falling back to the deployment default. */
export async function warningDaysFor(userId: string, db: Tx = prisma): Promise<number> {
  const user = await db.user.findUnique({ where: { id: userId } });
  return user?.expiryWarningDays ?? env.expiryWarningDays;
}

export async function toInventoryView(
  item: InventoryItem & { foodReference: FoodReference },
  db: Tx = prisma,
  warningDays: number = env.expiryWarningDays,
): Promise<InventoryView> {
  const ctx = await loadConvertContext(item.foodReference, db);
  const canonical = item.foodReference.canonicalId
    ? await db.foodReference.findUnique({
        where: { id: item.foodReference.canonicalId },
        select: { id: true, name: true },
      })
    : null;
  const totals = nutritionFor(item.quantity, item.unit, item.foodReference, ctx);
  const days = daysUntil(item.expirationDate);
  return {
    id: item.id,
    quantity: roundQuantity(item.quantity),
    unit: item.unit,
    expirationDate: item.expirationDate ? item.expirationDate.toISOString() : null,
    purchasedAt: item.purchasedAt.toISOString(),
    daysUntilExpiration: days,
    expiryStatus: expiryStatus(days, warningDays),
    storageLocation: item.storageLocation,
    lowStockThreshold: item.lowStockThreshold,
    isLowStock: item.lowStockThreshold !== null && item.quantity < item.lowStockThreshold,
    isLeftover: item.isLeftover,
    food: {
      id: item.foodReference.id,
      name: item.foodReference.name,
      brand: item.foodReference.brand,
      barcode: item.foodReference.barcode,
      category: item.foodReference.category,
      source: item.foodReference.source,
      defaultUnit: item.foodReference.defaultUnit,
      caloriesPerUnit: item.foodReference.caloriesPerUnit,
      countsAs: canonical
        ? { ...canonical, source: item.foodReference.canonicalSource }
        : null,
    },
    caloriesRemaining: totals.calories === null ? null : roundQuantity(totals.calories),
    macrosRemaining: {
      protein: totals.protein === null ? null : roundQuantity(totals.protein),
      carbs: totals.carbs === null ? null : roundQuantity(totals.carbs),
      fat: totals.fat === null ? null : roundQuantity(totals.fat),
    },
  };
}

export async function listInventory(
  userId: string,
  options: { sort?: InventorySort; includeDepleted?: boolean; search?: string } = {},
  db: Tx = prisma,
): Promise<InventoryView[]> {
  const items = await db.inventoryItem.findMany({
    where: {
      userId,
      ...(options.includeDepleted ? {} : { quantity: { gt: 0 } }),
      ...(options.search
        ? { foodReference: { nameNorm: { contains: options.search.toLowerCase() } } }
        : {}),
    },
    include: { foodReference: true },
  });

  const warningDays = await warningDaysFor(userId, db);
  const views = await Promise.all(items.map((item) => toInventoryView(item, db, warningDays)));

  const sort = options.sort ?? 'expiration';
  return views.sort((a, b) => {
    if (sort === 'name') return a.food.name.localeCompare(b.food.name);
    if (sort === 'recent') return b.purchasedAt.localeCompare(a.purchasedAt);
    if (sort === 'category') {
      const category = (a.food.category ?? 'zzz').localeCompare(b.food.category ?? 'zzz');
      if (category !== 0) return category;
      return a.food.name.localeCompare(b.food.name);
    }
    // expiration: soonest first, undated last
    const aDays = a.daysUntilExpiration ?? Number.POSITIVE_INFINITY;
    const bDays = b.daysUntilExpiration ?? Number.POSITIVE_INFINITY;
    if (aDays !== bDays) return aDays - bDays;
    return a.food.name.localeCompare(b.food.name);
  });
}

export async function expiringSoon(userId: string, days?: number, db: Tx = prisma) {
  const window = days ?? (await warningDaysFor(userId, db));
  const all = await listInventory(userId, { sort: 'expiration' }, db);
  return all.filter((item) => item.daysUntilExpiration !== null && item.daysUntilExpiration <= window);
}

export interface AddInventoryInput {
  foodReferenceId: string;
  quantity: number;
  unit: string;
  expirationDate?: Date | null;
  purchasedAt?: Date | null;
  storageLocation?: StorageLocation;
  lowStockThreshold?: number | null;
}

export interface AddInventoryResult {
  item: InventoryView;
  /** true when we filled the expiry date in from typical shelf life */
  expirationEstimated: boolean;
  estimatedFrom: 'food' | 'category' | null;
}

/**
 * Add to the pantry. When the user gives no expiry date we estimate one from
 * typical shelf life and say so — an editable estimate beats the empty field
 * that makes expiry tracking useless everywhere else.
 */
export async function addInventoryItem(
  userId: string,
  input: AddInventoryInput,
  db: Tx = prisma,
): Promise<AddInventoryResult> {
  if (!(input.quantity > 0)) throw badRequest('Quantity must be greater than zero.');
  const food = await db.foodReference.findUnique({ where: { id: input.foodReferenceId } });
  if (!food) throw notFound('Food not found in the catalog.');

  const storage = input.storageLocation ?? 'pantry';
  let expirationDate = input.expirationDate ?? null;
  let estimate = null as Awaited<ReturnType<typeof estimateShelfLife>>;

  if (!expirationDate) {
    estimate = await estimateShelfLife(food, storage, db);
    expirationDate = estimate?.expirationDate ?? null;
  }

  const item = await db.inventoryItem.create({
    data: {
      userId,
      foodReferenceId: food.id,
      quantity: input.quantity,
      unit: normalizeUnit(input.unit),
      expirationDate,
      purchasedAt: input.purchasedAt ?? new Date(),
      storageLocation: storage,
      lowStockThreshold: input.lowStockThreshold ?? null,
    },
    include: { foodReference: true },
  });

  return {
    item: await toInventoryView(item, db, await warningDaysFor(userId, db)),
    expirationEstimated: estimate !== null,
    estimatedFrom: estimate?.basis ?? null,
  };
}

export async function updateInventoryItem(
  userId: string,
  itemId: string,
  data: {
    quantity?: number;
    unit?: string;
    expirationDate?: Date | null;
    storageLocation?: StorageLocation;
    lowStockThreshold?: number | null;
  },
  db: Tx = prisma,
): Promise<InventoryView> {
  const existing = await db.inventoryItem.findFirst({ where: { id: itemId, userId } });
  if (!existing) throw notFound('Inventory item not found.');
  if (data.quantity !== undefined && data.quantity < 0) throw badRequest('Quantity cannot be negative.');

  const item = await db.inventoryItem.update({
    where: { id: itemId },
    data: {
      ...(data.quantity !== undefined ? { quantity: clampZero(data.quantity) } : {}),
      ...(data.unit !== undefined ? { unit: normalizeUnit(data.unit) } : {}),
      ...(data.expirationDate !== undefined ? { expirationDate: data.expirationDate } : {}),
      ...(data.storageLocation !== undefined ? { storageLocation: data.storageLocation } : {}),
      ...(data.lowStockThreshold !== undefined ? { lowStockThreshold: data.lowStockThreshold } : {}),
    },
    include: { foodReference: true },
  });
  return toInventoryView(item, db, await warningDaysFor(userId, db));
}

export async function deleteInventoryItem(userId: string, itemId: string, db: Tx = prisma): Promise<void> {
  const existing = await db.inventoryItem.findFirst({ where: { id: itemId, userId } });
  if (!existing) throw notFound('Inventory item not found.');
  // keep the audit trail intact: detach logs rather than cascading them away
  await db.consumptionLog.updateMany({ where: { inventoryItemId: itemId }, data: { inventoryItemId: null } });
  await db.inventoryRemoval.updateMany({ where: { inventoryItemId: itemId }, data: { inventoryItemId: null } });
  await db.inventoryItem.delete({ where: { id: itemId } });
}

export interface ConsumeResult {
  inventoryItemId: string;
  foodName: string;
  quantityConsumed: number;
  unit: string;
  remaining: number;
  depleted: boolean;
  calories: number | null;
  macros: { protein: number | null; carbs: number | null; fat: number | null };
  consumptionLogId: string;
  /** set when this decrement put the item on the shopping list */
  lowStock: LowStockResult;
}

/**
 * Standalone consumption: "I ate one pop tart." Atomic — the decrement and the
 * log are written in one transaction, and the lot is re-read inside it so two
 * taps cannot drive the quantity negative.
 */
export async function consumeInventoryItem(
  userId: string,
  itemId: string,
  quantity: number,
  unit?: string,
  mealSlot: string = 'snack',
): Promise<ConsumeResult> {
  if (!(quantity > 0)) throw badRequest('Quantity consumed must be greater than zero.');

  return prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.findFirst({
      where: { id: itemId, userId },
      include: { foodReference: true },
    });
    if (!item) throw notFound('Inventory item not found.');

    const consumedUnit = normalizeUnit(unit ?? item.unit);
    const ctx = await loadConvertContext(item.foodReference, tx);

    // express the consumed amount in the lot's own unit before subtracting
    const inLotUnits = convert(quantity, consumedUnit, item.unit, ctx);
    if (!inLotUnits.ok) {
      throw conflict(
        `Cannot convert ${consumedUnit} to ${item.unit} for ${item.foodReference.name}. ` +
          `Log it in ${item.unit}, or add a conversion for this food.`,
        'no_conversion',
        { from: consumedUnit, to: item.unit, foodReferenceId: item.foodReferenceId },
      );
    }

    if (!gte(item.quantity, inLotUnits.value)) {
      throw conflict(
        `You only have ${roundQuantity(item.quantity)} ${item.unit} of ${item.foodReference.name}.`,
        'insufficient_quantity',
        { available: roundQuantity(item.quantity), unit: item.unit, requested: roundQuantity(inLotUnits.value) },
      );
    }

    const remaining = clampZero(item.quantity - inLotUnits.value);
    await tx.inventoryItem.update({ where: { id: item.id }, data: { quantity: remaining } });

    const totals = nutritionFor(quantity, consumedUnit, item.foodReference, ctx);
    const log = await tx.consumptionLog.create({
      data: {
        userId,
        inventoryItemId: item.id,
        foodReferenceId: item.foodReferenceId,
        quantityConsumed: quantity,
        unit: consumedUnit,
        source: 'manual',
        mealSlot,
        calories: totals.calories,
        proteinGrams: totals.protein,
        carbsGrams: totals.carbs,
        fatGrams: totals.fat,
      },
    });

    const lowStock = await checkLowStock(userId, item.id, tx);

    return {
      inventoryItemId: item.id,
      foodName: item.foodReference.name,
      quantityConsumed: roundQuantity(quantity),
      unit: consumedUnit,
      remaining: roundQuantity(remaining),
      depleted: remaining === 0,
      calories: totals.calories === null ? null : roundQuantity(totals.calories),
      macros: {
        protein: totals.protein === null ? null : roundQuantity(totals.protein),
        carbs: totals.carbs === null ? null : roundQuantity(totals.carbs),
        fat: totals.fat === null ? null : roundQuantity(totals.fat),
      },
      consumptionLogId: log.id,
      lowStock,
    };
  });
}

export type RemovalReason = 'other_person' | 'used_up' | 'wasted';

export interface RemoveResult {
  inventoryItemId: string;
  foodName: string;
  quantityRemoved: number;
  unit: string;
  remaining: number;
  depleted: boolean;
  reason: RemovalReason;
  lowStock: LowStockResult;
}

/**
 * Food leaving the pantry for a reason that is not you eating it: a roommate
 * ate it, it ran out, or it went in the bin.
 *
 * Deliberately writes to inventory_removals, never to consumption_logs — a
 * roommate's midnight snack must not appear in your calorie diary. Wasted food
 * carries a money estimate, which is what makes the waste report meaningful.
 */
export async function removeInventoryQuantity(
  userId: string,
  itemId: string,
  reason: RemovalReason,
  quantity?: number,
  unit?: string,
): Promise<RemoveResult> {
  return prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.findFirst({
      where: { id: itemId, userId },
      include: { foodReference: true },
    });
    if (!item) throw notFound('Inventory item not found.');

    const removedUnit = normalizeUnit(unit ?? item.unit);
    const ctx = await loadConvertContext(item.foodReference, tx);
    const requested = quantity ?? item.quantity;
    if (!(requested > 0)) throw badRequest('Quantity removed must be greater than zero.');

    const inLotUnits = convert(requested, removedUnit, item.unit, ctx);
    if (!inLotUnits.ok) {
      throw conflict(
        `Cannot convert ${removedUnit} to ${item.unit} for ${item.foodReference.name}.`,
        'no_conversion',
        { from: removedUnit, to: item.unit, foodReferenceId: item.foodReferenceId },
      );
    }
    if (!gte(item.quantity, inLotUnits.value)) {
      throw conflict(
        `You only have ${roundQuantity(item.quantity)} ${item.unit} of ${item.foodReference.name}.`,
        'insufficient_quantity',
        { available: roundQuantity(item.quantity), unit: item.unit },
      );
    }

    const remaining = clampZero(item.quantity - inLotUnits.value);
    await tx.inventoryItem.update({ where: { id: item.id }, data: { quantity: remaining } });

    await tx.inventoryRemoval.create({
      data: {
        userId,
        inventoryItemId: item.id,
        foodReferenceId: item.foodReferenceId,
        quantity: requested,
        unit: removedUnit,
        reason,
      },
    });

    const lowStock = await checkLowStock(userId, item.id, tx);

    return {
      inventoryItemId: item.id,
      foodName: item.foodReference.name,
      quantityRemoved: roundQuantity(requested),
      unit: removedUnit,
      remaining: roundQuantity(remaining),
      depleted: remaining === 0,
      reason,
      lowStock,
    };
  });
}

/** Freezing moves the item and pushes its expiry date out. */
export async function freezeInventoryItem(userId: string, itemId: string): Promise<InventoryView> {
  const item = await prisma.inventoryItem.findFirst({
    where: { id: itemId, userId },
    include: { foodReference: true },
  });
  if (!item) throw notFound('Inventory item not found.');

  const expirationDate = await freezeExtension(item.foodReference);
  const updated = await prisma.inventoryItem.update({
    where: { id: item.id },
    data: { storageLocation: 'freezer', expirationDate },
    include: { foodReference: true },
  });
  return toInventoryView(updated, prisma, await warningDaysFor(userId));
}

/**
 * Reconciliation: items the pantry still claims you own but probably does not.
 * Inventory drifts from reality — especially in a shared house — and wrong
 * counts are how people stop trusting the app. Asking beats guessing.
 */
export async function staleInventory(userId: string, olderThanDays = 45, db: Tx = prisma) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);

  const items = await db.inventoryItem.findMany({
    where: { userId, quantity: { gt: 0 }, updatedAt: { lt: cutoff } },
    include: { foodReference: true },
    orderBy: { updatedAt: 'asc' },
    take: 10,
  });

  return items.map((item) => ({
    id: item.id,
    name: item.foodReference.name,
    quantity: roundQuantity(item.quantity),
    unit: item.unit,
    untouchedDays: Math.floor((Date.now() - item.updatedAt.getTime()) / 86_400_000),
    expired: item.expirationDate ? item.expirationDate.getTime() < Date.now() : false,
  }));
}
