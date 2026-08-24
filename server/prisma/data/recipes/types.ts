/**
 * The recipe corpus.
 *
 * Every ingredient references a food by key from ../foods.ts. The seed throws on
 * an unknown key, and `corpus.test.ts` walks the whole book asserting that every
 * ingredient links to a real food and that its unit converts to that food's
 * nutrition basis — so a recipe cannot ship if the app could not actually
 * deduct it from someone's pantry.
 */
export interface SeedRecipe {
  name: string;
  description: string;
  servings: number;
  prep: number;
  cook: number;
  difficulty: 'easy' | 'medium' | 'hard';
  cuisine: string;
  tags: string[];
  steps: string[];
  ingredients: Array<[foodKey: string, quantity: number, unit: string, note?: string]>;
}
