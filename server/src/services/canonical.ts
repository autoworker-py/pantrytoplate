/**
 * Working out what a scanned product actually *is*.
 *
 * A barcode scan creates its own catalog row — "ORGANIC EXTRA VIRGIN OLIVE OIL"
 * — but recipes ask for the generic ingredient, "Olive Oil". Without a link
 * between the two the app tells you that you are missing something you are
 * holding in your hand.
 *
 * The rule is the head noun. In English food names the last words say what the
 * thing is and everything before it is description:
 *
 *   "organic extra virgin OLIVE OIL"          -> olive oil    ✓
 *   "organic olive oil, basil & garlic SAUCE" -> a sauce      ✗ (not olive oil)
 *
 * So a catalog name only counts if the product name *ends* with it. Matching
 * anywhere in the string would wrongly file that sauce as olive oil, which is
 * exactly the failure this exists to prevent. Longest match wins, so
 * "coconut milk" beats "milk".
 *
 * A nutrition check then guards against head nouns that lie: almond milk ends
 * in "milk" but has a sixth of the calories, so it is left unlinked rather than
 * silently treated as dairy.
 */
import { normalizeName } from './matching.js';

export interface CanonicalTerm {
  /** normalised catalog name or synonym */
  term: string;
  foodId: string;
  foodName: string;
  caloriesPerGram: number | null;
}

export interface CanonicalSuggestion {
  foodId: string;
  foodName: string;
  matchedTerm: string;
  method: 'exact' | 'head_noun';
  /** why we think so, for the UI to show */
  reason: string;
}

/** Calories per gram, whatever unit the food is stored in. */
export function caloriesPerGram(food: {
  caloriesPerUnit: number | null;
  defaultUnit: string;
  servingSizeGrams: number | null;
}): number | null {
  if (food.caloriesPerUnit === null) return null;
  if (food.defaultUnit === 'g') return food.caloriesPerUnit;
  if (food.servingSizeGrams && food.servingSizeGrams > 0) {
    return food.caloriesPerUnit / food.servingSizeGrams;
  }
  return null;
}

/**
 * Packaging noise that trails the head noun on a label.
 *
 * "CAGE-FREE EGGS GRADE AA LARGE" is eggs, but the head noun is buried behind
 * grading and pack-size text. These words never identify a food, so they can be
 * peeled off the end before looking for it. Anything that could name a food —
 * "sauce", "spread", "mix" — is deliberately absent from this list.
 */
const TRAILING_NOISE = new Set([
  'grade', 'aa', 'aaa', 'a', 'b', 'no', 'class',
  'pack', 'packs', 'packet', 'multipack', 'ct', 'count', 'dozen', 'pk',
  'size', 'value', 'family', 'club', 'bulk', 'net', 'wt', 'weight',
  'oz', 'lb', 'lbs', 'g', 'kg', 'ml', 'l', 'fl', 'floz', 'each', 'per', 'approx',
  'new', 'improved', 'original', 'classic', 'premium', 'select', 'choice',
  // strength and style markers that describe a food without naming one
  'mild', 'hot', 'spicy', 'strong', 'light', 'lite', 'thick', 'thin',
  'smooth', 'crunchy', 'creamy', 'unsalted', 'salted', 'sweetened',
  'unsweetened', 'roasted', 'toasted', 'style', 'flavour', 'flavor', 'blend',
]);

/** Peel packaging noise off the end so the head noun is exposed. */
function stripTrailingNoise(words: string[]): string[] {
  let end = words.length;
  while (end > 1) {
    const word = words[end - 1]!;
    if (TRAILING_NOISE.has(word) || /^\d+(\.\d+)?$/.test(word)) end -= 1;
    else break;
  }
  return words.slice(0, end);
}

/** Does `term` sit at the end of `words`, on a word boundary? */
function endsWithTerm(words: string[], term: string): boolean {
  const termWords = term.split(' ').filter(Boolean);
  if (termWords.length === 0 || termWords.length > words.length) return false;
  const tail = words.slice(words.length - termWords.length);
  return tail.every((word, i) => word === termWords[i]);
}

/**
 * How far apart two calorie densities may be before we refuse to call them the
 * same ingredient.
 *
 * The guard exists for names where the head noun describes something else:
 * "chocolate milk", "butter chicken sauce". There the qualifier is doing real
 * work and the calories are the tiebreak, so the tolerance is tight.
 *
 * When the whole product name *is* the ingredient — "Almondmilk" against Almond
 * Milk — there is no qualifier to be suspicious of, only a sweetened versus
 * unsweetened version of the same thing. Sugar easily doubles the calories of a
 * drink, so that case gets a much wider allowance.
 */
const CALORIE_TOLERANCE = 2.2;
const CALORIE_TOLERANCE_WHOLE_NAME = 5;
const CALORIE_FLOOR = 0.15;

export function suggestCanonical(
  product: { name: string; caloriesPerUnit: number | null; defaultUnit: string; servingSizeGrams: number | null },
  terms: CanonicalTerm[],
): CanonicalSuggestion | null {
  const words = stripTrailingNoise(normalizeName(product.name).split(' ').filter(Boolean));
  if (words.length === 0) return null;

  const productKcal = caloriesPerGram(product);

  const matches = terms
    .filter((candidate) => endsWithTerm(words, candidate.term))
    .sort((a, b) => b.term.split(' ').length - a.term.split(' ').length);

  for (const candidate of matches) {
    const exact = words.join(' ') === candidate.term;

    // a head noun can lie — check the food actually behaves like the ingredient
    if (productKcal !== null && candidate.caloriesPerGram !== null) {
      const tolerance = exact ? CALORIE_TOLERANCE_WHOLE_NAME : CALORIE_TOLERANCE;
      const bigger = Math.max(productKcal, candidate.caloriesPerGram);
      const smaller = Math.min(productKcal, candidate.caloriesPerGram);
      const bothMeaningful = bigger > CALORIE_FLOOR;
      if (bothMeaningful && smaller > 0 && bigger / smaller > tolerance) continue;
      // one is calorie-free and the other is not: not the same thing
      if (bothMeaningful && smaller <= 0) continue;
    }

    return {
      foodId: candidate.foodId,
      foodName: candidate.foodName,
      matchedTerm: candidate.term,
      method: exact ? 'exact' : 'head_noun',
      reason: exact
        ? `Same name as ${candidate.foodName}`
        : `Ends with "${candidate.term}", so we treat it as ${candidate.foodName}`,
    };
  }

  return null;
}
