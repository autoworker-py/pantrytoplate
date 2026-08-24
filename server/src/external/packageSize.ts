/**
 * Working out how much is in the packet.
 *
 * Open Food Facts sometimes gives a clean numeric `product_quantity` in grams,
 * and sometimes only the text off the label — "16 oz", "1 L", "500g", "2 x 200 g".
 * Both matter: without a package size every scan lands in the pantry as one
 * serving, and recipes then think you own almost nothing.
 *
 * Returns whole grams, because "453.59237 g of butter" is not how anyone
 * describes a pack of butter.
 */
const UNIT_TO_GRAMS: Record<string, number> = {
  g: 1,
  gr: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  mg: 0.001,
  oz: 28.349523125,
  lb: 453.59237,
  lbs: 453.59237,
  // volumes, treated as water-weight: near enough for a pantry, and far better
  // than defaulting to a single serving
  ml: 1,
  cl: 10,
  dl: 100,
  l: 1000,
  litre: 1000,
  liter: 1000,
  floz: 29.5735295625,
};

/**
 * Typical pack sizes, as a last resort.
 *
 * When neither the numeric field nor the label text gives a size, the choice is
 * between asking the user to weigh their shopping and making an honest estimate
 * they can adjust. A wrong-but-close pack size is far better than defaulting to
 * one serving, which is what made everyone's pantry look empty.
 */
const CATEGORY_PACK_GRAMS: Record<string, number> = {
  Snacks: 200,
  Beverages: 1000,
  'Canned Goods': 400,
  Condiments: 350,
  Sauces: 500,
  Baking: 500,
  Grains: 500,
  Pasta: 500,
  Legumes: 400,
  'Nuts & Seeds': 200,
  Spices: 40,
  Herbs: 20,
  'Oils & Vinegars': 500,
  'Dairy & Eggs': 500,
  Cheese: 200,
  Bakery: 400,
  'Meat & Seafood': 450,
  Produce: 400,
  Fruit: 400,
  Frozen: 500,
};

/** A believable pack size for a food we know nothing else about. */
export function estimatePackageGrams(
  category: string | null | undefined,
  servingSizeGrams: number | null | undefined,
): number | null {
  const byCategory = category ? CATEGORY_PACK_GRAMS[category] : undefined;
  if (byCategory) return byCategory;
  // failing that, assume a pack holds roughly a dozen servings
  if (servingSizeGrams && servingSizeGrams > 0) return Math.round(servingSizeGrams * 12);
  return null;
}

export function parsePackageGrams(
  productQuantity: number | string | null | undefined,
  quantityText: string | null | undefined,
): number | null {
  const numeric = typeof productQuantity === 'string' ? Number(productQuantity) : productQuantity;
  if (typeof numeric === 'number' && Number.isFinite(numeric) && numeric > 0) {
    return Math.round(numeric);
  }

  const text = String(quantityText ?? '').toLowerCase().trim();
  if (!text) return null;

  // "2 x 200 g" — a multipack
  const multi = text.match(/(\d+)\s*[x×]\s*([\d.,]+)\s*([a-z]+)/);
  if (multi) {
    const count = Number(multi[1]);
    const each = Number(multi[2]!.replace(',', '.'));
    const factor = UNIT_TO_GRAMS[multi[3]!];
    if (factor && Number.isFinite(count) && Number.isFinite(each)) {
      return Math.round(count * each * factor);
    }
  }

  // "500 g", "16oz", "1.5 l"
  const single = text.match(/([\d.,]+)\s*([a-z]+)/);
  if (single) {
    const amount = Number(single[1]!.replace(',', '.'));
    const factor = UNIT_TO_GRAMS[single[2]!];
    if (factor && Number.isFinite(amount) && amount > 0) return Math.round(amount * factor);
  }

  return null;
}
