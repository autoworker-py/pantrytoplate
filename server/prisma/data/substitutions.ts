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

  // ---- bakery ----
  // one loaf standing in for another is the commonest swap of all, and it was
  // missing entirely: a wholemeal recipe with white bread in the pantry
  // offered nothing
  ['bread', 'whitebread', 1, 'Softer and milder. The crumb is lighter, so it toasts faster.'],
  ['whitebread', 'bread', 1, 'Nuttier and denser, and it holds a wet filling better.'],
  ['bread', 'baguette', 1, 'Crustier. Slice thinner or it overwhelms the filling.', 2],
  ['whitebread', 'baguette', 1, 'Crustier and chewier.', 2],
  ['baguette', 'bread', 1, 'Softer, and it will not shatter when you cut it.'],
  ['pittabread', 'tortilla', 1, 'No pocket, so roll rather than fill.'],
  ['tortilla', 'pittabread', 1, 'Thicker and drier; warm it or it cracks when folded.'],
  ['tortilla', 'cornTortilla', 1, 'Corn rather than wheat. Smaller, and it tears more easily.', 2],
  ['cornTortilla', 'tortilla', 1, 'Softer and larger, with a plainer flavour.'],
  ['burgerbun', 'bread', 2, 'Two slices for a bun. Toast them or the middle goes soggy.'],
  ['naan', 'pittabread', 1, 'Drier and less rich, but it does the same job alongside a curry.'],
  ['pittabread', 'naan', 1, 'Richer and softer.', 2],
  ['breadcrumbs', 'crisps', 1, 'Crush them finely. Salty already, so hold back on seasoning.', 3],

  // ---- grains and starches ----
  ['rice', 'brownrice', 1, 'Nuttier and chewier. Needs roughly ten minutes longer and more water.'],
  ['brownrice', 'rice', 1, 'Softer and quicker. Cooks in about half the time.'],
  ['rice', 'couscous', 1, 'Much faster - it only steeps. Lighter, and it will not hold a sauce as well.', 2],
  ['rice', 'quinoa', 1, 'Nuttier, with more protein. Rinse it first or it tastes bitter.', 3],
  ['couscous', 'quinoa', 1, 'Nuttier and firmer, and it takes longer.'],
  ['quinoa', 'couscous', 1, 'Milder and faster.'],
  ['basmati', 'brownrice', 1, 'Nuttier and chewier; give it longer.', 2],
  ['arborio', 'rice', 1, 'Less starch, so the risotto will be looser rather than creamy.'],
  ['oats', 'quinoa', 1, 'Firmer and less creamy.', 3],

  // ---- pasta ----
  ['spaghetti', 'noodles', 1, 'Softer and quicker; they suit a thinner sauce.', 3],
  ['noodles', 'spaghetti', 1, 'Firmer and slower to cook.'],
  ['noodles', 'ricenoodles', 1, 'Softer, and they need soaking rather than boiling.', 2],
  ['ricenoodles', 'noodles', 1, 'Chewier, and they contain wheat.'],
  ['lasagnesheet', 'penne', 1, 'Layer it as a bake rather than sheets - same dish, different shape.', 2],

  // ---- flours ----
  ['flour', 'wholewheatflour', 1, 'Denser and nuttier. Expect a heavier crumb; add a splash more liquid.'],
  ['wholewheatflour', 'flour', 1, 'Lighter and softer, with less flavour.'],
  ['wholewheatflour', 'breadflour', 1, 'Chewier and paler.', 2],

  // ---- dairy and eggs ----
  ['milk', 'doublecream', 0.5, 'Far richer - let it down with water or the dish turns heavy.', 4],
  ['doublecream', 'milk', 2, 'Much thinner. It will not whip and it may split if boiled hard.', 3],
  ['butter', 'ghee', 1, 'Nuttier, and it takes a higher heat.', 4],
  ['yogurt', 'creamcheese', 1, 'Thicker and richer; slacken it with a little milk.', 2],
  ['sourcream', 'creamcheese', 1, 'Thicker and less sharp.', 2],
  ['cheddar', 'parmesan', 0.75, 'Saltier and drier, so use a little less.', 2],
  ['mozzarella', 'halloumi', 1, 'It will not melt - it browns instead. Good on top, wrong inside.', 3],
  ['halloumi', 'feta', 1, 'Saltier and crumbly. It will not hold its shape in a pan.'],
  ['feta', 'creamcheese', 1, 'Much milder and not salty; season more.', 3],
  ['parmesan', 'pecorino', 1, 'Sharper and saltier.'],

  // ---- meat and fish ----
  ['chicken', 'chickenmince', 1, 'Cooks faster and loses the texture of a whole piece.', 2],
  ['chickenmince', 'porkmince', 1, 'Richer and fattier.'],
  ['porkmince', 'chickenmince', 1, 'Leaner and milder; it dries out more easily.', 2],
  ['beef', 'stewingbeef', 1, 'Needs long slow cooking - it will be tough if hurried.', 2],
  ['stewingbeef', 'beef', 1, 'Leaner and quicker, but it will not go as tender in a stew.'],
  ['steak', 'beef', 1, 'Not a steak cut, so cook it through rather than pink.', 2],
  ['bacon', 'ham', 1, 'Less fat and no crisping; add a little oil to the pan.'],
  ['bacon', 'chorizo', 1, 'Spiced and much redder - it will colour the whole dish.', 2],
  ['chorizo', 'bacon', 1, 'Plainer. You lose the paprika, so add a pinch.'],
  ['sausage', 'porkmince', 1, 'Unseasoned - add salt, pepper and a herb.'],
  ['salmon', 'whitefish', 1, 'Leaner and more delicate. It cooks faster and flakes sooner.'],
  ['whitefish', 'salmon', 1, 'Richer and oilier.'],
  ['prawn', 'whitefish', 1, 'Flakes rather than bites; add it later so it does not break up.', 2],
  ['tunacan', 'salmon', 1, 'Softer and richer.', 2],

  // ---- produce ----
  ['potato', 'sweetpotato', 1, 'Sweeter and softer. It will not crisp the same way.'],
  ['sweetpotato', 'potato', 1, 'Plainer and starchier; it holds its shape better.'],
  ['potato', 'babypotato', 1, 'Smaller, so they cook faster - halve them rather than dicing.'],
  ['babypotato', 'potato', 1, 'Cut to size; give them a few minutes longer.'],
  ['courgette', 'aubergine', 1, 'Denser and it drinks more oil. Salt it first if you have time.', 2],
  ['aubergine', 'courgette', 1, 'Softer and much quicker; it will not need as much oil.'],
  ['spinach', 'kale', 1, 'Tougher - it needs a few minutes more and will not wilt to nothing.'],
  ['kale', 'spinach', 1, 'Wilts to almost nothing, so it looks like far less.'],
  ['lettuce', 'rocket', 1, 'Peppery rather than mild.'],
  ['rocket', 'spinach', 1, 'Milder; you lose the pepperiness.', 2],
  ['broccoli', 'cauliflower', 1, 'Milder and paler; roughly the same cooking time.'],
  ['cauliflower', 'broccoli', 1, 'Greener and a little quicker.'],
  ['broccoli', 'greenbeans', 1, 'Firmer and quicker.', 2],
  ['cabbage', 'kale', 1, 'Looser leaves and a stronger flavour.', 2],
  ['leek', 'onion', 1, 'Sharper and stronger. Use a little less if the dish is delicate.'],
  ['onion', 'leek', 1, 'Milder and sweeter; it needs gentler cooking.', 3],
  ['carrot', 'butternut', 1, 'Sweeter and softer - it will break down more in a stew.', 3],
  ['butternut', 'sweetpotato', 1, 'Sweeter and wetter.'],
  ['bellpepper', 'redpepper', 1, 'Sweeter and less grassy.'],
  ['redpepper', 'bellpepper', 1, 'Less sweet.'],
  ['chilli', 'chilliflakes', 0.5, 'Dried, so it is sharper and hotter by weight. Start with half.'],
  ['jalapeno', 'chilli', 1, 'Usually hotter - taste before you commit the lot.', 2],
  ['mushroom', 'aubergine', 1, 'Meatier and it drinks oil; it will not give up water the same way.', 3],
  ['celery', 'leek', 1, 'Sweeter and without the stringiness.', 3],
  ['tomato', 'tinnedtomato', 1, 'Wetter and already broken down - reduce it longer.', 2],

  // ---- fruit ----
  ['apple', 'pear', 1, 'Softer and sweeter; it cooks down faster.'],
  ['pear', 'apple', 1, 'Firmer and sharper.'],
  ['strawberry', 'raspberry', 1, 'Sharper and it collapses more.'],
  ['raspberry', 'blueberry', 1, 'Sweeter and firmer; they hold their shape.'],
  ['blueberry', 'frozenberries', 1, 'Wetter once thawed - fold them in frozen for baking.'],
  ['frozenberries', 'blueberry', 1, 'Firmer and less juice.'],
  ['raisin', 'date', 1, 'Much sweeter and stickier; chop them first.', 2],
  ['date', 'raisin', 1, 'Less sweet and less sticky.'],
  ['driedapricot', 'raisin', 1, 'Sweeter and smaller; you lose the tartness.'],
  ['orange', 'lemon', 0.5, 'Far sharper and not sweet. Half the amount, and expect a different dish.', 3],

  // ---- legumes and nuts ----
  ['redlentil', 'greenlentil', 1, 'They hold their shape instead of collapsing, so the dish stays chunky.'],
  ['greenlentil', 'redlentil', 1, 'They break down completely - good for soup, wrong for a salad.'],
  ['chickpeas', 'blackbeans', 1, 'Softer and darker; they will colour the dish.', 3],
  ['cannellini', 'kidneybeans', 1, 'Firmer and much darker.', 3],
  ['cashew', 'almond', 1, 'Firmer and less creamy when blended.'],
  ['almond', 'cashew', 1, 'Softer and sweeter; it blends smoother.', 2],
  ['walnut', 'pinenut', 1, 'Milder and much more expensive; toast them briefly.', 3],
  ['sunflowerseed', 'sesame', 1, 'Smaller and nuttier once toasted.', 2],
  ['peanut', 'almond', 1, 'Firmer and less oily.', 2],
  ['tofu', 'chickpeas', 1, 'A different texture entirely, but it carries the same sauce.', 3],

  // ---- sweeteners and baking ----
  ['sugar', 'honey', 0.75, 'Sweeter and wet, so cut the liquid a little. It browns faster.', 3],
  ['brownsugar', 'honey', 0.75, 'Wetter; reduce the other liquid slightly.', 3],
  ['maple', 'sugar', 1.25, 'Dry rather than syrup - add a splash of water to make up the difference.', 3],
  ['chocchips', 'darkchocolate', 1, 'Chop it. Less sweet, and it melts into pools rather than staying whole.'],
  ['darkchocolate', 'chocchips', 1, 'Sweeter, and they keep their shape when baked.'],
  ['cocoa', 'darkchocolate', 2, 'Sweet and fatty rather than dry and bitter - cut the sugar and the butter.', 3],
  ['desiccatedcoconut', 'oats', 1, 'Plainer and less sweet.', 3],
  ['bakingpowder', 'bakingsoda', 0.25, 'Much stronger and it needs something acidic to react with.', 2],

  // ---- condiments, sauces and stocks ----
  ['ketchup', 'tomatopaste', 0.5, 'Concentrated and not sweet - add a pinch of sugar and a splash of vinegar.', 2],
  ['mayo', 'yogurt', 1, 'Sharper and much lighter. It will split if you heat it.', 2],
  ['mayo', 'sourcream', 1, 'Tangier and thinner.', 3],
  ['sriracha', 'chillipowder', 0.25, 'Dry and far hotter by weight, with none of the vinegar.', 3],
  ['hoisin', 'soysauce', 1, 'Salty rather than sweet - add a little honey.', 2],
  ['pesto', 'basil', 1, 'Only the herb, so add oil, cheese and a nut to make it work.', 3],
  ['salsa', 'passata', 1, 'Smooth and plain - add onion, chilli and lime.', 3],
  ['currypaste', 'currypowder', 0.5, 'Dry and milder; bloom it in oil first.', 2],
  ['stockcube', 'stock', 200, 'Already made up, so drop the water the recipe adds.', 2],
  ['vegstock', 'stockcube', 0.005, 'Make it up with water first.', 3],
  ['worcestershire', 'soysauce', 1, 'Saltier and without the tamarind sweetness.', 2],
  ['balsamic', 'ricevinegar', 1, 'Much sharper and not sweet; add a pinch of sugar.', 3],
  ['ricevinegar', 'vinegar', 1, 'Harsher - use a touch less.'],
  ['tahini', 'peanutbutter', 1, 'Sweeter and much nuttier; it changes the dish noticeably.', 2],

  // ---- herbs and spices ----
  ['coriander', 'parsley', 1, 'Grassier and without the citrus note.'],
  ['basil', 'mint', 1, 'Sharper and cooler - it suits some dishes and ruins others.', 3],
  ['mint', 'basil', 1, 'Sweeter and less cooling.', 3],
  ['dill', 'parsley', 1, 'Plainer; you lose the aniseed note.', 2],
  ['thyme', 'driedthyme', 0.33, 'Dried is far stronger - a third of the fresh amount.'],
  ['driedbasil', 'basil', 3, 'Fresh is milder, so use about three times as much, added at the end.'],
  ['mixedherbs', 'oregano', 1, 'Single note rather than blended.'],
  ['bayleaf', 'mixedherbs', 1, 'Not the same background savouriness, but close enough in a stew.', 3],
  ['paprika', 'chillipowder', 0.5, 'Hot where paprika is sweet - start with half and taste.', 3],
  ['cumin', 'garammasala', 1, 'A blend rather than a single spice; warmer and more complex.', 2],
  ['coriandergr', 'cumin', 1, 'Earthier and stronger; it will dominate.', 3],
  ['garammasala', 'currypowder', 1, 'Includes turmeric, so it will colour the dish yellow.', 2],
  ['currypowder', 'garammasala', 1, 'Warmer and less yellow.', 2],
  ['cinnamon', 'nutmeg', 0.5, 'Stronger and more perfumed - half the amount.', 3],
  ['nutmeg', 'cinnamon', 2, 'Milder and sweeter; use about twice as much.', 3],
  ['garlicpowder', 'garlic', 8, 'Fresh is milder by weight - roughly a clove per quarter teaspoon.'],
  ['onionpowder', 'onion', 12, 'Fresh, so it adds moisture as well as flavour.', 2],
  ['chillipowder', 'chilliflakes', 1, 'Coarser, so the heat comes in bursts rather than evenly.'],
  ['chilliflakes', 'chillipowder', 1, 'Evenly hot rather than patchy.'],
  ['mustard', 'mustardseed', 0.5, 'Whole seed - toast it first, and it will not emulsify a dressing.', 3],
];
