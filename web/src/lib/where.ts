import type { StorageLocation } from './types';

/** where a thing usually lives, so the question is a confirmation rather than a chore */
export function homeFor(category: string | null | undefined): StorageLocation {
  if (!category) return 'pantry';
  if (category === 'Frozen') return 'freezer';
  if (['Dairy & Eggs', 'Cheese', 'Meat & Seafood', 'Produce', 'Herbs'].includes(category)) return 'fridge';
  return 'pantry';
}

/*
 * Where a thing goes when nobody has said: the freezer for anything frozen,
 * the fridge for what spoils, the cupboard for what keeps. Scanned products
 * often arrive with a vague category ("Beverages" for milk), so the name
 * counts as much as the category.
 */
const FROZEN = /\bfrozen\b|ice[ -]?cream|gelato|sorbet|popsicle|ice pops?|\bfreezer\b/;
const KEEPS = /powder|evaporated|condensed|\buht\b|shelf[- ]?stable|long[- ]life|dried|canned|tinned|coconut milk|(peanut|almond|nut|apple|cocoa) butter|chocolate|cereal|cracker|cookie|biscuit|crisps|\bchips\b|\bstock\b|broth|bouillon|\bsoup\b/;
const SPOILS = /\bmilk\b|buttermilk|\bcream\b|creamer|yog(h)?urt|kefir|cheese|\bbutter\b|\beggs?\b|tofu|tempeh|hummus|guacamole|pesto|\bdips?\b|cottage|dair(y|ies)|deli|\bham\b|bacon|sausage|hot ?dogs?|salami|turkey|chicken|\bbeef\b|pork|steak|mince|poultry|seafood|\bfish\b|salmon|shrimp|prawns?|lettuce|spinach|salad|\bkale\b|arugula|berries|strawberr|blueberr|raspberr|grapes|\bjuice\b|kombucha|tortellini|ravioli/;

export function whereFor(food: { name: string; category: string | null; countsAs?: { name: string } | null }): StorageLocation {
  const text = `${food.name} ${food.category ?? ''} ${food.countsAs?.name ?? ''}`.toLowerCase();
  if (FROZEN.test(text)) return 'freezer';
  const home = homeFor(food.category);
  if (home !== 'pantry') return home;
  if (KEEPS.test(text)) return 'pantry';
  if (SPOILS.test(text)) return 'fridge';
  return 'pantry';
}
