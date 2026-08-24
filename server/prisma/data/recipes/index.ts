import type { SeedRecipe } from './types.js';
import { BREAKFAST } from './breakfast.js';
import { POULTRY } from './poultry.js';
import { MEAT } from './meat.js';
import { SEAFOOD } from './seafood.js';
import { VEGETARIAN } from './vegetarian.js';
import { SOUPS_SALADS } from './soups-salads.js';
import { SIDES } from './sides.js';
import { BAKING } from './baking.js';
import { WORLD } from './world.js';
import { PASTA } from './pasta.js';
import { SNACKS } from './snacks.js';

export type { SeedRecipe };

export const RECIPES: SeedRecipe[] = [
  ...BREAKFAST,
  ...POULTRY,
  ...MEAT,
  ...SEAFOOD,
  ...VEGETARIAN,
  ...SOUPS_SALADS,
  ...SIDES,
  ...BAKING,
  ...WORLD,
  ...PASTA,
  ...SNACKS,
];
