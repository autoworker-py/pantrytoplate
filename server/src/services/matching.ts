/**
 * Food-name matching: turn "Large Eggs" / "eggs" / "egg" into the one
 * food_reference row the pantry already knows about.
 *
 * Pure module (no DB) so the normaliser and scorer are unit-testable; the
 * DB-backed resolver is in ./foodRef.ts.
 *
 * Order of attack, per spec section 8.1:
 *   1. normalise (lowercase, strip punctuation/pluralisation, drop filler words)
 *   2. exact match on the normalised form
 *   3. synonyms table
 *   4. fuzzy fallback (Dice coefficient on character bigrams) above a threshold
 */

/**
 * Words that carry no identity ("large eggs" and "eggs" are the same food).
 * Preparation words (chopped, ground, ...) are deliberately NOT stripped: they
 * can change the food. The fuzzy pass still links "chopped onion" to "onion".
 */
const FILLER_WORDS = new Set([
  'fresh', 'large', 'small', 'medium', 'jumbo', 'extra', 'organic',
  'pure', 'natural', 'of', 'the', 'a', 'an',
]);

/** Words that look plural but are not. */
const NEVER_SINGULARISE = new Set([
  'molasses', 'asparagus', 'hummus', 'couscous', 'swiss', 'grits', 'oats',
  'greens', 'sprouts', 'chips', 'oreos', 'beans', 'peas', 'lentils', 'noodles',
  'brussels', 'cheerios',
]);

const IRREGULAR: Record<string, string> = {
  leaves: 'leaf',
  loaves: 'loaf',
  halves: 'half',
  knives: 'knife',
  potatoes: 'potato',
  tomatoes: 'tomato',
  mangoes: 'mango',
};

/** Singularise one word with cheap English rules. */
export function singularize(word: string): string {
  if (word.length <= 3) return word;
  if (NEVER_SINGULARISE.has(word)) return word;
  if (word in IRREGULAR) return IRREGULAR[word]!;
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
  if (/(ches|shes|sses|xes|zes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('oes') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) return word.slice(0, -1);
  return word;
}

/**
 * Canonical form used for equality comparison and stored in
 * food_reference.nameNorm / food_synonym.term.
 */
export function normalizeName(raw: string): string {
  const words = String(raw ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(singularize);

  const meaningful = words.filter((w) => !FILLER_WORDS.has(w));
  // never normalise a name out of existence: "organic" alone stays "organic"
  return (meaningful.length > 0 ? meaningful : words).join(' ');
}

/** Character-bigram set for Dice similarity. */
function bigrams(value: string): Map<string, number> {
  const source = value.replace(/\s+/g, ' ');
  const out = new Map<string, number>();
  for (let i = 0; i < source.length - 1; i += 1) {
    const gram = source.slice(i, i + 2);
    out.set(gram, (out.get(gram) ?? 0) + 1);
  }
  return out;
}

/** Sørensen–Dice coefficient, 0..1. */
export function similarity(a: string, b: string): number {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return left === right ? 1 : 0;

  const A = bigrams(left);
  const B = bigrams(right);
  let intersection = 0;
  let sizeA = 0;
  let sizeB = 0;
  for (const count of A.values()) sizeA += count;
  for (const count of B.values()) sizeB += count;
  for (const [gram, count] of A) {
    const other = B.get(gram);
    if (other) intersection += Math.min(count, other);
  }
  let score = (2 * intersection) / (sizeA + sizeB);

  // a full containment ("flour" inside "almond flour") is a strong signal that
  // raw bigrams under-weight, but never let it reach a perfect score
  if (left.includes(right) || right.includes(left)) score = Math.max(score, 0.85);
  return score;
}

/** Below this we refuse to claim a match and let the user decide. */
export const FUZZY_THRESHOLD = 0.72;

export interface Candidate {
  id: string;
  name: string;
  nameNorm: string;
  brand?: string | null;
}

export interface MatchResult<T extends Candidate> {
  match: T | null;
  score: number;
  method: 'exact' | 'synonym' | 'fuzzy' | 'none';
  alternatives: Array<{ item: T; score: number }>;
}

/**
 * Rank candidates against a query. `synonymIndex` maps a normalised synonym
 * term to a food_reference id.
 */
export function matchFood<T extends Candidate>(
  query: string,
  candidates: T[],
  synonymIndex: Map<string, string> = new Map(),
): MatchResult<T> {
  const norm = normalizeName(query);
  if (!norm) return { match: null, score: 0, method: 'none', alternatives: [] };

  const exact = candidates.find((c) => c.nameNorm === norm);
  if (exact) return { match: exact, score: 1, method: 'exact', alternatives: [] };

  const synonymId = synonymIndex.get(norm);
  if (synonymId) {
    const viaSynonym = candidates.find((c) => c.id === synonymId);
    if (viaSynonym) return { match: viaSynonym, score: 1, method: 'synonym', alternatives: [] };
  }

  const scored = candidates
    .map((item) => ({ item, score: similarity(norm, item.nameNorm) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const top = scored[0];
  if (top && top.score >= FUZZY_THRESHOLD) {
    return {
      match: top.item,
      score: top.score,
      method: 'fuzzy',
      alternatives: scored.slice(1).filter((s) => s.score > 0.4),
    };
  }
  return {
    match: null,
    score: top?.score ?? 0,
    method: 'none',
    alternatives: scored.filter((s) => s.score > 0.4),
  };
}
