/** Normalised shape both external sources are mapped into before caching. */
export interface ExternalFood {
  name: string;
  brand: string | null;
  barcode: string | null;
  source: 'usda' | 'openfoodfacts';
  externalId: string;
  category: string | null;
  /** unit the nutrition numbers below are expressed per */
  defaultUnit: string;
  caloriesPerUnit: number | null;
  proteinPerUnit: number | null;
  fatPerUnit: number | null;
  carbsPerUnit: number | null;
  /** grams in one defaultUnit */
  servingSizeGrams: number | null;
  /**
   * Net weight of the whole package.
   *
   * What someone buys is a jar, not a serving — so this is what the add screen
   * should default to. Without it every scanned item lands in the pantry as
   * "1 serving", and recipes then think you own almost nothing.
   */
  packageGrams: number | null;
}
