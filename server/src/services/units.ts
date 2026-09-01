/**
 * Unit normalisation + conversion engine.
 *
 * This is the piece the "auto-decrement" promise rests on: a recipe says
 * "2 cups flour", inventory says "1 bag (32 oz)", and the subtraction has to be
 * mathematically valid or we silently corrupt the user's pantry.
 *
 * Deliberately pure (no DB, no I/O) so it can be tested exhaustively. The
 * database-backed wrapper lives in ./conversions.ts.
 *
 * Model
 * -----
 * Units are nodes in a graph; conversions are weighted edges. Three sources of
 * edges, in order of trust:
 *
 *   1. ingredient-specific rows   (1 cup flour  -> 120 g)   cost 1
 *   2. universal rows             (1 cup        -> 236.6 ml) cost 1  (built in)
 *   3. the serving-size bridge    (1 egg        -> 50 g)     cost 3
 *
 * Cheapest path wins, so an ingredient's own density always beats a generic
 * inference. No path => we refuse to guess and report `no_conversion`, which
 * the UI turns into "confirm this deduction manually".
 */

export type Dimension = 'mass' | 'volume' | 'count' | 'opaque';

/** grams per 1 unit */
const MASS_TO_G: Record<string, number> = {
  mg: 0.001,
  g: 1,
  kg: 1000,
  oz: 28.349523125,
  lb: 453.59237,
};

/** millilitres per 1 unit */
const VOLUME_TO_ML: Record<string, number> = {
  ml: 1,
  l: 1000,
  dash: 0.6161151992,   // 1/8 tsp
  pinch: 0.3080575996,  // 1/16 tsp
  tsp: 4.92892159375,
  tbsp: 14.78676478125,
  floz: 29.5735295625,
  cup: 236.5882365,
  pint: 473.176473,
  quart: 946.352946,
  gallon: 3785.411784,
};

/** "each" equivalents per 1 unit */
const COUNT_TO_EACH: Record<string, number> = {
  count: 1,
  dozen: 12,
  pair: 2,
  half_dozen: 6,
};

const BASE_OF: Record<Dimension, string> = {
  mass: 'g',
  volume: 'ml',
  count: 'count',
  opaque: '',
};

/**
 * Units we recognise but cannot convert without help: they are containers or
 * ill-defined portions. They only ever convert through an explicit,
 * ingredient-specific row ("1 box pop tarts -> 10 count").
 */
const OPAQUE_UNITS = new Set([
  'box', 'bag', 'can', 'bottle', 'jar', 'package', 'container', 'carton', 'tub',
  'stick', 'slice', 'clove', 'head', 'bunch', 'sprig', 'stalk', 'leaf', 'ear',
  'fillet', 'breast', 'strip', 'loaf', 'bar', 'packet', 'scoop', 'serving',
  'sheet', 'square', 'wedge', 'handful', 'roll',
]);

/** raw token -> canonical unit */
const ALIASES: Record<string, string> = {
  // mass
  mg: 'mg', milligram: 'mg', milligrams: 'mg',
  g: 'g', gr: 'g', gm: 'g', gms: 'g', gram: 'g', grams: 'g', gramme: 'g', grammes: 'g',
  kg: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  // volume
  ml: 'ml', milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml', cc: 'ml',
  l: 'l', liter: 'l', liters: 'l', litre: 'l', litres: 'l',
  tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp', t: 'tsp',
  tbsp: 'tbsp', tbs: 'tbsp', tblsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
  floz: 'floz', 'fl oz': 'floz', 'fluid ounce': 'floz', 'fluid ounces': 'floz', 'fl. oz.': 'floz',
  cup: 'cup', cups: 'cup', c: 'cup',
  pt: 'pint', pint: 'pint', pints: 'pint',
  qt: 'quart', quart: 'quart', quarts: 'quart',
  gal: 'gallon', gallon: 'gallon', gallons: 'gallon',
  dash: 'dash', dashes: 'dash', pinch: 'pinch', pinches: 'pinch',
  // count
  '': 'count',
  count: 'count', ct: 'count', each: 'count', ea: 'count', whole: 'count',
  piece: 'count', pieces: 'count', pc: 'count', pcs: 'count',
  item: 'count', items: 'count', unit: 'count', units: 'count',
  dozen: 'dozen', doz: 'dozen', dozens: 'dozen',
  pair: 'pair', pairs: 'pair',
};

/** Normalise a user- or recipe-supplied unit string to a canonical token. */
export function normalizeUnit(raw: string | null | undefined): string {
  const cleaned = String(raw ?? '')
    .toLowerCase()
    .trim()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ');
  if (cleaned in ALIASES) return ALIASES[cleaned]!;
  const collapsed = cleaned.replace(/\s+/g, '');
  if (collapsed in ALIASES) return ALIASES[collapsed]!;
  // "boxes" -> "box", "cups" -> "cup"
  const candidates = [
    cleaned.replace(/(ch|sh|s|x|z)es$/, '$1'),
    cleaned.replace(/s$/, ''),
    cleaned,
  ];
  for (const candidate of candidates) {
    if (candidate in ALIASES) return ALIASES[candidate]!;
    if (OPAQUE_UNITS.has(candidate)) return candidate;
  }
  const singular = candidates.find((c) => c !== cleaned) ?? cleaned;
  // unrecognised: keep a stable token so an explicit conversion row can still
  // reference it, e.g. a user typing "sachet"
  return singular.replace(/[^a-z0-9_]+/g, '_') || 'count';
}

export function dimensionOf(unit: string): Dimension {
  const u = normalizeUnit(unit);
  if (u in MASS_TO_G) return 'mass';
  if (u in VOLUME_TO_ML) return 'volume';
  if (u in COUNT_TO_EACH) return 'count';
  return 'opaque';
}

/** True for units where quantity is a plain countable number (eggs, pop tarts). */
export function isCountUnit(unit: string): boolean {
  return dimensionOf(unit) === 'count';
}

/** qty in `fromUnit` multiplied by `multiplier` yields qty in `toUnit`. */
export interface ConversionEdge {
  fromUnit: string;
  toUnit: string;
  multiplier: number;
  /** lower = more trusted. ingredient-specific rows should be 1. */
  cost?: number;
}

export interface ConvertContext {
  /** ingredient-specific and universal rows from the unit_conversions table */
  edges?: ConversionEdge[];
  /** grams contained in ONE `defaultUnit` of this food */
  servingSizeGrams?: number | null;
  defaultUnit?: string | null;
}

export type ConvertResult =
  | { ok: true; value: number; factor: number; path: string[] }
  | { ok: false; reason: 'no_conversion'; from: string; to: string };

interface Adjacency {
  [unit: string]: Array<{ to: string; multiplier: number; cost: number }>;
}

function addEdge(adj: Adjacency, from: string, to: string, multiplier: number, cost: number) {
  if (!Number.isFinite(multiplier) || multiplier <= 0) return;
  (adj[from] ??= []).push({ to, multiplier, cost });
  (adj[to] ??= []).push({ to: from, multiplier: 1 / multiplier, cost });
}

function buildGraph(ctx: ConvertContext): Adjacency {
  const adj: Adjacency = {};

  // built-in intra-dimension edges: every unit <-> its dimension's base unit
  for (const [unit, factor] of Object.entries(MASS_TO_G)) {
    if (unit !== 'g') addEdge(adj, unit, 'g', factor, 1);
  }
  for (const [unit, factor] of Object.entries(VOLUME_TO_ML)) {
    if (unit !== 'ml') addEdge(adj, unit, 'ml', factor, 1);
  }
  for (const [unit, factor] of Object.entries(COUNT_TO_EACH)) {
    if (unit !== 'count') addEdge(adj, unit, 'count', factor, 1);
  }

  // table-driven edges (ingredient-specific densities, container sizes, ...)
  for (const e of ctx.edges ?? []) {
    addEdge(adj, normalizeUnit(e.fromUnit), normalizeUnit(e.toUnit), e.multiplier, e.cost ?? 1);
  }

  // the serving-size bridge, trusted least
  if (ctx.servingSizeGrams && ctx.servingSizeGrams > 0) {
    const base = normalizeUnit(ctx.defaultUnit ?? 'count');
    addEdge(adj, base, 'g', ctx.servingSizeGrams, 3);
  }

  return adj;
}

/**
 * Convert `qty` from one unit to another for a specific food.
 *
 * Returns `{ ok: false }` rather than guessing when no conversion path exists —
 * callers surface that to the user instead of mutating inventory.
 */
export function convert(
  qty: number,
  fromUnit: string,
  toUnit: string,
  ctx: ConvertContext = {},
): ConvertResult {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  if (from === to) return { ok: true, value: qty, factor: 1, path: [from] };

  const adj = buildGraph(ctx);

  // Dijkstra on edge trust cost; ties broken by hop count.
  const best = new Map<string, { cost: number; hops: number; factor: number; path: string[] }>();
  best.set(from, { cost: 0, hops: 0, factor: 1, path: [from] });
  const queue: string[] = [from];
  const visited = new Set<string>();

  while (queue.length > 0) {
    queue.sort((a, b) => {
      const A = best.get(a)!;
      const B = best.get(b)!;
      return A.cost - B.cost || A.hops - B.hops;
    });
    const node = queue.shift()!;
    if (visited.has(node)) continue;
    visited.add(node);
    if (node === to) break;

    const current = best.get(node)!;
    for (const edge of adj[node] ?? []) {
      const cost = current.cost + edge.cost;
      const hops = current.hops + 1;
      const existing = best.get(edge.to);
      if (!existing || cost < existing.cost || (cost === existing.cost && hops < existing.hops)) {
        best.set(edge.to, {
          cost,
          hops,
          factor: current.factor * edge.multiplier,
          path: [...current.path, edge.to],
        });
        queue.push(edge.to);
      }
    }
  }

  const target = best.get(to);
  if (!target) return { ok: false, reason: 'no_conversion', from, to };
  return { ok: true, value: qty * target.factor, factor: target.factor, path: target.path };
}

/** Can these two units be compared at all for this food? */
export function canConvert(fromUnit: string, toUnit: string, ctx: ConvertContext = {}): boolean {
  return convert(1, fromUnit, toUnit, ctx).ok;
}

const EPSILON = 1e-6;

/** Floating point safe "is a >= b" for quantities. */
export function gte(a: number, b: number): boolean {
  return a - b > -EPSILON;
}

/** Treat sub-epsilon leftovers as zero so lots don't linger at 1e-15. */
export function clampZero(value: number): number {
  return Math.abs(value) < EPSILON ? 0 : value;
}

/**
 * Is what is left of a lot too small to be worth keeping?
 *
 * Deducting in one unit from a lot stored in another leaves a remainder that is
 * mathematically real and practically nothing: cooking 250 ml out of a gallon
 * of milk left 0.00025 gallons on the shelf, which the pantry then displayed as
 * "0 gallons". A quantity that rounds to zero on screen should be gone, not
 * sitting in the list pretending to be stock.
 *
 * The threshold is expressed in the unit's own base - a gram, a millilitre, a
 * hundredth of an item - so it means the same thing whatever the lot is
 * measured in.
 */
export function isNegligible(quantity: number, unit: string): boolean {
  if (!(quantity > 0)) return true;
  const normalized = normalizeUnit(unit);
  const factorToBase =
    MASS_TO_G[normalized] ?? VOLUME_TO_ML[normalized] ?? COUNT_TO_EACH[normalized] ?? null;
  // an opaque unit (a "bag", a "jar") has no base to reason in, so only a
  // true floating-point sliver counts as nothing
  if (factorToBase === null) return quantity < EPSILON;
  const inBase = quantity * factorToBase;
  const limit = normalized in COUNT_TO_EACH ? 0.01 : 1;
  return inBase < limit;
}

/** Round for display without pretending to precision we don't have. */
export function roundQuantity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const abs = Math.abs(value);
  const decimals = abs >= 100 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 2 : 3;
  return Number(value.toFixed(decimals));
}

/** "2 cup" -> "2 cups", "1 count" -> "1" */
export function formatQuantity(value: number, unit: string): string {
  const qty = roundQuantity(value);
  const u = normalizeUnit(unit);
  if (u === 'count') return `${qty}`;
  const plural = qty === 1 ? u : PLURALS[u] ?? `${u}s`;
  return `${qty} ${plural}`;
}

const PLURALS: Record<string, string> = {
  g: 'g', kg: 'kg', mg: 'mg', ml: 'ml', l: 'l', oz: 'oz', lb: 'lb',
  tsp: 'tsp', tbsp: 'tbsp', floz: 'fl oz',
  dozen: 'dozen', pinch: 'pinches', dash: 'dashes', box: 'boxes',
};

export const KNOWN_UNITS = [
  ...Object.keys(COUNT_TO_EACH),
  ...Object.keys(MASS_TO_G),
  ...Object.keys(VOLUME_TO_ML),
  ...OPAQUE_UNITS,
];

export { MASS_TO_G, VOLUME_TO_ML, COUNT_TO_EACH, BASE_OF, OPAQUE_UNITS };
