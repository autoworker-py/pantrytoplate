/**
 * Import a recipe by pasting a link.
 *
 * Nearly every recipe site publishes schema.org JSON-LD, so this reads the
 * structured data the page already offers rather than scraping its layout.
 * Imported recipes are the user's own collection — the realistic answer to
 * "thousands of recipes" is that each person gets the fifty they actually cook.
 *
 * Ingredients arrive as free text, so each line goes through the parser and
 * then the catalog matcher. Anything we cannot match becomes a manual catalog
 * entry, and the response says which ones need a human eye.
 */
import { prisma, type Tx } from '../db.js';
import { badRequest } from '../errors.js';
import { env } from '../env.js';
import { parseIngredientLine, parseIsoDuration } from './ingredientParser.js';
import { findOrCreateFoodByName, matchLocalFood } from './foodRef.js';
import { normalizeUnit } from './units.js';
import { sanitizeImportedText } from './text.js';

interface JsonLdRecipe {
  '@type'?: string | string[];
  name?: string;
  description?: string;
  recipeYield?: string | number | Array<string | number>;
  recipeIngredient?: string[];
  ingredients?: string[];
  recipeInstructions?: unknown;
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  recipeCuisine?: string | string[];
  keywords?: string | string[];
}

function isRecipeNode(node: unknown): node is JsonLdRecipe {
  if (!node || typeof node !== 'object') return false;
  const type = (node as JsonLdRecipe)['@type'];
  const types = Array.isArray(type) ? type : [type];
  return types.some((t) => typeof t === 'string' && t.toLowerCase() === 'recipe');
}

/** Walk the whole JSON-LD graph — sites nest the recipe in wildly varied ways. */
function findRecipeNode(node: unknown, depth = 0): JsonLdRecipe | null {
  if (depth > 6 || !node) return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findRecipeNode(child, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== 'object') return null;
  if (isRecipeNode(node)) return node as JsonLdRecipe;

  for (const value of Object.values(node as Record<string, unknown>)) {
    const found = findRecipeNode(value, depth + 1);
    if (found) return found;
  }
  return null;
}

/**
 * Clean up the steps a page gives us.
 *
 * Recipe sites produce three kinds of mess: a step that is really a section
 * heading ("For the sauce:"), leftover numbering that would be doubled by our
 * own, and fragments of two or three words left behind by an over-eager split.
 * All three make an imported recipe look broken next to a seeded one.
 *
 * Headings are folded into the step that follows rather than dropped — a
 * recipe with two components needs to say which part you are on, and deleting
 * that loses real information.
 */
export function tidySteps(steps: string[]): string[] {
  const out: string[] = [];
  let pendingHeading: string | null = null;

  for (const raw of steps) {
    // markup and entities first: everything below reasons about words, and
    // "&frac12;" is not a word
    const step = sanitizeImportedText(raw)
      // the page's own numbering; ours is added back on save
      .replace(/^\s*(?:step\s*)?\d+[.):]\s*/i, '')
      .replace(/^[•*\u2013-]\s*/, '')
      .trim();
    if (!step) continue;

    // "For the sauce:" — a label for what comes next, not an instruction
    const isHeading = /^[^.!?]{2,40}:$/.test(step) && step.split(' ').length <= 6;
    if (isHeading) {
      pendingHeading = step.replace(/:$/, '');
      continue;
    }

    /*
     * Glue a remnant to the step before it - but only a genuine remnant.
     *
     * The old rule merged anything under four words, which quietly destroyed
     * real instructions: a bulleted method of "Rinse the rice", "Drain
     * thoroughly", "Add to the pan" came out as two steps with the first two
     * welded together. Short imperatives are the most common way a recipe is
     * written, not a parsing failure.
     *
     * What is actually left over by an over-eager sentence split is a fragment
     * that continues the previous sentence, and that reads as one: it starts
     * lowercase, or it is a stray initial like "C.".
     */
    const isContinuation = /^[a-z]/.test(step) || step.replace(/[^a-z]/gi, '').length <= 1;
    if (isContinuation && step.split(' ').length < 4 && out.length > 0) {
      out[out.length - 1] += ` ${step}`;
      continue;
    }

    out.push(pendingHeading ? `${pendingHeading}: ${step}` : step);
    pendingHeading = null;
  }

  // a trailing heading with nothing under it still belongs to the reader
  if (pendingHeading && out.length > 0) out[out.length - 1] += ` (${pendingHeading})`;
  return out;
}

function flattenInstructions(raw: unknown, depth = 0): string[] {
  if (depth > 4 || !raw) return [];
  if (typeof raw === 'string') {
    return raw
      .replace(/<[^>]+>/g, ' ')
      // split *after* the full stop, so a step still reads as a sentence
      .split(/\n|(?<=\.)\s+(?=[A-Z])/)
      .map((line) => line.trim())
      .filter((line) => line.length > 3);
  }
  if (Array.isArray(raw)) return raw.flatMap((item) => flattenInstructions(item, depth + 1));
  if (typeof raw === 'object') {
    const node = raw as Record<string, unknown>;
    if (node.itemListElement) return flattenInstructions(node.itemListElement, depth + 1);
    if (node.text) return flattenInstructions(node.text, depth + 1);
    if (node.name) return flattenInstructions(node.name, depth + 1);
  }
  return [];
}

function parseServings(value: JsonLdRecipe['recipeYield']): number {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first === 'number' && Number.isFinite(first)) return Math.max(1, Math.round(first));
  const match = String(first ?? '').match(/\d+/);
  return match ? Math.max(1, Number(match[0])) : 1;
}

/**
 * Recipe sites tag for search engines, not for cooks: "chicken alfredo",
 * "chicken alfredo recipe", "easy chicken alfredo", "30 minute". Left alone
 * these flood the tag filter with one-use phrases that describe the recipe you
 * are already looking at. Keep only short tags that say something about the
 * food rather than repeating its title.
 */
function usefulTags(keywords: string[], recipeName: string): string[] {
  const title = new Set(recipeName.toLowerCase().split(/\s+/).filter(Boolean));
  const seen = new Set<string>();
  const out: string[] = [];

  for (const keyword of keywords) {
    const tag = String(keyword).trim().toLowerCase().replace(/\s+/g, ' ');
    if (!tag || tag.length > 24 || seen.has(tag)) continue;
    const words = tag.split(' ');
    if (words.length > 2) continue;
    // "recipe", "recipes", "best chicken alfredo recipe" — all about SEO
    if (words.some((word) => word === 'recipe' || word === 'recipes')) continue;
    // a tag that merely repeats the title tells a reader nothing new
    if (words.every((word) => title.has(word))) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out.slice(0, 6);
}

export interface ImportPreview {
  name: string;
  description: string | null;
  servings: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  cuisine: string | null;
  tags: string[];
  instructions: string;
  sourceUrl: string;
  ingredients: Array<{
    raw: string;
    quantity: number;
    unit: string;
    name: string;
    note: string | null;
    matchedFoodId: string | null;
    matchedFoodName: string | null;
    matchMethod: string;
  }>;
}

/** Fetch and parse, without writing anything — the user confirms first. */
export async function previewImport(url: string, db: Tx = prisma): Promise<ImportPreview> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw badRequest('That does not look like a link.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw badRequest('Only http and https links can be imported.');
  }
  if (env.offlineMode) throw badRequest('Offline mode is on, so links cannot be fetched.', 'offline');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.externalTimeoutMs);
  let html: string;
  try {
    const response = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: { 'User-Agent': env.offUserAgent, Accept: 'text/html' },
    });
    if (!response.ok) throw badRequest(`That page returned ${response.status}.`, 'fetch_failed');
    html = await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw badRequest('That page took too long to respond.', 'timeout');
    }
    throw badRequest('Could not fetch that page.', 'fetch_failed');
  } finally {
    clearTimeout(timer);
  }

  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  let recipe: JsonLdRecipe | null = null;
  for (const block of blocks) {
    try {
      recipe = findRecipeNode(JSON.parse(block[1]!.trim()));
      if (recipe) break;
    } catch {
      // a malformed block on the page is not our problem; try the next one
    }
  }

  if (!recipe?.name) {
    throw badRequest(
      'That page does not publish a recipe we can read. Try another link, or add it by hand.',
      'no_recipe_found',
    );
  }

  const lines = recipe.recipeIngredient ?? recipe.ingredients ?? [];
  const ingredients = [];
  for (const raw of lines) {
    const parsedLine = parseIngredientLine(String(raw));
    const match = await matchLocalFood(parsedLine.name, db, true);
    ingredients.push({
      raw: String(raw),
      quantity: parsedLine.quantity,
      unit: normalizeUnit(parsedLine.unit),
      name: parsedLine.name,
      note: parsedLine.note,
      matchedFoodId: match.match?.id ?? null,
      matchedFoodName: match.match?.name ?? null,
      matchMethod: match.method,
    });
  }

  const steps = tidySteps(flattenInstructions(recipe.recipeInstructions));
  const keywords = Array.isArray(recipe.keywords)
    ? recipe.keywords
    : String(recipe.keywords ?? '').split(',');

  return {
    name: recipe.name.trim(),
    description: recipe.description?.trim().slice(0, 400) ?? null,
    servings: parseServings(recipe.recipeYield),
    prepMinutes: parseIsoDuration(recipe.prepTime),
    cookMinutes:
      parseIsoDuration(recipe.cookTime) ??
      (parseIsoDuration(recipe.totalTime) !== null && parseIsoDuration(recipe.prepTime) !== null
        ? parseIsoDuration(recipe.totalTime)! - parseIsoDuration(recipe.prepTime)!
        : parseIsoDuration(recipe.totalTime)),
    cuisine: Array.isArray(recipe.recipeCuisine) ? recipe.recipeCuisine[0] ?? null : recipe.recipeCuisine ?? null,
    tags: usefulTags(keywords, recipe.name),
    instructions: steps.map((step, i) => `${i + 1}. ${step}`).join('\n'),
    sourceUrl: parsed.toString(),
    ingredients,
  };
}

/**
 * Save a previewed import. Unmatched ingredients become manual catalog entries.
 *
 * The result belongs to the person who imported it — an import is a private
 * addition to your own book, not a contribution to everyone else's.
 */
export async function saveImport(preview: ImportPreview, ownerId: string, db: Tx = prisma) {
  const created: string[] = [];
  const ingredients: Array<{
    foodReferenceId: string;
    quantityRequired: number;
    unitRequired: string;
    note: string | null;
  }> = [];

  for (const ingredient of preview.ingredients) {
    let foodReferenceId = ingredient.matchedFoodId;
    if (!foodReferenceId) {
      const resolved = await findOrCreateFoodByName(
        { name: ingredient.name, defaultUnit: ingredient.unit },
        db,
      );
      foodReferenceId = resolved.food.id;
      if (resolved.created) created.push(resolved.food.name);
    }
    const unitRequired = normalizeUnit(ingredient.unit);

    /**
     * Recipes list the same thing twice all the time — butter for the sauce and
     * butter for the chicken. Two rows for one food reads as a mistake, and
     * worse, the pantry check runs against each half separately, so having
     * enough butter for the whole recipe can still show as short.
     *
     * Only same-unit rows merge: 1 cup and 1 tbsp of butter cannot be added up
     * here without a conversion context, and guessing is how quantities go
     * wrong quietly.
     */
    const twin = ingredients.find(
      (existing) => existing.foodReferenceId === foodReferenceId && existing.unitRequired === unitRequired,
    );
    if (twin) {
      twin.quantityRequired += ingredient.quantity;
      const notes = [twin.note, ingredient.note].filter(Boolean).join('; ');
      twin.note = notes || null;
      continue;
    }

    ingredients.push({
      foodReferenceId,
      quantityRequired: ingredient.quantity,
      unitRequired,
      note: ingredient.note,
    });
  }

  const recipe = await db.recipe.create({
    data: {
      name: preview.name,
      description: preview.description,
      instructions: preview.instructions || 'No instructions were published on the source page.',
      servings: preview.servings,
      source: 'imported',
      ownerId,
      sourceUrl: preview.sourceUrl,
      prepMinutes: preview.prepMinutes,
      cookMinutes: preview.cookMinutes,
      cuisine: preview.cuisine,
      tags: preview.tags.join(','),
      ingredients: { create: ingredients },
    },
  });

  return {
    recipe,
    /** foods that had to be invented — worth a human glance before cooking */
    newFoods: created,
  };
}
