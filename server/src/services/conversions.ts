/**
 * Database-backed wrapper around the pure conversion engine in ./units.ts.
 *
 * Builds a ConvertContext per food: universal rows (cup -> ml) plus that
 * ingredient's own density rows (1 cup flour -> 120 g) plus the serving-size
 * bridge. Universal rows carry a higher cost so an ingredient-specific row
 * always wins when both could reach the target unit.
 */
import type { Tx } from '../db.js';
import { prisma } from '../db.js';
import type { ConversionEdge, ConvertContext } from './units.js';

const FOOD_SPECIFIC_COST = 1;
const UNIVERSAL_COST = 2;

/** Universal rows change only via seeding/migrations, so cache them. */
let universalCache: { at: number; edges: ConversionEdge[] } | null = null;
const UNIVERSAL_TTL_MS = 60_000;

export function invalidateUniversalConversionCache(): void {
  universalCache = null;
}

async function loadUniversalEdges(db: Tx = prisma): Promise<ConversionEdge[]> {
  if (universalCache && Date.now() - universalCache.at < UNIVERSAL_TTL_MS) {
    return universalCache.edges;
  }
  const rows = await db.unitConversion.findMany({ where: { foodReferenceId: null } });
  const edges = rows.map((r) => ({
    fromUnit: r.fromUnit,
    toUnit: r.toUnit,
    multiplier: r.multiplier,
    cost: UNIVERSAL_COST,
  }));
  universalCache = { at: Date.now(), edges };
  return edges;
}

export interface FoodConversionBasis {
  id: string;
  defaultUnit: string;
  servingSizeGrams: number | null;
  /** a branded product inherits the densities of the ingredient it is a version of */
  canonicalId?: string | null;
}

/** Context for a single food. */
export async function loadConvertContext(
  food: FoodConversionBasis,
  db: Tx = prisma,
): Promise<ConvertContext> {
  // A scanned bottle of olive oil has no density of its own, but the generic
  // olive oil it is a version of does — so it inherits it and a recipe asking
  // for a tablespoon can still be deducted.
  const ids = food.canonicalId ? [food.id, food.canonicalId] : [food.id];

  const [universal, specific, canonical] = await Promise.all([
    loadUniversalEdges(db),
    db.unitConversion.findMany({ where: { foodReferenceId: { in: ids } } }),
    food.canonicalId
      ? db.foodReference.findUnique({
          where: { id: food.canonicalId },
          select: { defaultUnit: true, servingSizeGrams: true },
        })
      : Promise.resolve(null),
  ]);

  // the product's own rows first, so they win over the generic ones
  const ordered = [
    ...specific.filter((r) => r.foodReferenceId === food.id),
    ...specific.filter((r) => r.foodReferenceId !== food.id),
  ];

  return {
    edges: [
      ...ordered.map((r) => ({
        fromUnit: r.fromUnit,
        toUnit: r.toUnit,
        multiplier: r.multiplier,
        cost: FOOD_SPECIFIC_COST,
      })),
      ...canonicalBridge(canonical),
      ...universal,
    ],
    servingSizeGrams: food.servingSizeGrams,
    defaultUnit: food.defaultUnit,
  };
}

/**
 * The generic ingredient's own unit, as a conversion edge.
 *
 * Bread is counted in slices and one slice weighs 28 g — but that lives on the
 * ingredient as a serving weight, not as a conversion row, so inheriting rows
 * alone would leave a scanned loaf unable to answer "how many slices". This
 * turns it into a real edge the product can use.
 */
function canonicalBridge(
  canonical: { defaultUnit: string; servingSizeGrams: number | null } | null,
): ConversionEdge[] {
  if (!canonical?.servingSizeGrams || canonical.servingSizeGrams <= 0) return [];
  if (canonical.defaultUnit === 'g') return [];
  return [
    {
      fromUnit: canonical.defaultUnit,
      toUnit: 'g',
      multiplier: canonical.servingSizeGrams,
      cost: 3,
    },
  ];
}

/** Contexts for many foods in two queries — used by recipe matching. */
export async function loadConvertContexts(
  foods: FoodConversionBasis[],
  db: Tx = prisma,
): Promise<Map<string, ConvertContext>> {
  // include the generic ingredients that any of these are versions of, so a
  // branded product inherits its densities
  const ids = [
    ...new Set(foods.flatMap((f) => (f.canonicalId ? [f.id, f.canonicalId] : [f.id]))),
  ];
  const canonicalIds = [...new Set(foods.map((f) => f.canonicalId).filter((id): id is string => !!id))];

  const [universal, specific, canonicals] = await Promise.all([
    loadUniversalEdges(db),
    ids.length > 0
      ? db.unitConversion.findMany({ where: { foodReferenceId: { in: ids } } })
      : Promise.resolve([]),
    canonicalIds.length > 0
      ? db.foodReference.findMany({
          where: { id: { in: canonicalIds } },
          select: { id: true, defaultUnit: true, servingSizeGrams: true },
        })
      : Promise.resolve([]),
  ]);
  const canonicalById = new Map(canonicals.map((row) => [row.id, row]));

  const byFood = new Map<string, ConversionEdge[]>();
  for (const row of specific) {
    if (!row.foodReferenceId) continue;
    const list = byFood.get(row.foodReferenceId) ?? [];
    list.push({
      fromUnit: row.fromUnit,
      toUnit: row.toUnit,
      multiplier: row.multiplier,
      cost: FOOD_SPECIFIC_COST,
    });
    byFood.set(row.foodReferenceId, list);
  }

  const out = new Map<string, ConvertContext>();
  for (const food of foods) {
    const inherited = food.canonicalId ? byFood.get(food.canonicalId) ?? [] : [];
    const bridge = food.canonicalId ? canonicalBridge(canonicalById.get(food.canonicalId) ?? null) : [];
    out.set(food.id, {
      // own rows first so they take precedence over the generic ingredient's
      edges: [...(byFood.get(food.id) ?? []), ...inherited, ...bridge, ...universal],
      servingSizeGrams: food.servingSizeGrams,
      defaultUnit: food.defaultUnit,
    });
  }
  return out;
}
