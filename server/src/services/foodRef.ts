/**
 * The local food catalog / cache layer.
 *
 * Every external lookup that resolves is written into food_reference, so the
 * second person to scan the same box of pop tarts never hits Open Food Facts.
 * It also means the app keeps working when the external APIs are down or rate
 * limited — the catalog is local, only *new* foods need the network.
 */
import type { Prisma, FoodReference } from '@prisma/client';
import { prisma, type Tx } from '../db.js';
import { badRequest, notFound } from '../errors.js';
import { matchFood, normalizeName, type MatchResult } from './matching.js';
import { normalizeUnit } from './units.js';
import type { ExternalFood } from '../external/types.js';
import { lookupBarcode } from '../external/openfoodfacts.js';
import { estimatePackageGrams } from '../external/packageSize.js';
import { caloriesPerGram, suggestCanonical, type CanonicalTerm } from './canonical.js';
import { getFood as getUsdaFood, searchFoods as searchUsdaFoods } from '../external/usda.js';

/** Write a resolved external food into the local cache (idempotent). */
export async function cacheExternalFood(data: ExternalFood, db: Tx = prisma): Promise<FoodReference> {
  const payload = {
    name: data.name,
    nameNorm: normalizeName(data.name),
    brand: data.brand,
    barcode: data.barcode,
    source: data.source,
    externalId: data.externalId,
    category: data.category,
    defaultUnit: normalizeUnit(data.defaultUnit),
    caloriesPerUnit: data.caloriesPerUnit,
    proteinPerUnit: data.proteinPerUnit,
    fatPerUnit: data.fatPerUnit,
    carbsPerUnit: data.carbsPerUnit,
    servingSizeGrams: data.servingSizeGrams,
  } satisfies Prisma.FoodReferenceUncheckedCreateInput;

  if (data.barcode) {
    const row = await db.foodReference.upsert({
      where: { barcode: data.barcode },
      create: payload,
      update: payload,
    });
    // "1 package" is a real unit for a scanned product, and it is what the user
    // actually bought
    if (data.packageGrams && data.packageGrams > 0) {
      await db.unitConversion.upsert({
        where: {
          foodReferenceId_fromUnit_toUnit: { foodReferenceId: row.id, fromUnit: 'package', toUnit: 'g' },
        },
        create: { foodReferenceId: row.id, fromUnit: 'package', toUnit: 'g', multiplier: data.packageGrams },
        update: { multiplier: data.packageGrams },
      });
    }
    return row;
  }

  const existing = await db.foodReference.findFirst({
    where: { source: data.source, externalId: data.externalId },
  });
  if (existing) {
    return db.foodReference.update({ where: { id: existing.id }, data: payload });
  }
  return db.foodReference.create({ data: payload });
}

/**
 * The generic ingredients a product can be filed under: catalog entries that are
 * not themselves branded products and are not already a variant of something.
 */
async function loadCanonicalTerms(db: Tx = prisma): Promise<CanonicalTerm[]> {
  const foods = await db.foodReference.findMany({
    where: { barcode: null, canonicalId: null },
    include: { synonyms: true },
  });

  const terms: CanonicalTerm[] = [];
  for (const food of foods) {
    const kcal = caloriesPerGram(food);
    terms.push({ term: food.nameNorm, foodId: food.id, foodName: food.name, caloriesPerGram: kcal });
    for (const synonym of food.synonyms) {
      terms.push({ term: synonym.term, foodId: food.id, foodName: food.name, caloriesPerGram: kcal });
    }
  }
  return terms;
}

/**
 * Work out which generic ingredient a product is an instance of, and record it.
 *
 * Without this a scanned olive oil never satisfies a recipe that calls for olive
 * oil. A link we inferred is marked "auto" so the UI can show it and the user
 * can correct it; a link they set themselves is never overwritten.
 */
export async function linkCanonical(foodReferenceId: string, db: Tx = prisma) {
  const food = await db.foodReference.findUnique({ where: { id: foodReferenceId } });
  if (!food) return null;
  // never override what a person told us, and generic foods need no link
  if (food.canonicalSource === 'user' || !food.barcode) return null;

  const suggestion = suggestCanonical(food, await loadCanonicalTerms(db));
  if (!suggestion || suggestion.foodId === food.id) return null;

  await db.foodReference.update({
    where: { id: food.id },
    data: { canonicalId: suggestion.foodId, canonicalSource: 'auto' },
  });
  return suggestion;
}

/** Point a product at a generic ingredient (or clear it) because a person said so. */
export async function setCanonical(
  foodReferenceId: string,
  canonicalId: string | null,
  db: Tx = prisma,
) {
  if (canonicalId === foodReferenceId) throw badRequest('A food cannot be a version of itself.');

  if (canonicalId) {
    const target = await db.foodReference.findUnique({ where: { id: canonicalId } });
    if (!target) throw notFound('That ingredient is not in the catalog.');
    // one level only: pointing at a variant would chain
    if (target.canonicalId) canonicalId = target.canonicalId;
  }

  return db.foodReference.update({
    where: { id: foodReferenceId },
    data: { canonicalId, canonicalSource: canonicalId ? 'user' : null },
  });
}

export interface BarcodeResolution {
  food: FoodReference;
  cached: boolean;
  /** net weight of the package, so the add screen can default to it */
  packageGrams: number | null;
  /** true when that size is a typical-for-its-category guess, not a fact */
  packageEstimated: boolean;
}

/**
 * The package size for a product: what we were told, or failing that a typical
 * size for its category. Estimates are flagged so the UI can say so.
 */
export async function packageGramsFor(
  food: { id: string; category: string | null; servingSizeGrams: number | null },
  db: Tx = prisma,
): Promise<{ grams: number | null; estimated: boolean }> {
  const row = await db.unitConversion.findFirst({
    where: { foodReferenceId: food.id, fromUnit: 'package', toUnit: 'g' },
  });
  if (row) return { grams: Math.round(row.multiplier), estimated: false };

  const guess = estimatePackageGrams(food.category, food.servingSizeGrams);
  return { grams: guess, estimated: guess !== null };
}

/**
 * Barcode -> food. Local cache first, Open Food Facts second. Returns a
 * structured failure (never throws) so the UI can offer manual entry.
 */
export async function resolveBarcode(
  barcode: string,
  db: Tx = prisma,
): Promise<{ ok: true; result: BarcodeResolution } | { ok: false; reason: string; message: string }> {
  const clean = barcode.replace(/\D/g, '');
  const cached = await db.foodReference.findUnique({ where: { barcode: clean } });
  if (cached) {
    const pack = await packageGramsFor(cached, db);
    return {
      ok: true,
      result: { food: cached, cached: true, packageGrams: pack.grams, packageEstimated: pack.estimated },
    };
  }

  const external = await lookupBarcode(clean);
  if (!external.ok) return { ok: false, reason: external.reason, message: external.message };

  const cachedFood = await cacheExternalFood(external.data, db);
  await linkCanonical(cachedFood.id, db);
  const food = (await db.foodReference.findUnique({ where: { id: cachedFood.id } })) ?? cachedFood;
  const pack = external.data.packageGrams
    ? { grams: Math.round(external.data.packageGrams), estimated: false }
    : await packageGramsFor(food, db);
  return {
    ok: true,
    result: { food, cached: false, packageGrams: pack.grams, packageEstimated: pack.estimated },
  };
}

/** Import one USDA food into the local catalog by fdcId. */
export async function importUsdaFood(
  fdcId: string,
  db: Tx = prisma,
): Promise<{ ok: true; food: FoodReference; cached: boolean } | { ok: false; reason: string; message: string }> {
  const cached = await db.foodReference.findFirst({ where: { source: 'usda', externalId: fdcId } });
  if (cached) return { ok: true, food: cached, cached: true };

  const external = await getUsdaFood(fdcId);
  if (!external.ok) return { ok: false, reason: external.reason, message: external.message };

  const importedFood = await cacheExternalFood(external.data, db);
  await linkCanonical(importedFood.id, db);
  const food = (await db.foodReference.findUnique({ where: { id: importedFood.id } })) ?? importedFood;
  return { ok: true, food, cached: false };
}

/** USDA free-text search, for the "I can't find it locally" path. */
export async function searchUsda(query: string) {
  return searchUsdaFoods(query);
}

async function loadSynonymIndex(db: Tx = prisma): Promise<Map<string, string>> {
  const rows = await db.foodSynonym.findMany();
  return new Map(rows.map((r) => [r.term, r.foodReferenceId]));
}

/**
 * Local catalog search used by the manual-add autocomplete and by recipe
 * ingredient linking. Ranked: exact/synonym first, then fuzzy.
 */
export async function searchLocalFoods(query: string, limit = 10, db: Tx = prisma) {
  const norm = normalizeName(query);
  if (!norm) return [];

  const candidates = await db.foodReference.findMany({ take: 1000 });
  const synonyms = await loadSynonymIndex(db);
  const result = matchFood(norm, candidates, synonyms);

  const ranked: FoodReference[] = [];
  if (result.match) ranked.push(result.match as FoodReference);
  for (const alt of result.alternatives) {
    if (!ranked.some((r) => r.id === alt.item.id)) ranked.push(alt.item as FoodReference);
  }
  // fill out with plain substring hits so short queries still feel responsive
  for (const candidate of candidates) {
    if (ranked.length >= limit) break;
    if (candidate.nameNorm.includes(norm) && !ranked.some((r) => r.id === candidate.id)) {
      ranked.push(candidate);
    }
  }
  return ranked.slice(0, limit);
}

/** Best single match for a free-text name, with the method used. */
export async function matchLocalFood(
  name: string,
  db: Tx = prisma,
  /**
   * Match only generic catalog ingredients, skipping scanned products.
   *
   * A recipe asks for "olive oil", not for the particular bottle someone
   * scanned last week. Letting an import bind to a branded row means the recipe
   * is satisfied only by that exact product — and a real import did exactly
   * this, ending up with a Chicken Alfredo that called for
   * "ORGANIC EXTRA VIRGIN OLIVE OIL".
   */
  genericOnly = false,
): Promise<MatchResult<FoodReference>> {
  const candidates = await db.foodReference.findMany({
    where: genericOnly ? { barcode: null, canonicalId: null } : {},
    take: 1000,
  });
  const synonyms = await loadSynonymIndex(db);
  return matchFood(name, candidates, synonyms) as MatchResult<FoodReference>;
}

export interface ManualFoodInput {
  name: string;
  defaultUnit: string;
  category?: string | null;
  caloriesPerUnit?: number | null;
  proteinPerUnit?: number | null;
  fatPerUnit?: number | null;
  carbsPerUnit?: number | null;
  servingSizeGrams?: number | null;
}

/**
 * Manual-add resolution: link to an existing catalog entry when the name
 * matches, otherwise create a `manual` entry. Nutrition stays null unless the
 * user supplied it — we never invent numbers.
 */
export async function findOrCreateFoodByName(
  input: ManualFoodInput,
  db: Tx = prisma,
): Promise<{ food: FoodReference; created: boolean; matchMethod: MatchResult<FoodReference>['method'] }> {
  const match = await matchLocalFood(input.name, db);
  if (match.match) {
    return { food: match.match, created: false, matchMethod: match.method };
  }

  const food = await db.foodReference.create({
    data: {
      name: input.name.trim(),
      nameNorm: normalizeName(input.name),
      source: 'manual',
      category: input.category ?? null,
      defaultUnit: normalizeUnit(input.defaultUnit),
      caloriesPerUnit: input.caloriesPerUnit ?? null,
      proteinPerUnit: input.proteinPerUnit ?? null,
      fatPerUnit: input.fatPerUnit ?? null,
      carbsPerUnit: input.carbsPerUnit ?? null,
      servingSizeGrams: input.servingSizeGrams ?? null,
    },
  });
  return { food, created: true, matchMethod: 'none' };
}
