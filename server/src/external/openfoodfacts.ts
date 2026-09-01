/**
 * Open Food Facts — barcode/UPC lookup for packaged branded products.
 * Free, open, no key. This is what powers "scan a box, the app knows what it is".
 */
import { env } from '../env.js';
import { getJson, type ExternalOutcome } from './http.js';
import type { ExternalFood } from './types.js';
import { parsePackageGrams } from './packageSize.js';

const BASE = 'https://world.openfoodfacts.org/api/v2/product';
const FIELDS = [
  'code', 'product_name', 'generic_name', 'brands', 'categories',
  'nutriments', 'serving_quantity', 'serving_size', 'quantity', 'product_quantity',
].join(',');

interface OffResponse {
  status?: number;
  product?: {
    code?: string;
    product_name?: string;
    generic_name?: string;
    brands?: string;
    categories?: string;
    serving_quantity?: number | string;
    serving_size?: string;
    /** net weight of the package, in grams */
    product_quantity?: number | string;
    quantity?: string;
    nutriments?: Record<string, number | string | undefined>;
  };
}

const num = (value: unknown): number | null => {
  const parsed = typeof value === 'string' ? Number(value) : (value as number);
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
};

export async function lookupBarcode(barcode: string): Promise<ExternalOutcome<ExternalFood>> {
  const clean = barcode.replace(/\D/g, '');
  if (clean.length < 6) {
    return { ok: false, reason: 'not_found', message: 'That does not look like a barcode.' };
  }

  const result = await getJson<OffResponse>(
    `${BASE}/${encodeURIComponent(clean)}.json?fields=${FIELDS}`,
    { 'User-Agent': env.offUserAgent },
  );
  if (!result.ok) return result;

  const product = result.data.product;
  if (!product || result.data.status === 0) {
    return { ok: false, reason: 'not_found', message: 'No product with that barcode in Open Food Facts.' };
  }

  const name = (product.product_name || product.generic_name || '').trim();
  if (!name) {
    return { ok: false, reason: 'not_found', message: 'Open Food Facts has this barcode but no product name.' };
  }

  const n = product.nutriments ?? {};
  const servingGrams = num(product.serving_quantity);
  const kcalServing = num(n['energy-kcal_serving']);
  const kcal100 = num(n['energy-kcal_100g']) ?? (num(n.energy_100g) !== null ? num(n.energy_100g)! / 4.184 : null);

  // Prefer per-serving numbers when the product declares a serving size, since
  // that is the unit a person actually eats. Fall back to per-gram.
  const perServing = servingGrams !== null && servingGrams > 0;
  const scale100ToServing = (per100: number | null) =>
    per100 === null || !perServing ? null : (per100 * servingGrams!) / 100;

  return {
    ok: true,
    data: {
      name,
      brand: product.brands ? product.brands.split(',')[0]!.trim() : null,
      barcode: clean,
      source: 'openfoodfacts',
      externalId: clean,
      category: product.categories ? product.categories.split(',')[0]!.trim() : null,
      defaultUnit: perServing ? 'serving' : 'g',
      caloriesPerUnit: perServing ? kcalServing ?? scale100ToServing(kcal100) : kcal100 === null ? null : kcal100 / 100,
      proteinPerUnit: perServing
        ? num(n.proteins_serving) ?? scale100ToServing(num(n.proteins_100g))
        : num(n.proteins_100g) === null ? null : num(n.proteins_100g)! / 100,
      fatPerUnit: perServing
        ? num(n.fat_serving) ?? scale100ToServing(num(n.fat_100g))
        : num(n.fat_100g) === null ? null : num(n.fat_100g)! / 100,
      carbsPerUnit: perServing
        ? num(n.carbohydrates_serving) ?? scale100ToServing(num(n.carbohydrates_100g))
        : num(n.carbohydrates_100g) === null ? null : num(n.carbohydrates_100g)! / 100,
      servingSizeGrams: perServing ? servingGrams : 1,
      // falls back to the text off the label, so "16 oz" still gives a pack size
      packageGrams: parsePackageGrams(product.product_quantity, product.quantity),
    },
  };
}

/**
 * Free-text product search.
 *
 * The manual-add box only ever searched the local catalogue, so typing anything
 * the app had not been seeded with produced nothing and the person was left to
 * enter macros by hand. Open Food Facts indexes millions of products and needs
 * no key, which makes it the right backstop for "the app does not know what
 * this is".
 *
 * Results carry their barcode, so choosing one goes through exactly the same
 * resolver as scanning the box - one tested path, not two.
 */
const SEARCH_BASE = 'https://search.openfoodfacts.org/search';

export interface ExternalSearchHit {
  /** the barcode, which is how this result gets resolved into a food */
  code: string;
  name: string;
  brand: string | null;
  caloriesPer100g: number | null;
  quantity: string | null;
}

interface SearchResponse {
  hits?: Array<{
    code?: string;
    product_name?: string;
    product_name_en?: string;
    brands?: string[] | string;
    quantity?: string;
    nutriments?: Record<string, number | string | undefined>;
  }>;
}

export async function searchProducts(
  query: string,
  limit = 12,
): Promise<ExternalOutcome<ExternalSearchHit[]>> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return { ok: true, data: [] };

  const url =
    `${SEARCH_BASE}?q=${encodeURIComponent(trimmed)}` +
    `&page_size=${Math.min(Math.max(limit, 1), 25)}`;

  const result = await getJson<SearchResponse>(url, { 'User-Agent': env.offUserAgent });
  if (!result.ok) return result;

  const hits = result.data.hits ?? [];
  const seen = new Set<string>();
  const mapped: ExternalSearchHit[] = [];

  for (const hit of hits) {
    const code = String(hit.code ?? '').replace(/\D/g, '');
    const name = (hit.product_name_en || hit.product_name || '').trim();
    // without a name there is nothing to show, and without a code there is no
    // way to turn the result into a food
    if (!code || !name) continue;
    // the same product is often listed under several barcodes
    const dedupe = `${name.toLowerCase()}|${String(hit.brands ?? '')}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    const n = hit.nutriments ?? {};
    const kcal100 =
      num(n['energy-kcal_100g']) ??
      (num(n['energy-kj_100g']) !== null ? Math.round(num(n['energy-kj_100g'])! / 4.184) : null);

    mapped.push({
      code,
      name,
      brand: Array.isArray(hit.brands) ? (hit.brands[0] ?? null) : hit.brands ? String(hit.brands).split(',')[0]!.trim() : null,
      caloriesPer100g: kcal100,
      quantity: hit.quantity ? String(hit.quantity) : null,
    });
  }

  return { ok: true, data: mapped };
}
