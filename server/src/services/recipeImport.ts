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

function flattenInstructions(raw: unknown, depth = 0): string[] {
  if (depth > 4 || !raw) return [];
  if (typeof raw === 'string') {
    return raw
      .replace(/<[^>]+>/g, ' ')
      .split(/\n|\.(?=\s+[A-Z])/)
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
    const match = await matchLocalFood(parsedLine.name, db);
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

  const steps = flattenInstructions(recipe.recipeInstructions);
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
    tags: keywords.map((k) => String(k).trim().toLowerCase()).filter(Boolean).slice(0, 8),
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
  const ingredients = [];

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
    ingredients.push({
      foodReferenceId,
      quantityRequired: ingredient.quantity,
      unitRequired: normalizeUnit(ingredient.unit),
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
