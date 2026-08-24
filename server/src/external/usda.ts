/**
 * USDA FoodData Central — nutrition for raw/whole ingredients (eggs, flour,
 * produce, meat) and the nutrition backing recipe ingredients.
 *
 * Free key from https://api.data.gov (~1,000 req/hour). DEMO_KEY works without
 * signup at a much lower ceiling, which is why every resolved lookup is cached
 * locally by the caller.
 */
import { env } from '../env.js';
import { getJson, type ExternalOutcome } from './http.js';
import type { ExternalFood } from './types.js';

const BASE = 'https://api.nal.usda.gov/fdc/v1';

/** USDA nutrient numbers; values are per 100 g. */
const NUTRIENT = { energyKcal: '208', protein: '203', fat: '204', carbs: '205' } as const;

interface UsdaNutrient {
  nutrientNumber?: string;
  nutrientName?: string;
  unitName?: string;
  value?: number;
  amount?: number;
  nutrient?: { number?: string; name?: string; unitName?: string };
}

interface UsdaFood {
  fdcId: number;
  description: string;
  brandOwner?: string;
  brandName?: string;
  gtinUpc?: string;
  foodCategory?: string | { description?: string };
  dataType?: string;
  foodNutrients?: UsdaNutrient[];
}

function nutrientValue(food: UsdaFood, number: string): number | null {
  for (const item of food.foodNutrients ?? []) {
    const code = item.nutrientNumber ?? item.nutrient?.number;
    if (code !== number) continue;
    const value = item.value ?? item.amount;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

/** USDA is per-100g, so we store per-gram and let the converter scale it. */
function toExternalFood(food: UsdaFood): ExternalFood {
  const per100 = (code: string) => {
    const value = nutrientValue(food, code);
    return value === null ? null : value / 100;
  };
  const category =
    typeof food.foodCategory === 'string' ? food.foodCategory : food.foodCategory?.description ?? null;

  return {
    name: food.description.trim(),
    brand: food.brandName ?? food.brandOwner ?? null,
    barcode: food.gtinUpc ? food.gtinUpc.replace(/\D/g, '') : null,
    source: 'usda',
    externalId: String(food.fdcId),
    category,
    defaultUnit: 'g',
    caloriesPerUnit: per100(NUTRIENT.energyKcal),
    proteinPerUnit: per100(NUTRIENT.protein),
    fatPerUnit: per100(NUTRIENT.fat),
    carbsPerUnit: per100(NUTRIENT.carbs),
    servingSizeGrams: 1,
    packageGrams: null,
  };
}

export interface UsdaSearchHit {
  fdcId: string;
  name: string;
  brand: string | null;
  category: string | null;
  caloriesPer100g: number | null;
}

export async function searchFoods(query: string, limit = 8): Promise<ExternalOutcome<UsdaSearchHit[]>> {
  const url =
    `${BASE}/foods/search?api_key=${encodeURIComponent(env.usdaApiKey)}` +
    `&query=${encodeURIComponent(query)}&pageSize=${limit}` +
    `&dataType=${encodeURIComponent('Foundation,SR Legacy,Branded')}`;

  const result = await getJson<{ foods?: UsdaFood[] }>(url);
  if (!result.ok) return result;

  const foods = result.data.foods ?? [];
  return {
    ok: true,
    data: foods.map((food) => {
      const kcal = nutrientValue(food, NUTRIENT.energyKcal);
      return {
        fdcId: String(food.fdcId),
        name: food.description.trim(),
        brand: food.brandName ?? food.brandOwner ?? null,
        category: typeof food.foodCategory === 'string' ? food.foodCategory : food.foodCategory?.description ?? null,
        caloriesPer100g: kcal,
      };
    }),
  };
}

export async function getFood(fdcId: string): Promise<ExternalOutcome<ExternalFood>> {
  const url = `${BASE}/food/${encodeURIComponent(fdcId)}?api_key=${encodeURIComponent(env.usdaApiKey)}`;
  const result = await getJson<UsdaFood>(url);
  if (!result.ok) return result;
  if (!result.data?.description) {
    return { ok: false, reason: 'not_found', message: 'USDA returned no food for that id.' };
  }
  return { ok: true, data: toExternalFood(result.data) };
}
