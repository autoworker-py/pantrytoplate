/**
 * Stand-ins, with the ratio and what it costs you.
 *
 * Only swaps that genuinely work in most dishes. The note is not decoration —
 * "the dish will be less rich" is the difference between a rescued dinner and
 * an unpleasant surprise, and it is why these are suggestions rather than
 * silent substitutions.
 */
export const SUBSTITUTIONS: Array<
  [ingredient: string, substitute: string, ratio: number, note: string, rank?: number]
> = [
  // fats
  ['butter', 'oliveoil', 0.75, 'Works for frying and most cakes. Less rich, and it will not cream with sugar.'],
  ['butter', 'vegoil', 0.75, 'Fine for frying and for batters. Not for pastry.', 2],
  ['butter', 'coconutoil', 1, 'Behaves like butter when solid. Leaves a faint coconut note.', 3],
  ['oliveoil', 'vegoil', 1, 'Neutral rather than peppery — you lose the olive flavour.'],
  ['oliveoil', 'butter', 1, 'Richer, and it burns at a lower temperature.', 2],
  ['vegoil', 'oliveoil', 1, 'Adds an olive flavour, which is welcome in savoury dishes.'],
  ['sesameoil', 'vegoil', 1, 'You lose the toasted sesame flavour; add sesame seeds if you have them.'],

  // dairy
  ['milk', 'semiskimmed', 1, 'Slightly less rich. No other difference.'],
  ['milk', 'almondmilk', 1, 'Fine in baking and porridge. Thinner, and it will not froth.', 2],
  ['milk', 'coconutmilk', 0.75, 'Much richer and faintly sweet. Good in curries, odd in tea.', 3],
  ['semiskimmed', 'milk', 1, 'Slightly richer.'],
  ['doublecream', 'coconutmilk', 1, 'Works in sauces and curries. Will not whip.'],
  ['doublecream', 'creamcheese', 0.75, 'Thickens a sauce well. Loosen it with a splash of milk.', 2],
  ['sourcream', 'yogurt', 1, 'Sharper and thinner. Stir it in off the heat or it will split.'],
  ['yogurt', 'sourcream', 1, 'Richer and less tangy.'],
  ['creamcheese', 'sourcream', 1, 'Looser, so the result will be softer set.'],

  // cheese
  ['parmesan', 'cheddar', 1, 'Milder and meltier. Less of the salty, nutty edge.'],
  ['mozzarella', 'cheddar', 1, 'Sharper and oilier when melted, but it browns well.'],
  ['cheddar', 'mozzarella', 1, 'Milder and stretchier.'],
  ['feta', 'halloumi', 1, 'Firmer and saltier — crumble it in at the end.'],

  // sweeteners
  ['sugar', 'brownsugar', 1, 'Slightly softer and moister, with a faint caramel note.'],
  ['brownsugar', 'sugar', 1, 'Drier and less caramel. Add a teaspoon of honey if you want it back.'],
  ['honey', 'maple', 1, 'Thinner and less floral. Works in most places honey does.'],
  ['maple', 'honey', 1, 'Thicker and more floral.'],
  ['icingsugar', 'sugar', 1, 'Blitz it first, or the result will be gritty.'],

  // starches and grains
  ['spaghetti', 'penne', 1, 'Holds a chunky sauce better than a thin one.'],
  ['penne', 'spaghetti', 1, 'Thin sauces cling better; chunky ones slide off.'],
  ['breadflour', 'flour', 1, 'A slightly softer crumb and less chew.'],
  ['flour', 'breadflour', 1, 'Chewier. Fine for bread, tougher for cakes.'],
  ['cornflour', 'flour', 2, 'Use twice as much, and cook it out longer or it tastes raw.'],
  ['basmati', 'rice', 1, 'Less fragrant, and the grains cling a little more.'],
  ['rice', 'basmati', 1, 'More fragrant and separate.'],
  ['breadcrumbs', 'oats', 1, 'Blitz them first. Coarser, and they brown less.'],

  // aromatics and produce
  ['onion', 'redonion', 1, 'Sweeter and milder once cooked.'],
  ['redonion', 'onion', 1, 'Sharper raw, much the same cooked.'],
  ['onion', 'shallot', 3, 'Use about three shallots per onion. Sweeter and finer.', 2],
  ['shallot', 'onion', 0.34, 'Stronger, so use less. Fine in anything cooked.'],
  ['springonion', 'onion', 0.5, 'Much stronger raw — use half, and cook it if you can.'],
  ['garlic', 'garlicpowder', 0.34, 'About a third of a teaspoon per clove. Flatter, but it works.'],
  ['ginger', 'garammasala', 0.25, 'Not a real swap, but it keeps a curry warm. Use sparingly.', 3],
  ['lemon', 'lime', 1, 'Sharper and more floral. Fine almost everywhere lemon is.'],
  ['lime', 'lemon', 1, 'Rounder and less floral.'],
  ['vinegar', 'lemon', 1, 'Fruitier. Good for dressings, less good for pickling.'],
  ['balsamic', 'vinegar', 1, 'Much sharper and not sweet — add a pinch of sugar.'],

  // herbs
  ['basil', 'driedbasil', 0.34, 'Dried is stronger: use a third, and add it earlier.'],
  ['parsley', 'coriander', 1, 'A completely different flavour, but it fills the same role.', 2],
  ['driedthyme', 'mixedherbs', 1, 'Close enough in anything slow-cooked.'],
  ['oregano', 'mixedherbs', 1, 'Milder and less sharp.'],
  ['rosemary', 'driedthyme', 1, 'Softer and less piney.'],

  // proteins and tins
  ['chicken', 'chickenthigh', 1.6, 'Richer and more forgiving — it will not dry out.'],
  ['chickenthigh', 'chicken', 0.6, 'Leaner, so take it off the heat sooner.'],
  ['beef', 'porkmince', 1, 'Sweeter and fattier. Season a little harder.'],
  ['porkmince', 'beef', 1, 'Deeper and less sweet.'],
  ['tinnedtomato', 'passata', 1, 'Smoother — you lose the chunks.'],
  ['passata', 'tinnedtomato', 1, 'Chunkier. Blitz it if you want it smooth.'],
  ['tomatopaste', 'passata', 4, 'Much weaker, so use far more and reduce it down.'],
  ['cannellini', 'chickpeas', 1, 'Firmer and nuttier.'],
  ['chickpeas', 'cannellini', 1, 'Softer and creamier.'],
  ['kidneybeans', 'blackbeans', 1, 'Softer and earthier.'],
  ['blackbeans', 'kidneybeans', 1, 'Firmer and sweeter.'],
  ['stock', 'vegstock', 1, 'Lighter. Season a little harder at the end.'],
  ['vegstock', 'stock', 1, 'Deeper and more savoury.'],
  ['stock', 'stockcube', 0.004, 'One cube per cup of water, roughly. Saltier — go easy on the salt.', 2],

  // nuts and finishing
  ['almond', 'walnut', 1, 'Softer and more bitter. Toast them first.'],
  ['walnut', 'almond', 1, 'Sweeter and crunchier.'],
  ['pinenut', 'almond', 1, 'Less buttery. Chop them small and toast well.'],
  ['peanut', 'cashew', 1, 'Sweeter and softer.'],
  ['peanutbutter', 'tahini', 1, 'Far less sweet and more bitter — add a little honey.'],
  ['soysauce', 'fishsauce', 0.75, 'Saltier and much more pungent. Use less.'],
  ['fishsauce', 'soysauce', 1.3, 'Less funk, so use a bit more for the same savouriness.'],
];
