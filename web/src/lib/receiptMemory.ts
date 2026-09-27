import { Preferences } from '@capacitor/preferences';
import type { StorageLocation } from './types';

/*
 * What this phone has learned from receipts, for one account: each line's
 * wording and the food it turned out to be (or that it is not food), and every
 * food put away, so the next receipt recognises them. It lives on the device
 * and holds nothing the pantry does not already know.
 */

export interface RememberedFood {
  id: string;
  name: string;
  category: string | null;
  /** how it was put away last time, per one bought */
  quantity?: number;
  unit?: string;
  where?: StorageLocation;
}

export interface ReceiptMemory {
  /** keyed on a line's words ("GRK YGRT PLN") */
  lines: Record<string, { food: RememberedFood; quantity: number; unit: string; where: StorageLocation } | { skip: true }>;
  /** keyed on food id */
  foods: Record<string, RememberedFood>;
}

const storageKey = (userId: string) => `receipt-memory.${userId}`;

export async function loadMemory(userId: string): Promise<ReceiptMemory> {
  try {
    const { value } = await Preferences.get({ key: storageKey(userId) });
    const saved = value ? (JSON.parse(value) as Partial<ReceiptMemory>) : null;
    return { lines: saved?.lines ?? {}, foods: saved?.foods ?? {} };
  } catch {
    return { lines: {}, foods: {} };
  }
}

export async function saveMemory(userId: string, memory: ReceiptMemory): Promise<void> {
  try {
    await Preferences.set({ key: storageKey(userId), value: JSON.stringify(memory) });
  } catch {
    // a memory that failed to save costs one more link next time, nothing else
  }
}

/** Anything put away by any route counts as bought before. */
export async function rememberFoods(userId: string, foods: RememberedFood[]): Promise<void> {
  const memory = await loadMemory(userId);
  for (const food of foods) memory.foods[food.id] = food;
  await saveMemory(userId, memory);
}

export async function forgetReceipts(userId: string): Promise<void> {
  try {
    await Preferences.remove({ key: storageKey(userId) });
  } catch {
    // nothing to forget
  }
}
