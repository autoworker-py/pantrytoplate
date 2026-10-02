/**
 * A recipe from a photo: a handwritten card, a cookbook page, a printout. The
 * photo goes to the AI, which types out what is written there, and it is saved
 * to the person's recipes as an import would be. Pro only: a paid model call.
 */
import { badRequest } from '../errors.js';
import { askModel } from './kitchen.js';
import { requirePlus } from './plus.js';
import { previewOfText, saveImport } from './recipeImport.js';
import { RECIPE_TEXT_SCHEMA, RecipeTextReply } from './socialRecipe.js';

const PROMPT =
  'This photo shows a recipe, perhaps handwritten. Type out what it says: n its name (or a short one from the ingredients if it has none), ' +
  's servings and m total minutes if written, i the ingredient lines with amounts as written ("2 cups flour"), t the steps in order. ' +
  'Where handwriting is hard to read, give your best reading of it; add nothing that is not written. If there is no recipe in the photo, ok false.';

const SAMPLE = {
  ok: true,
  n: 'Nan’s scones',
  s: 8,
  m: 30,
  i: ['225 g self-raising flour', '55 g butter', '25 g sugar', '150 ml milk', '1 pinch salt'],
  t: ['Rub the butter into the flour and salt.', 'Stir in the sugar, then the milk, to a soft dough.', 'Pat out, cut rounds, and bake at 220 °C for 12 minutes.'],
};

export async function scanRecipe(userId: string, image: string, mediaType: string) {
  await requirePlus(userId, 'Scanning recipes is part of Pantry2Plate Pro.');
  const reply = RecipeTextReply.safeParse(
    await askModel(
      PROMPT,
      {
        schema: RECIPE_TEXT_SCHEMA,
        example: '{"ok":true,"n":"Scones","s":8,"m":30,"i":["225 g flour"],"t":["Rub in the butter."]}',
        maxTokens: 1600,
        temperature: 0.1,
        sample: SAMPLE,
        off: 'Scanning recipes is not set up on this server yet.',
      },
      { data: image, mediaType },
    ),
  );
  if (!reply.success || !reply.data.ok || !reply.data.n || !reply.data.i?.length) {
    throw badRequest('No recipe could be read in that photo. Try a closer, brighter shot of the whole recipe.', 'no_recipe_found');
  }
  const preview = await previewOfText(
    { name: reply.data.n, servings: reply.data.s ?? null, minutes: reply.data.m ?? null, ingredients: reply.data.i, steps: reply.data.t ?? [] },
    null,
  );
  const saved = await saveImport(preview, userId);
  return { recipe: { id: saved.recipe.id, name: saved.recipe.name }, ingredientCount: preview.ingredients.length };
}
