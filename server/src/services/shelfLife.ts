/**
 * Expiry dates that fill themselves in.
 *
 * Expiry tracking only works if the dates are actually there, and nobody types
 * them voluntarily — so when a user adds food without a date, we look up a
 * typical shelf life and pre-fill it. Always editable, never silently wrong:
 * the API reports that the date was estimated so the UI can say so.
 *
 * Resolution order: the food's own override, then its category, then nothing
 * (we leave the date null rather than inventing one for an unknown food).
 */
import { prisma, type Tx } from '../db.js';

export type StorageLocation = 'pantry' | 'fridge' | 'freezer';

export interface ShelfLifeEstimate {
  days: number;
  expirationDate: Date;
  basis: 'food' | 'category';
  category: string | null;
}

export function addDays(days: number, from = new Date()): Date {
  const date = new Date(from);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
}

export async function estimateShelfLife(
  food: { shelfLifeDays: number | null; category: string | null },
  storage: StorageLocation = 'pantry',
  db: Tx = prisma,
): Promise<ShelfLifeEstimate | null> {
  const row = food.category ? await db.shelfLife.findUnique({ where: { category: food.category } }) : null;

  // Freezer figures live in the category table — a food's own shelf life is
  // about how long it lasts fresh, which tells you nothing about frozen.
  if (storage === 'freezer') {
    const days = row?.freezerDays ?? (food.shelfLifeDays ? food.shelfLifeDays * 6 : null);
    if (days && days > 0) {
      return {
        days,
        expirationDate: addDays(days),
        basis: row?.freezerDays ? 'category' : 'food',
        category: food.category,
      };
    }
    return null;
  }

  // A per-food figure beats the category it belongs to: spinach goes off
  // faster than "Produce" in general.
  if (food.shelfLifeDays && food.shelfLifeDays > 0) {
    return {
      days: food.shelfLifeDays,
      expirationDate: addDays(food.shelfLifeDays),
      basis: 'food',
      category: food.category,
    };
  }

  if (!row) return null;

  const days = storage === 'fridge' ? row.fridgeDays ?? row.pantryDays : row.pantryDays ?? row.fridgeDays;
  if (!days || days <= 0) return null;
  return { days, expirationDate: addDays(days), basis: 'category', category: food.category };
}

/** Freezing pushes an existing expiry date out. */
export async function freezeExtension(
  food: { shelfLifeDays: number | null; category: string | null },
  db: Tx = prisma,
): Promise<Date> {
  const frozen = await estimateShelfLife(food, 'freezer', db);
  return frozen?.expirationDate ?? addDays(180);
}
