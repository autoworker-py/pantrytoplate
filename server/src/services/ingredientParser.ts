/**
 * Turn a free-text ingredient line into (quantity, unit, food, note).
 *
 * This is the bottleneck in importing recipes from anywhere: "1 (14.5 oz) can
 * diced tomatoes, drained" has to become a number, a unit, a food we can match,
 * and a note we can show but ignore. Pure and testable — the matching to a
 * catalog row happens elsewhere.
 */
import { normalizeUnit } from './units.js';

export interface ParsedIngredient {
  quantity: number;
  unit: string;
  name: string;
  note: string | null;
  /** false when we had to fall back to a default quantity of 1 */
  quantityFound: boolean;
}

const VULGAR: Record<string, number> = {
  '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75,
  '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8, '⅙': 1 / 6, '⅚': 5 / 6,
  '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
};

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10, dozen: 12,
};

/** Known unit words we are willing to pull out of the front of a line. */
const UNIT_WORDS = new Set([
  'g', 'gram', 'grams', 'kg', 'kilogram', 'kilograms', 'mg',
  'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds',
  'ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres', 'l', 'liter', 'liters', 'litre', 'litres',
  'tsp', 'teaspoon', 'teaspoons', 'tbsp', 'tablespoon', 'tablespoons',
  'cup', 'cups', 'pint', 'pints', 'quart', 'quarts', 'gallon', 'gallons',
  'clove', 'cloves', 'can', 'cans', 'jar', 'jars', 'box', 'boxes', 'bag', 'bags',
  'slice', 'slices', 'stick', 'sticks', 'head', 'heads', 'bunch', 'bunches',
  'package', 'packages', 'packet', 'packets', 'pinch', 'pinches', 'dash', 'dashes',
  'sprig', 'sprigs', 'stalk', 'stalks', 'piece', 'pieces', 'fillet', 'fillets',
  'breast', 'breasts', 'ear', 'ears', 'sheet', 'sheets', 'loaf', 'loaves',
]);

/** Prep words that belong in the note, not the food name. */
const TRAILING_NOTE = /,\s*(.*)$/;

function parseNumberToken(token: string): number | null {
  if (token in VULGAR) return VULGAR[token]!;
  if (token.toLowerCase() in NUMBER_WORDS) return NUMBER_WORDS[token.toLowerCase()]!;

  // mixed vulgar fraction: "1½"
  const mixedVulgar = token.match(/^(\d+)([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])$/);
  if (mixedVulgar) return Number(mixedVulgar[1]) + VULGAR[mixedVulgar[2]!]!;

  // "3/4"
  const fraction = token.match(/^(\d+)\/(\d+)$/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);

  const plain = Number(token.replace(/,/g, ''));
  return Number.isFinite(plain) ? plain : null;
}

export function parseIngredientLine(raw: string): ParsedIngredient {
  let line = String(raw ?? '').trim().replace(/\s+/g, ' ');

  // pull a trailing prep note off first: "diced tomatoes, drained"
  let note: string | null = null;
  const noteMatch = line.match(TRAILING_NOTE);
  if (noteMatch) {
    note = noteMatch[1]!.trim() || null;
    line = line.slice(0, noteMatch.index).trim();
  }

  // "1 (14.5 oz) can diced tomatoes" — the parenthetical is packaging detail
  const parenthetical = line.match(/\(([^)]*)\)/);
  if (parenthetical) {
    note = note ? `${parenthetical[1]!.trim()}, ${note}` : parenthetical[1]!.trim();
    line = line.replace(parenthetical[0], ' ').replace(/\s+/g, ' ').trim();
  }

  // "2-3 cloves garlic" — take the lower bound rather than guessing an average
  line = line.replace(/^(\d+(?:\.\d+)?)\s*[-–—]\s*\d+(?:\.\d+)?/, '$1');

  const tokens = line.split(' ').filter(Boolean);
  let quantity = 1;
  let quantityFound = false;
  let index = 0;

  const first = tokens[0] ? parseNumberToken(tokens[0]) : null;
  if (first !== null) {
    quantity = first;
    quantityFound = true;
    index = 1;

    // "1 1/2 cups" or "1 ½ cups"
    const second = tokens[1] ? parseNumberToken(tokens[1]) : null;
    if (second !== null && second < 1 && tokens[1] !== undefined) {
      quantity += second;
      index = 2;
    }

    // a range written with spaces ("2 - 3 cloves") leaves a stray bound behind
    if (/^[-–—]?\d+(?:\.\d+)?$/.test(tokens[index] ?? '') && tokens[index]!.startsWith('-')) index += 1;
  }

  let unit = 'count';
  const unitToken = tokens[index]?.toLowerCase().replace(/\.$/, '');
  if (unitToken && UNIT_WORDS.has(unitToken)) {
    unit = normalizeUnit(unitToken);
    index += 1;
    // "2 cups of flour"
    if (tokens[index]?.toLowerCase() === 'of') index += 1;
  }

  const name = tokens.slice(index).join(' ').replace(/^of\s+/i, '').trim();

  return {
    quantity: quantity > 0 ? quantity : 1,
    unit,
    name: name || line,
    note,
    quantityFound,
  };
}

/** ISO 8601 duration ("PT1H15M") to minutes — how schema.org states cook times. */
export function parseIsoDuration(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = String(value).match(/^P(?:([\d.]+)D)?T?(?:([\d.]+)H)?(?:([\d.]+)M)?/i);
  if (!match) return null;
  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  const total = days * 1440 + hours * 60 + minutes;
  return total > 0 ? Math.round(total) : null;
}
