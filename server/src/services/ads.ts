/**
 * Demo monetisation.
 *
 * Two rules the rest of the app depends on:
 *   1. every surface here returns an empty list when the user turns ads off —
 *      no gaps, no placeholders, nothing to lay out around
 *   2. brand names are plain text and every unit is labelled "Sponsored · Demo"
 *
 * Rule 2 matters: reproducing a real company's logo, colours or trade dress in
 * a mock ad implies a commercial relationship that does not exist. A plain-text
 * name demonstrates the placement just as well and claims nothing.
 */
import { prisma, type Tx } from '../db.js';

export type AdSlot = 'home' | 'recipes' | 'shopping';

export interface Ad {
  id: string;
  slot: AdSlot;
  sponsor: string;
  headline: string;
  body: string;
  cta: string;
  /** always shown next to the ad; non-negotiable */
  label: 'Sponsored · Demo';
  foodReferenceId?: string;
}

const LABEL = 'Sponsored · Demo' as const;

export async function adsEnabledFor(userId: string, db: Tx = prisma): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId } });
  return user?.adsEnabled ?? false;
}

/**
 * Shopping list sponsorships: a brand that sponsors a product the user is
 * about to buy. This is the placement with actual commercial logic behind it —
 * the sponsor is attached to the food in the catalog, not scattered at random.
 */
export async function shoppingAds(userId: string, db: Tx = prisma): Promise<Ad[]> {
  if (!(await adsEnabledFor(userId, db))) return [];

  const items = await db.shoppingListItem.findMany({
    where: { userId, isChecked: false, foodReferenceId: { not: null } },
    include: { foodReference: true },
    take: 20,
  });

  const seen = new Set<string>();
  const ads: Ad[] = [];
  for (const item of items) {
    const food = item.foodReference;
    if (!food?.sponsorName || seen.has(food.sponsorName)) continue;
    seen.add(food.sponsorName);
    ads.push({
      id: `shopping-${food.id}`,
      slot: 'shopping',
      sponsor: food.sponsorName,
      headline: `${food.sponsorName} ${food.name}`,
      body: food.sponsorTagline ?? `On your list — ${food.sponsorName} makes it.`,
      cta: 'See in store',
      label: LABEL,
      foodReferenceId: food.id,
    });
    if (ads.length >= 2) break;
  }
  return ads;
}

/**
 * House ads for the home and recipe screens. Drawn from sponsored foods in the
 * catalog so the demo stays coherent instead of showing invented products.
 */
export async function slotAds(userId: string, slot: 'home' | 'recipes', db: Tx = prisma): Promise<Ad[]> {
  if (!(await adsEnabledFor(userId, db))) return [];

  const sponsored = await db.foodReference.findMany({
    where: { sponsorName: { not: null } },
    take: 12,
  });
  if (sponsored.length === 0) return [];

  // rotate by day so the demo does not look frozen
  const index = Math.floor(Date.now() / 86_400_000) % sponsored.length;
  const food = sponsored[(index + (slot === 'recipes' ? 1 : 0)) % sponsored.length]!;

  return [
    {
      id: `${slot}-${food.id}`,
      slot,
      sponsor: food.sponsorName!,
      headline:
        slot === 'home' ? `${food.name} from ${food.sponsorName}` : `Cooking tonight? ${food.sponsorName}.`,
      body: food.sponsorTagline ?? `${food.sponsorName} — a staple worth keeping stocked.`,
      cta: 'Add to list',
      label: LABEL,
      foodReferenceId: food.id,
    },
  ];
}
