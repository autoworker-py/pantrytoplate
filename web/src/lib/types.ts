export type ExpiryStatus = 'expired' | 'expiring_soon' | 'ok' | 'unknown';
export type IngredientStatus = 'ok' | 'short' | 'missing' | 'unknown_conversion';

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type WeightGoal = 'lose' | 'maintain' | 'gain';
export type RemovalReason = 'other_person' | 'used_up' | 'wasted';
export type StorageLocation = 'pantry' | 'fridge' | 'freezer';

/** A product found in Open Food Facts but not yet in the local catalogue. */
export interface ExternalHit {
  /** the barcode, which is how the result becomes a real food */
  code: string;
  name: string;
  brand: string | null;
  caloriesPer100g: number | null;
  quantity: string | null;
}

export interface Food {
  id: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  category: string | null;
  source: string;
  defaultUnit: string;
  caloriesPerUnit: number | null;
  servingSizeGrams?: number | null;
  /** the generic ingredient a branded product counts as */
  countsAs?: { id: string; name: string; source: string | null } | null;
  canonicalId?: string | null;
}

export interface Macros {
  protein: number | null;
  carbs: number | null;
  fat: number | null;
}

export interface InventoryItem {
  id: string;
  quantity: number;
  unit: string;
  expirationDate: string | null;
  purchasedAt: string;
  daysUntilExpiration: number | null;
  expiryStatus: ExpiryStatus;
  food: Food;
  caloriesRemaining: number | null;
  macrosRemaining: Macros;
  storageLocation: StorageLocation;
  lowStockThreshold: number | null;
  isLowStock: boolean;
  isLeftover?: boolean;
}

export interface LotDeduction {
  inventoryItemId: string;
  unit: string;
  quantityBefore: number;
  quantityDeducted: number;
  quantityAfter: number;
}

export interface Substitute {
  substituteId: string;
  substituteName: string;
  quantity: number;
  unit: string;
  note: string | null;
  available: number;
  enough: boolean;
}

export interface IngredientMatch {
  recipeIngredientId: string;
  foodReferenceId: string;
  name: string;
  /** stand-ins you already own, when this one is missing */
  substitutes: Substitute[];
  /** the products in your pantry that could satisfy this, when there is a choice */
  options: Array<{
    inventoryItemId: string;
    name: string;
    quantity: number;
    unit: string;
    chosen: boolean;
  }>;
  brand: string | null;
  requiredQuantity: number;
  requiredUnit: string;
  status: IngredientStatus;
  available: number;
  shortfall: number;
  note: string | null;
  plan: { deductions: LotDeduction[]; unconvertibleLots: Array<{ quantity: number; unit: string }> };
}

export interface RecipeNutrition {
  caloriesPerServing: number | null;
  proteinPerServing: number | null;
  carbsPerServing: number | null;
  fatPerServing: number | null;
  partial: boolean;
}

export interface RecipeSummary {
  id: string;
  name: string;
  description: string | null;
  servings: number;
  canMakeNow: boolean;
  counts: Record<IngredientStatus, number>;
  missing: string[];
  gaps: number;
  totalMinutes: number | null;
  difficulty: string | null;
  tags: string[];
  nutrition: RecipeNutrition | null;
  usesExpiring: string[];
  reasons: string[];
  /** you imported or wrote this one, rather than it coming with the app */
  isMine: boolean;
  source: string;
}

export interface AlmostRecipe {
  id: string;
  name: string;
  description: string | null;
  servings: number;
  totalMinutes: number | null;
  nutrition: RecipeNutrition | null;
  gaps: number;
  missing: Array<{
    foodReferenceId: string;
    name: string;
    needed: number;
    unit: string;
    status: IngredientStatus;
  }>;
}

export interface WasteLogEntry {
  id: string;
  name: string;
  category: string | null;
  quantity: number;
  unit: string;
  reason: 'wasted' | 'other_person' | 'used_up' | string;
  removedAt: string;
}

export interface IngredientUse {
  recipeId: string;
  recipeName: string;
  quantity: number;
  unit: string;
  totalMinutes: number | null;
  otherGaps: number;
  canMakeWithThis: boolean;
}

export interface RecipeDetail {
  id: string;
  name: string;
  description: string | null;
  servings: number;
  instructions: string;
  canMakeNow: boolean;
  counts: Record<IngredientStatus, number>;
  ingredients: IngredientMatch[];
  totalMinutes: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  difficulty: string | null;
  tags: string[];
  nutrition: RecipeNutrition | null;
  usesExpiring: string[];
  excludedIngredients: Array<{ foodReferenceId: string; name: string; quantity: number; unit: string }>;
  sourceUrl?: string | null;
  isMine: boolean;
  source: string;
}

export interface CookPreview extends RecipeDetail {
  servingsCooked: number;
  blocked: boolean;
  blockingReasons: string[];
  estimatedCalories: number | null;
}

export interface ShoppingItem {
  id: string;
  name: string;
  quantityNeeded: number;
  unit: string;
  isChecked: boolean;
  addedFrom: string;
  foodReferenceId: string | null;
}

export interface DiaryEntry {
  id: string;
  /** a cooked meal is one entry; everything else is a single food */
  kind: 'item' | 'meal';
  ingredientCount: number;
  name: string;
  brand: string | null;
  quantity: number;
  unit: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  source: string;
  mealSlot: MealSlot;
  recipeId: string | null;
  recipeName: string | null;
  consumedAt: string;
}

export interface DayDiary {
  date: string;
  totalCalories: number;
  macros: { protein: number; carbs: number; fat: number };
  macroSplit: { protein: number; carbs: number; fat: number; hasData: boolean };
  targets: { calories: number; protein: number; carbs: number; fat: number };
  caloriesRemaining: number;
  entryCount: number;
  unknownCalorieEntries: number;
  meals: Array<{ slot: MealSlot; entries: DiaryEntry[]; calories: number }>;
  entries: DiaryEntry[];
}

export interface EntryDetail {
  id: string;
  kind: 'item' | 'meal';
  name: string;
  brand: string | null;
  quantity: number;
  unit: string;
  source: string;
  mealSlot: MealSlot;
  consumedAt: string;
  calories: number | null;
  macros: Macros;
  nutritionBasis: string | null;
  canUndo: boolean;
  recipe: {
    id: string;
    name: string;
    servings: number;
    totalCalories: number;
    ingredients: Array<{
      name: string;
      quantity: number;
      unit: string;
      calories: number | null;
      protein?: number | null;
    }>;
  } | null;
}

export type ThemeChoice = 'system' | 'light' | 'dark';

export interface Leftover {
  id: string;
  name: string;
  servings: number;
  caloriesPerServing: number | null;
  expirationDate: string | null;
  recipeId: string | null;
}

export interface RunOutPrediction {
  foodReferenceId: string;
  name: string;
  remaining: number;
  unit: string;
  daysLeft: number;
  runsOutOn: string;
  basedOn: number;
  alreadyOnList: boolean;
}

export interface CookedRecipe {
  recipeId: string;
  name: string;
  timesCooked: number;
  lastCookedAt: string;
  rating: number | null;
  totalMinutes: number | null;
}

export interface PlanEntry {
  id: string;
  recipeId: string;
  recipeName: string;
  plannedFor: string;
  servings: number;
  mealSlot: string;
  cooked: boolean;
  totalMinutes: number | null;
}

export interface WastePattern {
  name: string;
  times: number;
  lastWasted: string;
  suggestion: string;
}

export interface EnergyEstimate {
  bmr: number;
  tdee: number;
  target: number;
  protein: number;
  carbs: number;
  fat: number;
  weeklyRateKg: number;
  flooredAt: number | null;
  notes: string[];
}

export interface BodyData {
  heightCm: number | null;
  weightKg: number | null;
  birthYear: number | null;
  sex: string | null;
  activityLevel: string | null;
  weeklyRateKg: number | null;
}

export interface Settings {
  email: string;
  weightGoal: WeightGoal;
  /** kept on file so a target can follow a weight that moved */
  body: BodyData;
  /** null when there is not enough on file to compute one */
  energy: EnergyEstimate | null;
  dailyCalorieTarget: number;
  proteinTargetGrams: number;
  carbsTargetGrams: number;
  fatTargetGrams: number;
  adsEnabled: boolean;
  autoShoppingEnabled: boolean;
  expiryWarningDays: number;
  unitSystem: 'metric' | 'imperial';
  dietTags: string[];
  notifyExpiry: boolean;
}

export interface Ad {
  id: string;
  slot: string;
  sponsor: string;
  headline: string;
  body: string;
  cta: string;
  label: string;
  foodReferenceId?: string;
}

export interface Dashboard {
  expiryWarningDays: number;
  inventoryCount: number;
  useItUpRecipes: Array<{
    id: string;
    name: string;
    usesExpiring: string[];
    totalMinutes: number | null;
  }>;
  staleItems: Array<{
    id: string;
    name: string;
    quantity: number;
    unit: string;
    untouchedDays: number;
    expired: boolean;
  }>;
  waste: {
    wastedItems: number;
    perWeek: number;
    topWasted: Array<{ name: string; quantity: number; unit: string; times: number }>;
    byCategory: Array<{ category: string; count: number }>;
  };
  ads: Ad[];
  expiring: Array<{
    id: string;
    name: string;
    quantity: number;
    unit: string;
    daysUntilExpiration: number | null;
    expiryStatus: ExpiryStatus;
  }>;
  today: {
    totalCalories: number;
    entryCount: number;
    unknownCalorieEntries: number;
    macros: { protein: number; carbs: number; fat: number };
    macroSplit: { protein: number; carbs: number; fat: number; hasData: boolean };
    targets: { calories: number; protein: number; carbs: number; fat: number };
    caloriesRemaining: number;
  };
  cookableNow: Array<{
    id: string;
    name: string;
    servings: number;
    totalMinutes: number | null;
    nutrition: RecipeNutrition | null;
  }>;
  cookableCount: number;
  shoppingListOpenCount: number;
}

/** A recipe that calls for one particular food — "what can I do with this?" */
export interface RecipeUsingFood {
  id: string;
  name: string;
  description: string | null;
  totalMinutes: number | null;
  quantity: number;
  unit: string;
  canMakeNow: boolean;
  gaps: number;
  missing: string[];
  nutrition: RecipeNutrition | null;
  isMine: boolean;
}

export interface RecipesForFood {
  foodReferenceId: string;
  foodName: string;
  recipes: RecipeUsingFood[];
  total: number;
}
