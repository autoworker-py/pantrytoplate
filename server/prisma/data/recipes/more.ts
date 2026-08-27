import type { SeedRecipe } from './types.js';

/**
 * A second wave of recipes, weighted toward the gaps in the first.
 *
 * The book was heavy on American, British and Italian; this leans into the
 * cuisines that had two or three entries, and toward weeknight cooking with
 * short ingredient lists — the realistic answer to "what can I make right now"
 * is rarely a dish with fourteen components.
 *
 * Every ingredient uses a key from ../foods.ts and a unit that converts to that
 * food's nutrition basis. corpus.test.ts enforces both.
 */
export const MORE: SeedRecipe[] = [
  // ---------------------------------------------------------------- East Asia
  {
    name: 'Egg Fried Rice',
    description: 'Day-old rice is the whole trick; fresh rice steams instead of frying.',
    servings: 2, prep: 8, cook: 10, difficulty: 'easy', cuisine: 'Chinese',
    tags: ['dinner', 'quick', 'vegetarian'],
    steps: [
      'Heat the oil in the widest pan you own until it is genuinely hot.',
      'Scramble the eggs quickly, break them up and set aside.',
      'Fry the spring onion and garlic for thirty seconds, then add the cold rice.',
      'Press the rice flat, leave it to catch, then toss. Repeat twice.',
      'Return the egg, add soy and sesame oil, and toss through the peas.',
    ],
    ingredients: [
      ['rice', 300, 'g'], ['egg', 3, 'count'], ['peas', 100, 'g'], ['springonion', 3, 'count'],
      ['garlic', 2, 'clove'], ['soysauce', 2, 'tbsp'], ['sesameoil', 1, 'tsp'], ['vegoil', 2, 'tbsp'],
    ],
  },
  {
    name: 'Sesame Ginger Noodles',
    description: 'Cold or hot, and better the next day.',
    servings: 2, prep: 10, cook: 8, difficulty: 'easy', cuisine: 'Chinese',
    tags: ['dinner', 'quick', 'vegetarian'],
    steps: [
      'Cook the noodles, then rinse under cold water to stop them clagging.',
      'Whisk soy, sesame oil, rice vinegar, honey and grated ginger into a dressing.',
      'Toss the noodles through the dressing with the cucumber and spring onion.',
      'Finish with sesame seeds and a little chilli.',
    ],
    ingredients: [
      ['noodles', 200, 'g'], ['soysauce', 3, 'tbsp'], ['sesameoil', 2, 'tbsp'],
      ['ricevinegar', 1, 'tbsp'], ['honey', 1, 'tbsp'], ['ginger', 15, 'g'],
      ['cucumber', 1, 'count'], ['springonion', 2, 'count'], ['sesame', 2, 'tbsp'], ['chilliflakes', 1, 'tsp'],
    ],
  },
  {
    name: 'Beef and Broccoli',
    description: 'Slice the beef thinner than feels sensible and it stays tender.',
    servings: 3, prep: 15, cook: 12, difficulty: 'medium', cuisine: 'Chinese',
    tags: ['dinner', 'high-protein'],
    steps: [
      'Slice the steak across the grain as thinly as you can and toss with cornflour and soy.',
      'Blanch the broccoli for two minutes, then drain well.',
      'Sear the beef in a very hot pan in two batches; do not crowd it.',
      'Fry the garlic and ginger, return everything, add hoisin and a splash of stock.',
      'Toss until the sauce clings, then serve over rice.',
    ],
    ingredients: [
      ['steak', 400, 'g'], ['broccoli', 350, 'g'], ['garlic', 3, 'clove'], ['ginger', 15, 'g'],
      ['soysauce', 3, 'tbsp'], ['hoisin', 2, 'tbsp'], ['cornflour', 1, 'tbsp'],
      ['vegoil', 2, 'tbsp'], ['rice', 250, 'g'],
    ],
  },
  {
    name: 'Miso-Style Salmon Bowl',
    description: 'Fifteen minutes, and it eats like it took longer.',
    servings: 2, prep: 10, cook: 15, difficulty: 'easy', cuisine: 'Japanese',
    tags: ['dinner', 'high-protein'],
    steps: [
      'Whisk soy, honey, rice vinegar and sesame oil into a glaze.',
      'Brush the salmon and roast at 200C for twelve minutes.',
      'Steam the rice and the greens.',
      'Spoon the remaining glaze over the fish and scatter with sesame and spring onion.',
    ],
    ingredients: [
      ['salmon', 300, 'g'], ['rice', 250, 'g'], ['broccoli', 200, 'g'], ['soysauce', 2, 'tbsp'],
      ['honey', 1, 'tbsp'], ['ricevinegar', 1, 'tbsp'], ['sesameoil', 1, 'tsp'],
      ['sesame', 1, 'tbsp'], ['springonion', 2, 'count'],
    ],
  },
  {
    name: 'Korean-Style Pork Bowl',
    description: 'Sweet, hot and fast. Mince does the work of a marinade in ten minutes.',
    servings: 3, prep: 10, cook: 14, difficulty: 'easy', cuisine: 'Korean',
    tags: ['dinner', 'high-protein'],
    steps: [
      'Brown the pork mince hard, breaking it up as little as possible.',
      'Add garlic, ginger and chilli flakes and cook for a minute.',
      'Stir in soy, honey and sesame oil and let it reduce and glaze.',
      'Serve over rice with cucumber and spring onion.',
    ],
    ingredients: [
      ['porkmince', 450, 'g'], ['rice', 250, 'g'], ['garlic', 3, 'clove'], ['ginger', 12, 'g'],
      ['chilliflakes', 2, 'tsp'], ['soysauce', 3, 'tbsp'], ['honey', 2, 'tbsp'],
      ['sesameoil', 1, 'tbsp'], ['cucumber', 1, 'count'], ['springonion', 2, 'count'],
    ],
  },
  {
    name: 'Vietnamese-Style Chicken Noodle Salad',
    description: 'A dressing sharp enough to wake the whole plate up.',
    servings: 2, prep: 20, cook: 12, difficulty: 'easy', cuisine: 'Vietnamese',
    tags: ['dinner', 'high-protein'],
    steps: [
      'Poach the chicken gently, then shred it.',
      'Soak the rice noodles and rinse cold.',
      'Whisk fish sauce, lime, sugar, garlic and chilli into a dressing.',
      'Toss noodles, chicken, cucumber, carrot and herbs through the dressing.',
      'Top with peanuts.',
    ],
    ingredients: [
      ['chicken', 350, 'g'], ['ricenoodles', 180, 'g'], ['fishsauce', 2, 'tbsp'], ['lime', 2, 'count'],
      ['sugar', 1, 'tbsp'], ['garlic', 2, 'clove'], ['carrot', 1, 'count'],
      ['cucumber', 1, 'count'], ['mint', 10, 'g'], ['peanut', 40, 'g'],
    ],
  },
  {
    name: 'Thai-Style Green Curry',
    description: 'Fry the paste properly first. It is the difference between fine and good.',
    servings: 4, prep: 12, cook: 22, difficulty: 'easy', cuisine: 'Thai',
    tags: ['dinner'],
    steps: [
      'Fry the curry paste in a little oil for two minutes until it smells of itself.',
      'Add the thick part of the coconut milk and let it split slightly.',
      'Add the chicken and cook through, then the rest of the coconut milk.',
      'Add the aubergine and beans and simmer until tender.',
      'Finish with fish sauce, lime and coriander, and serve with rice.',
    ],
    ingredients: [
      ['chickenthigh', 500, 'g'], ['currypaste', 3, 'tbsp'], ['coconutmilk', 400, 'ml'],
      ['aubergine', 1, 'count'], ['greenbeans', 150, 'g'], ['fishsauce', 2, 'tbsp'],
      ['lime', 1, 'count'], ['coriander', 10, 'g'], ['rice', 250, 'g'], ['vegoil', 1, 'tbsp'],
    ],
  },

  // ------------------------------------------------------------- South Asia
  {
    name: 'Chana Masala',
    description: 'Storecupboard cooking that tastes like it was planned.',
    servings: 4, prep: 10, cook: 30, difficulty: 'easy', cuisine: 'Indian',
    tags: ['dinner', 'vegetarian', 'vegan'],
    steps: [
      'Soften the onion slowly, then add garlic, ginger and the spices.',
      'Cook the spices in the oil for a minute before anything wet goes in.',
      'Add the tinned tomatoes and reduce until the oil separates out.',
      'Add the chickpeas and a splash of water and simmer twenty minutes.',
      'Finish with lemon and coriander.',
    ],
    ingredients: [
      ['chickpeas', 480, 'g'], ['tinnedtomato', 400, 'g'], ['onion', 1, 'count'], ['garlic', 3, 'clove'],
      ['ginger', 15, 'g'], ['garammasala', 2, 'tsp'], ['cumin', 1, 'tsp'], ['turmeric', 1, 'tsp'],
      ['chillipowder', 1, 'tsp'], ['vegoil', 2, 'tbsp'], ['lemon', 1, 'count'], ['coriander', 10, 'g'],
    ],
  },
  {
    name: 'Red Lentil Dal',
    description: 'Cheap, fast, and genuinely one of the better things you can make.',
    servings: 4, prep: 8, cook: 28, difficulty: 'easy', cuisine: 'Indian',
    tags: ['dinner', 'vegetarian', 'vegan'],
    steps: [
      'Simmer the lentils in stock with turmeric until collapsing, about twenty minutes.',
      'Separately, fry cumin and mustard seed in oil until they pop.',
      'Add onion, garlic, ginger and chilli and cook until soft.',
      'Stir the fried spices through the lentils and season hard.',
      'Finish with lemon and serve with naan.',
    ],
    ingredients: [
      ['redlentil', 300, 'g'], ['vegstock', 900, 'ml'], ['onion', 1, 'count'], ['garlic', 3, 'clove'],
      ['ginger', 15, 'g'], ['turmeric', 1, 'tsp'], ['cumin', 1, 'tsp'], ['mustardseed', 1, 'tsp'],
      ['chilli', 1, 'count'], ['vegoil', 2, 'tbsp'], ['lemon', 1, 'count'], ['naan', 2, 'count'],
    ],
  },
  {
    name: 'Saag-Style Paneer Swap',
    description: 'Made with halloumi, which holds its shape the same way and is easier to find.',
    servings: 3, prep: 10, cook: 22, difficulty: 'easy', cuisine: 'Indian',
    tags: ['dinner', 'vegetarian', 'high-protein'],
    steps: [
      'Fry the cubed halloumi until brown on several sides, then set aside.',
      'Soften onion, garlic and ginger, then add garam masala and cumin.',
      'Wilt in the spinach in batches and cook down until thick.',
      'Stir in a little cream, return the halloumi and warm through.',
    ],
    ingredients: [
      ['halloumi', 250, 'g'], ['spinach', 400, 'g'], ['onion', 1, 'count'], ['garlic', 3, 'clove'],
      ['ginger', 12, 'g'], ['garammasala', 2, 'tsp'], ['cumin', 1, 'tsp'],
      ['doublecream', 80, 'ml'], ['vegoil', 2, 'tbsp'],
    ],
  },
  {
    name: 'Bombay-Style Potatoes',
    description: 'A side that regularly outshines what it is next to.',
    servings: 4, prep: 10, cook: 30, difficulty: 'easy', cuisine: 'Indian',
    tags: ['side', 'vegetarian', 'vegan'],
    steps: [
      'Parboil the potatoes until just yielding, then drain and steam dry.',
      'Fry mustard seed and cumin in oil until they crackle.',
      'Add turmeric, chilli and the potatoes and fry hard until crusted.',
      'Finish with coriander and lemon.',
    ],
    ingredients: [
      ['babypotato', 700, 'g'], ['mustardseed', 1, 'tsp'], ['cumin', 1, 'tsp'], ['turmeric', 1, 'tsp'],
      ['chillipowder', 1, 'tsp'], ['vegoil', 3, 'tbsp'], ['coriander', 10, 'g'], ['lemon', 1, 'count'],
    ],
  },

  // ----------------------------------------------------------- Middle East
  {
    name: 'Chicken Shawarma-Style Traybake',
    description: 'All the spicing, none of the vertical rotisserie.',
    servings: 4, prep: 15, cook: 35, difficulty: 'easy', cuisine: 'Middle Eastern',
    tags: ['dinner', 'high-protein'],
    steps: [
      'Toss the thighs with yogurt, cumin, paprika, turmeric, garlic and lemon.',
      'Leave for as long as you have, ideally an hour.',
      'Spread on a tray with sliced onion and roast at 220C for thirty-five minutes.',
      'Serve in pitta with cucumber and a spoon of yogurt.',
    ],
    ingredients: [
      ['chickenthigh', 700, 'g'], ['yogurt', 150, 'g'], ['cumin', 2, 'tsp'], ['paprika', 2, 'tsp'],
      ['turmeric', 1, 'tsp'], ['garlic', 4, 'clove'], ['lemon', 1, 'count'],
      ['onion', 1, 'count'], ['oliveoil', 2, 'tbsp'], ['pittabread', 4, 'count'], ['cucumber', 1, 'count'],
    ],
  },
  {
    name: 'Falafel-Spiced Chickpea Patties',
    description: 'Baked rather than fried, so it is a weeknight rather than an event.',
    servings: 3, prep: 20, cook: 25, difficulty: 'medium', cuisine: 'Middle Eastern',
    tags: ['dinner', 'vegetarian', 'vegan'],
    steps: [
      'Blitz chickpeas with onion, garlic, coriander, cumin and flour to a coarse paste.',
      'Rest the mixture for ten minutes so it firms up.',
      'Shape into patties, brush with oil and bake at 200C for twenty-five minutes, turning once.',
      'Serve in pitta with tahini loosened with lemon and water.',
    ],
    ingredients: [
      ['chickpeas', 480, 'g'], ['onion', 1, 'count'], ['garlic', 3, 'clove'], ['coriander', 15, 'g'],
      ['cumin', 2, 'tsp'], ['flour', 40, 'g'], ['oliveoil', 2, 'tbsp'],
      ['tahini', 3, 'tbsp'], ['lemon', 1, 'count'], ['pittabread', 3, 'count'],
    ],
  },
  {
    name: 'Red Pepper Shakshuka',
    description: 'Breakfast, lunch or supper. The sauce should be thick before the eggs go in.',
    servings: 2, prep: 10, cook: 25, difficulty: 'easy', cuisine: 'Middle Eastern',
    tags: ['breakfast', 'vegetarian'],
    steps: [
      'Soften onion and pepper slowly in olive oil until genuinely sweet.',
      'Add garlic, cumin and paprika and cook for a minute.',
      'Add the tomatoes and reduce until thick enough to hold a spoon trail.',
      'Make wells, crack in the eggs, cover and cook until the whites set.',
      'Finish with feta and parsley, and eat with bread.',
    ],
    ingredients: [
      ['tinnedtomato', 400, 'g'], ['egg', 4, 'count'], ['onion', 1, 'count'], ['bellpepper', 1, 'count'],
      ['garlic', 3, 'clove'], ['cumin', 1, 'tsp'], ['paprika', 1, 'tsp'],
      ['oliveoil', 2, 'tbsp'], ['feta', 60, 'g'], ['parsley', 8, 'g'], ['bread', 2, 'slice'],
    ],
  },
  {
    name: 'Lemon and Herb Couscous Salad',
    description: 'Five minutes of work and it keeps for days.',
    servings: 4, prep: 12, cook: 5, difficulty: 'easy', cuisine: 'Mediterranean',
    tags: ['lunch', 'side', 'vegetarian'],
    steps: [
      'Pour boiling stock over the couscous, cover and leave for five minutes.',
      'Fork it through with olive oil while still warm.',
      'Fold in cucumber, tomato, spring onion and plenty of herbs.',
      'Dress with lemon and season generously.',
    ],
    ingredients: [
      ['couscous', 250, 'g'], ['vegstock', 300, 'ml'], ['cucumber', 1, 'count'], ['tomato', 3, 'count'],
      ['springonion', 3, 'count'], ['parsley', 15, 'g'], ['mint', 10, 'g'],
      ['lemon', 1, 'count'], ['oliveoil', 3, 'tbsp'],
    ],
  },

  // ---------------------------------------------------------------- Mexican
  {
    name: 'Crushed Black Bean Tacos',
    description: 'Cheaper than the meat version and no worse for it.',
    servings: 3, prep: 10, cook: 15, difficulty: 'easy', cuisine: 'Mexican',
    tags: ['dinner', 'vegetarian', 'quick'],
    steps: [
      'Fry onion and garlic, then add cumin, paprika and chilli powder.',
      'Add the black beans with a splash of water and crush about a third of them.',
      'Simmer until thick, then season with lime and salt.',
      'Warm the tortillas and fill with beans, salsa and avocado.',
    ],
    ingredients: [
      ['blackbeans', 480, 'g'], ['onion', 1, 'count'], ['garlic', 2, 'clove'], ['cumin', 2, 'tsp'],
      ['paprika', 1, 'tsp'], ['chillipowder', 1, 'tsp'], ['vegoil', 1, 'tbsp'],
      ['lime', 1, 'count'], ['cornTortilla', 6, 'count'], ['salsa', 100, 'g'], ['avocado', 1, 'count'],
    ],
  },
  {
    name: 'Chicken Fajita Traybake',
    description: 'One tray, and the peppers do most of the seasoning.',
    servings: 4, prep: 12, cook: 25, difficulty: 'easy', cuisine: 'Mexican',
    tags: ['dinner', 'high-protein'],
    steps: [
      'Slice the chicken and peppers and toss with oil, cumin, paprika and chilli.',
      'Spread on a hot tray and roast at 220C for twenty-five minutes.',
      'Squeeze over lime and pile into warm tortillas with sour cream.',
    ],
    ingredients: [
      ['chicken', 600, 'g'], ['bellpepper', 2, 'count'], ['redonion', 1, 'count'],
      ['cumin', 2, 'tsp'], ['paprika', 2, 'tsp'], ['chillipowder', 1, 'tsp'],
      ['oliveoil', 2, 'tbsp'], ['lime', 1, 'count'], ['tortilla', 6, 'count'], ['sourcream', 80, 'g'],
    ],
  },
  {
    name: 'Stacked Huevos Rancheros',
    description: 'A breakfast with opinions.',
    servings: 2, prep: 8, cook: 15, difficulty: 'easy', cuisine: 'Mexican',
    tags: ['breakfast', 'vegetarian'],
    steps: [
      'Warm the black beans with cumin and a little of their liquid.',
      'Fry the tortillas briefly on both sides until they blister.',
      'Fry the eggs so the whites are set and the yolks are not.',
      'Stack tortilla, beans, egg, then salsa, cheese and coriander.',
    ],
    ingredients: [
      ['cornTortilla', 4, 'count'], ['blackbeans', 240, 'g'], ['egg', 4, 'count'], ['salsa', 100, 'g'],
      ['cheddar', 60, 'g'], ['cumin', 1, 'tsp'], ['vegoil', 2, 'tbsp'], ['coriander', 8, 'g'],
    ],
  },
  {
    name: 'Loaded Sweet Potato Skins',
    description: 'Bake the potatoes properly dry and the skins go crisp.',
    servings: 2, prep: 10, cook: 50, difficulty: 'easy', cuisine: 'Mexican',
    tags: ['dinner', 'vegetarian'],
    steps: [
      'Bake the sweet potatoes at 200C until completely soft, about fifty minutes.',
      'Split, scoop a little out, and mash it with black beans and cumin.',
      'Refill, top with cheese and return to the oven until melted.',
      'Finish with sour cream, spring onion and salsa.',
    ],
    ingredients: [
      ['sweetpotato', 2, 'count'], ['blackbeans', 240, 'g'], ['cheddar', 80, 'g'], ['cumin', 1, 'tsp'],
      ['sourcream', 60, 'g'], ['springonion', 2, 'count'], ['salsa', 80, 'g'],
    ],
  },

  // ------------------------------------------------------------ Weeknight
  {
    name: 'Tuna and White Bean Salad',
    description: 'No cooking at all, and better than it has any right to be.',
    servings: 2, prep: 10, cook: 0, difficulty: 'easy', cuisine: 'Italian',
    tags: ['lunch', 'quick', 'high-protein'],
    steps: [
      'Drain the beans and the tuna and put both in a bowl.',
      'Add thinly sliced red onion, parsley and plenty of lemon.',
      'Dress with good olive oil and season hard. Let it sit ten minutes.',
    ],
    ingredients: [
      ['tunacan', 160, 'g'], ['cannellini', 400, 'g'], ['redonion', 1, 'count'],
      ['parsley', 12, 'g'], ['lemon', 1, 'count'], ['oliveoil', 3, 'tbsp'],
    ],
  },
  {
    name: 'Sausage and Butter Bean Stew',
    description: 'Twenty-five minutes for something that tastes like it simmered all afternoon.',
    servings: 3, prep: 8, cook: 25, difficulty: 'easy', cuisine: 'British',
    tags: ['dinner', 'high-protein'],
    steps: [
      'Brown the sausages properly on all sides, then set aside and slice.',
      'Soften onion and garlic in the same pan with the paprika.',
      'Add tomatoes and stock and simmer ten minutes.',
      'Return the sausages with the beans and cook another ten.',
      'Finish with parsley and eat with bread.',
    ],
    ingredients: [
      ['sausage', 400, 'g'], ['cannellini', 400, 'g'], ['tinnedtomato', 400, 'g'],
      ['onion', 1, 'count'], ['garlic', 3, 'clove'], ['paprika', 2, 'tsp'],
      ['stock', 250, 'ml'], ['oliveoil', 1, 'tbsp'], ['parsley', 8, 'g'],
    ],
  },
  {
    name: 'Baked Feta and Tomatoes',
    description: 'The one that went round the internet, and deservedly.',
    servings: 3, prep: 5, cook: 35, difficulty: 'easy', cuisine: 'Greek',
    tags: ['dinner', 'vegetarian'],
    steps: [
      'Put the feta in the middle of a dish and surround it with tomatoes and garlic.',
      'Drench in olive oil, season, and bake at 200C for thirty-five minutes.',
      'Crush everything together into a sauce and toss through the cooked pasta.',
      'Finish with basil.',
    ],
    ingredients: [
      ['feta', 200, 'g'], ['tomato', 500, 'g'], ['garlic', 4, 'clove'], ['oliveoil', 4, 'tbsp'],
      ['penne', 300, 'g'], ['basil', 10, 'g'], ['chilliflakes', 1, 'tsp'],
    ],
  },
  {
    name: 'Mushroom Stroganoff',
    description: 'Brown the mushrooms in batches or they stew and go grey.',
    servings: 3, prep: 10, cook: 22, difficulty: 'easy', cuisine: 'Russian',
    tags: ['dinner', 'vegetarian'],
    steps: [
      'Fry the mushrooms hard in batches until properly browned, then set aside.',
      'Soften the onion and garlic with paprika and mustard.',
      'Deglaze with stock, return the mushrooms and reduce.',
      'Stir in sour cream off the heat and finish with parsley. Serve over rice.',
    ],
    ingredients: [
      ['mushroom', 500, 'g'], ['onion', 1, 'count'], ['garlic', 3, 'clove'], ['paprika', 2, 'tsp'],
      ['mustard', 1, 'tbsp'], ['stock', 200, 'ml'], ['sourcream', 150, 'g'],
      ['butter', 30, 'g'], ['parsley', 8, 'g'], ['rice', 250, 'g'],
    ],
  },
  {
    name: 'Leek and Potato Soup',
    description: 'Four ingredients, and the fewer you add the better it gets.',
    servings: 4, prep: 12, cook: 30, difficulty: 'easy', cuisine: 'French',
    tags: ['lunch', 'vegetarian'],
    steps: [
      'Sweat the sliced leeks in butter with a pinch of salt until soft, without colouring.',
      'Add the diced potato and stock and simmer until the potato collapses.',
      'Blend until smooth, then loosen with a little milk.',
      'Season carefully — it takes more salt than you expect.',
    ],
    ingredients: [
      ['leek', 300, 'g'], ['potato', 500, 'g'], ['vegstock', 1000, 'ml'],
      ['butter', 40, 'g'], ['milk', 150, 'ml'],
    ],
  },
  {
    name: 'Roasted Tomato Soup',
    description: 'Roasting first is the whole difference from the tinned version.',
    servings: 4, prep: 10, cook: 45, difficulty: 'easy', cuisine: 'British',
    tags: ['lunch', 'vegetarian', 'vegan'],
    steps: [
      'Halve the tomatoes and roast with garlic, onion and olive oil at 200C for forty minutes.',
      'Scrape everything into a pan with stock and simmer five minutes.',
      'Blend until smooth and season hard.',
      'Serve with bread.',
    ],
    ingredients: [
      ['tomato', 900, 'g'], ['onion', 1, 'count'], ['garlic', 4, 'clove'], ['oliveoil', 3, 'tbsp'],
      ['vegstock', 500, 'ml'], ['bread', 2, 'slice'],
    ],
  },
  {
    name: 'Honey Mustard Chicken Thighs',
    description: 'Four ingredients on the chicken and a tray does the rest.',
    servings: 4, prep: 8, cook: 40, difficulty: 'easy', cuisine: 'American',
    tags: ['dinner', 'high-protein'],
    steps: [
      'Whisk mustard, honey, olive oil and garlic together.',
      'Coat the thighs and sit them skin-up on a tray with the potatoes.',
      'Roast at 200C for forty minutes, basting once.',
      'Rest five minutes before serving.',
    ],
    ingredients: [
      ['chickenthigh', 800, 'g'], ['mustard', 3, 'tbsp'], ['honey', 2, 'tbsp'],
      ['oliveoil', 2, 'tbsp'], ['garlic', 3, 'clove'], ['babypotato', 600, 'g'],
    ],
  },
  {
    name: 'Tomato and Chickpea Orzo-Style Penne',
    description: 'Cooked in the sauce, so the starch thickens it as it goes.',
    servings: 3, prep: 8, cook: 22, difficulty: 'easy', cuisine: 'Mediterranean',
    tags: ['dinner', 'vegetarian'],
    steps: [
      'Soften onion and garlic in olive oil.',
      'Add passata, stock and the dry pasta and simmer, stirring often.',
      'When the pasta is nearly done, stir in the chickpeas and spinach.',
      'Finish with lemon and parmesan.',
    ],
    ingredients: [
      ['penne', 250, 'g'], ['passata', 400, 'g'], ['chickpeas', 240, 'g'], ['vegstock', 400, 'ml'],
      ['onion', 1, 'count'], ['garlic', 3, 'clove'], ['spinach', 100, 'g'],
      ['oliveoil', 2, 'tbsp'], ['lemon', 1, 'count'], ['parmesan', 40, 'g'],
    ],
  },
  {
    name: 'Greek-Style Chicken Salad',
    description: 'A salad that eats like a meal, which most do not.',
    servings: 2, prep: 15, cook: 12, difficulty: 'easy', cuisine: 'Greek',
    tags: ['lunch', 'high-protein'],
    steps: [
      'Season the chicken with oregano and grill until just cooked, then rest and slice.',
      'Toss cucumber, tomato, red onion and olives with olive oil and lemon.',
      'Add the chicken and crumble feta over the top.',
    ],
    ingredients: [
      ['chicken', 350, 'g'], ['cucumber', 1, 'count'], ['tomato', 3, 'count'], ['redonion', 1, 'count'],
      ['feta', 100, 'g'], ['oregano', 2, 'tsp'], ['oliveoil', 3, 'tbsp'], ['lemon', 1, 'count'],
    ],
  },
  {
    name: 'Salmon and Asparagus Traybake',
    description: 'Twenty minutes, one tray, nothing to watch.',
    servings: 2, prep: 8, cook: 18, difficulty: 'easy', cuisine: 'British',
    tags: ['dinner', 'high-protein', 'quick'],
    steps: [
      'Toss the asparagus and baby potatoes in oil and roast at 200C for ten minutes.',
      'Add the salmon, lemon slices and garlic and roast twelve minutes more.',
      'Finish with dill and a squeeze of lemon.',
    ],
    ingredients: [
      ['salmon', 300, 'g'], ['asparagus', 250, 'g'], ['babypotato', 400, 'g'],
      ['lemon', 1, 'count'], ['garlic', 3, 'clove'], ['oliveoil', 2, 'tbsp'], ['dill', 8, 'g'],
    ],
  },
  {
    name: 'Cauliflower and Chickpea Curry',
    description: 'Roast the cauliflower first — boiled cauliflower in curry is a sad thing.',
    servings: 4, prep: 12, cook: 35, difficulty: 'easy', cuisine: 'Indian',
    tags: ['dinner', 'vegetarian', 'vegan'],
    steps: [
      'Roast the cauliflower florets with oil and turmeric at 220C for twenty-five minutes.',
      'Meanwhile fry onion, garlic and ginger with curry powder and cumin.',
      'Add tomatoes and coconut milk and simmer fifteen minutes.',
      'Stir in the chickpeas and the roasted cauliflower and warm through.',
      'Finish with coriander and lemon.',
    ],
    ingredients: [
      ['cauliflower', 600, 'g'], ['chickpeas', 480, 'g'], ['coconutmilk', 400, 'ml'],
      ['tinnedtomato', 400, 'g'], ['onion', 1, 'count'], ['garlic', 3, 'clove'], ['ginger', 15, 'g'],
      ['currypowder', 2, 'tbsp'], ['cumin', 1, 'tsp'], ['turmeric', 1, 'tsp'],
      ['vegoil', 2, 'tbsp'], ['coriander', 10, 'g'], ['lemon', 1, 'count'],
    ],
  },
  {
    name: 'Pesto Butter Beans and Greens',
    description: 'Ten minutes, mostly opening tins, and genuinely good.',
    servings: 2, prep: 5, cook: 10, difficulty: 'easy', cuisine: 'Italian',
    tags: ['lunch', 'quick', 'vegetarian'],
    steps: [
      'Warm the beans gently in a pan with a splash of their liquid.',
      'Wilt the spinach through them.',
      'Stir in the pesto off the heat so it does not split.',
      'Finish with lemon and eat with bread.',
    ],
    ingredients: [
      ['cannellini', 400, 'g'], ['spinach', 150, 'g'], ['pesto', 3, 'tbsp'],
      ['lemon', 1, 'count'], ['oliveoil', 1, 'tbsp'], ['bread', 2, 'slice'],
    ],
  },
  {
    name: 'Spanish-Style Potato Omelette',
    description: 'Cook the potatoes slowly in a lot of oil. That is the recipe.',
    servings: 4, prep: 15, cook: 35, difficulty: 'medium', cuisine: 'Spanish',
    tags: ['dinner', 'vegetarian', 'high-protein'],
    steps: [
      'Slice the potatoes and onion thinly and cook gently in plenty of olive oil until soft, not brown.',
      'Drain, then fold into the beaten eggs and leave to sit ten minutes.',
      'Cook in a smaller pan over a low heat until nearly set.',
      'Invert onto a plate and slide back in to finish the other side.',
    ],
    ingredients: [
      ['potato', 600, 'g'], ['onion', 1, 'count'], ['egg', 6, 'count'], ['oliveoil', 6, 'tbsp'],
    ],
  },
  {
    name: 'Chorizo and Chickpea Stew',
    description: 'The chorizo seasons everything; go easy on the salt until the end.',
    servings: 3, prep: 8, cook: 25, difficulty: 'easy', cuisine: 'Spanish',
    tags: ['dinner', 'high-protein'],
    steps: [
      'Fry the chorizo until its oil runs, then lift it out.',
      'Cook onion, garlic and pepper in that oil with the paprika.',
      'Add tomatoes and stock, simmer fifteen minutes.',
      'Return the chorizo with the chickpeas and spinach and warm through.',
    ],
    ingredients: [
      ['chorizo', 200, 'g'], ['chickpeas', 480, 'g'], ['tinnedtomato', 400, 'g'],
      ['onion', 1, 'count'], ['garlic', 3, 'clove'], ['bellpepper', 1, 'count'],
      ['paprika', 2, 'tsp'], ['stock', 250, 'ml'], ['spinach', 100, 'g'],
    ],
  },
  {
    name: 'Halloumi and Couscous Bowl',
    description: 'Fry the halloumi last so it reaches the table squeaking.',
    servings: 2, prep: 12, cook: 12, difficulty: 'easy', cuisine: 'Mediterranean',
    tags: ['lunch', 'vegetarian', 'high-protein'],
    steps: [
      'Soak the couscous in hot stock and fork through with olive oil.',
      'Fold in tomato, cucumber, parsley and lemon.',
      'Fry the halloumi until deeply golden on both sides.',
      'Lay it over the couscous and finish with more lemon.',
    ],
    ingredients: [
      ['halloumi', 225, 'g'], ['couscous', 180, 'g'], ['vegstock', 220, 'ml'],
      ['tomato', 2, 'count'], ['cucumber', 1, 'count'], ['parsley', 10, 'g'],
      ['lemon', 1, 'count'], ['oliveoil', 2, 'tbsp'],
    ],
  },
  {
    name: 'Slow Beef Chilli',
    description: 'Better on day two, so make more than you need.',
    servings: 4, prep: 12, cook: 45, difficulty: 'easy', cuisine: 'Mexican',
    tags: ['dinner', 'high-protein'],
    steps: [
      'Brown the mince hard and in batches, then set aside.',
      'Soften onion, garlic and pepper, then add cumin, paprika and chilli powder.',
      'Return the beef with tomatoes and stock and simmer forty minutes.',
      'Add the kidney beans for the last ten minutes.',
      'Serve over rice with sour cream.',
    ],
    ingredients: [
      ['stewingbeef', 500, 'g'], ['kidneybeans', 400, 'g'], ['tinnedtomato', 400, 'g'],
      ['onion', 1, 'count'], ['garlic', 3, 'clove'], ['bellpepper', 1, 'count'],
      ['cumin', 2, 'tsp'], ['paprika', 2, 'tsp'], ['chillipowder', 2, 'tsp'],
      ['stock', 300, 'ml'], ['rice', 250, 'g'], ['sourcream', 80, 'g'],
    ],
  },
  {
    name: 'Garlic Butter Prawns',
    description: 'Ninety seconds a side. Longer and they go rubbery.',
    servings: 2, prep: 8, cook: 8, difficulty: 'easy', cuisine: 'Spanish',
    tags: ['dinner', 'quick', 'high-protein'],
    steps: [
      'Melt the butter with olive oil and a lot of sliced garlic over a low heat.',
      'Turn the heat up, add the prawns and chilli flakes.',
      'Cook ninety seconds a side until just pink.',
      'Finish with lemon and parsley and mop the pan with bread.',
    ],
    ingredients: [
      ['prawn', 350, 'g'], ['butter', 50, 'g'], ['oliveoil', 2, 'tbsp'], ['garlic', 5, 'clove'],
      ['chilliflakes', 1, 'tsp'], ['lemon', 1, 'count'], ['parsley', 10, 'g'], ['baguette', 0.5, 'count'],
    ],
  },
  {
    name: 'Chia Overnight Oats',
    description: 'Two minutes tonight for breakfast that is already made.',
    servings: 1, prep: 5, cook: 0, difficulty: 'easy', cuisine: 'American',
    tags: ['breakfast', 'quick', 'vegetarian'],
    steps: [
      'Stir the oats, milk, yogurt and chia together in a jar.',
      'Add honey and leave overnight in the fridge.',
      'Top with berries and nuts in the morning.',
    ],
    ingredients: [
      ['oats', 60, 'g'], ['milk', 150, 'ml'], ['yogurt', 80, 'g'], ['chia', 1, 'tbsp'],
      ['honey', 1, 'tbsp'], ['frozenberries', 60, 'g'], ['almond', 15, 'g'],
    ],
  },
  {
    name: 'Peanut Butter Banana Toast',
    description: 'The breakfast you actually make on a Tuesday.',
    servings: 1, prep: 3, cook: 2, difficulty: 'easy', cuisine: 'American',
    tags: ['breakfast', 'quick', 'vegetarian'],
    steps: [
      'Toast the bread well.',
      'Spread thickly with peanut butter while hot so it melts in.',
      'Layer banana over the top and finish with honey and cinnamon.',
    ],
    ingredients: [
      ['bread', 2, 'slice'], ['peanutbutter', 2, 'tbsp'], ['banana', 1, 'count'],
      ['honey', 1, 'tsp'], ['cinnamon', 0.5, 'tsp'],
    ],
  },
  {
    name: 'Spinach and Feta Scrambled Eggs',
    description: 'Low heat and patience. Scrambled eggs are ruined by a hot pan.',
    servings: 1, prep: 4, cook: 7, difficulty: 'easy', cuisine: 'Greek',
    tags: ['breakfast', 'high-protein', 'vegetarian', 'quick'],
    steps: [
      'Wilt the spinach in butter and tip out any water.',
      'Add the beaten eggs and stir constantly over a low heat.',
      'Take the pan off while they still look slightly underdone.',
      'Fold in the feta and serve on toast.',
    ],
    ingredients: [
      ['egg', 3, 'count'], ['spinach', 60, 'g'], ['feta', 40, 'g'],
      ['butter', 15, 'g'], ['bread', 1, 'slice'],
    ],
  },
  {
    name: 'Banana Oat Pancakes',
    description: 'Three ingredients, no flour, and they hold together fine.',
    servings: 2, prep: 6, cook: 10, difficulty: 'easy', cuisine: 'American',
    tags: ['breakfast', 'vegetarian'],
    steps: [
      'Blend the banana, oats and eggs into a batter and let it stand five minutes.',
      'Cook spoonfuls in a buttered pan over a medium heat.',
      'Flip when the surface bubbles and the edges look set.',
      'Serve with berries and maple syrup.',
    ],
    ingredients: [
      ['banana', 2, 'count'], ['oats', 100, 'g'], ['egg', 2, 'count'],
      ['butter', 15, 'g'], ['frozenberries', 80, 'g'], ['maple', 2, 'tbsp'],
    ],
  },
  {
    name: 'Roasted Root Vegetables',
    description: 'Give them room. Crowded vegetables steam and never brown.',
    servings: 4, prep: 15, cook: 45, difficulty: 'easy', cuisine: 'British',
    tags: ['side', 'vegetarian', 'vegan'],
    steps: [
      'Cut the carrot, parsnip-sized pieces of sweet potato and beetroot evenly.',
      'Toss with olive oil, thyme and plenty of salt.',
      'Spread on two trays rather than one and roast at 200C for forty-five minutes.',
      'Turn once, halfway.',
    ],
    ingredients: [
      ['carrot', 3, 'count'], ['sweetpotato', 2, 'count'], ['beetroot', 300, 'g'],
      ['redonion', 1, 'count'], ['oliveoil', 3, 'tbsp'], ['thyme', 4, 'g'], ['garlic', 4, 'clove'],
    ],
  },
  {
    name: 'Garlic Green Beans with Almonds',
    description: 'Blanch, shock, then fry. Grey beans are a timing problem.',
    servings: 4, prep: 8, cook: 10, difficulty: 'easy', cuisine: 'French',
    tags: ['side', 'vegetarian', 'quick'],
    steps: [
      'Boil the beans three minutes, then drop into cold water.',
      'Toast the almonds in butter until they smell nutty.',
      'Add garlic for thirty seconds, then the drained beans.',
      'Toss hard, season, and finish with lemon.',
    ],
    ingredients: [
      ['greenbeans', 400, 'g'], ['almond', 50, 'g'], ['butter', 30, 'g'],
      ['garlic', 3, 'clove'], ['lemon', 1, 'count'],
    ],
  },
  {
    name: 'Crispy Smashed Potatoes',
    description: 'Boil, smash, roast hot. More surface area is the entire point.',
    servings: 4, prep: 10, cook: 40, difficulty: 'easy', cuisine: 'British',
    tags: ['side', 'vegetarian', 'vegan'],
    steps: [
      'Boil the baby potatoes until a knife slides in easily.',
      'Drain and steam dry, then crush each one flat with the base of a glass.',
      'Coat generously in oil and season.',
      'Roast at 220C for thirty minutes without turning until the edges shatter.',
    ],
    ingredients: [
      ['babypotato', 800, 'g'], ['oliveoil', 4, 'tbsp'], ['rosemary', 5, 'g'], ['garlic', 4, 'clove'],
    ],
  },
  {
    name: 'Honey and Thyme Carrots',
    description: 'The honey goes on late or it burns before the carrots are done.',
    servings: 4, prep: 8, cook: 35, difficulty: 'easy', cuisine: 'British',
    tags: ['side', 'vegetarian'],
    steps: [
      'Halve the carrots lengthways and toss with olive oil and thyme.',
      'Roast at 200C for twenty-five minutes.',
      'Drizzle with honey and roast ten minutes more.',
      'Finish with a squeeze of lemon.',
    ],
    ingredients: [
      ['carrot', 600, 'g'], ['honey', 2, 'tbsp'], ['oliveoil', 2, 'tbsp'],
      ['thyme', 4, 'g'], ['lemon', 1, 'count'],
    ],
  },
  {
    name: 'Chocolate Chip Oat Cookies',
    description: 'Take them out looking underdone. They finish on the tray.',
    servings: 12, prep: 15, cook: 12, difficulty: 'easy', cuisine: 'American',
    tags: ['dessert', 'vegetarian'],
    steps: [
      'Cream the butter with both sugars until pale.',
      'Beat in the egg and vanilla.',
      'Fold in flour, oats, bicarbonate of soda and the chocolate chips.',
      'Bake at 180C for twelve minutes and leave on the tray five minutes.',
    ],
    ingredients: [
      ['butter', 115, 'g'], ['brownsugar', 100, 'g'], ['sugar', 50, 'g'], ['egg', 1, 'count'],
      ['vanilla', 1, 'tsp'], ['flour', 150, 'g'], ['oats', 90, 'g'],
      ['bakingsoda', 0.5, 'tsp'], ['chocchips', 150, 'g'],
    ],
  },
  {
    name: 'Lemon Yogurt Loaf',
    description: 'Yogurt keeps it damp for days.',
    servings: 10, prep: 15, cook: 50, difficulty: 'easy', cuisine: 'French',
    tags: ['dessert', 'vegetarian'],
    steps: [
      'Whisk yogurt, sugar, eggs, oil and lemon zest together.',
      'Fold in flour and baking powder without overworking it.',
      'Bake at 175C for fifty minutes until a skewer comes out clean.',
      'Soak with lemon juice and sugar while still warm.',
    ],
    ingredients: [
      ['yogurt', 200, 'g'], ['sugar', 200, 'g'], ['egg', 3, 'count'], ['vegoil', 100, 'ml'],
      ['lemon', 2, 'count'], ['flour', 220, 'g'], ['bakingpowder', 2, 'tsp'],
    ],
  },
  {
    name: 'Peanut Butter Energy Balls',
    description: 'No baking, and they last a week in the fridge.',
    servings: 12, prep: 15, cook: 0, difficulty: 'easy', cuisine: 'American',
    tags: ['snack', 'vegetarian'],
    steps: [
      'Mix the oats, peanut butter, honey and chia together thoroughly.',
      'Fold in the chocolate chips.',
      'Chill thirty minutes, then roll into balls.',
    ],
    ingredients: [
      ['oats', 150, 'g'], ['peanutbutter', 130, 'g'], ['honey', 60, 'g'],
      ['chia', 2, 'tbsp'], ['chocchips', 60, 'g'],
    ],
  },
  {
    name: 'Spiced Roasted Chickpeas',
    description: 'Dry them properly or they will never crisp.',
    servings: 4, prep: 8, cook: 35, difficulty: 'easy', cuisine: 'Middle Eastern',
    tags: ['snack', 'vegetarian', 'vegan'],
    steps: [
      'Drain the chickpeas and dry them thoroughly on a towel.',
      'Toss with oil, cumin, paprika and salt.',
      'Roast at 200C for thirty-five minutes, shaking twice.',
      'Cool on the tray — they crisp as they cool.',
    ],
    ingredients: [
      ['chickpeas', 480, 'g'], ['oliveoil', 2, 'tbsp'], ['cumin', 2, 'tsp'],
      ['paprika', 2, 'tsp'], ['salt', 1, 'tsp'],
    ],
  },
  {
    name: 'Salted Tomato Bruschetta',
    description: 'Salt the tomatoes first and let them sit. That liquid is flavour.',
    servings: 4, prep: 15, cook: 6, difficulty: 'easy', cuisine: 'Italian',
    tags: ['snack', 'vegetarian', 'quick'],
    steps: [
      'Dice the tomatoes, salt them and leave in a sieve ten minutes.',
      'Toss with olive oil, torn basil and a little vinegar.',
      'Toast thick slices of baguette and rub each with a cut garlic clove.',
      'Pile the tomatoes on just before serving so the bread stays crisp.',
    ],
    ingredients: [
      ['tomato', 400, 'g'], ['baguette', 1, 'count'], ['garlic', 2, 'clove'],
      ['basil', 10, 'g'], ['oliveoil', 3, 'tbsp'], ['balsamic', 1, 'tbsp'],
    ],
  },
  {
    name: 'Hummus-Style Chickpea Dip',
    description: 'More tahini and more lemon than you think, and blend it far longer.',
    servings: 6, prep: 12, cook: 0, difficulty: 'easy', cuisine: 'Middle Eastern',
    tags: ['snack', 'vegetarian', 'vegan'],
    steps: [
      'Blend the chickpeas with tahini, lemon, garlic and a good pinch of salt.',
      'Add cold water a spoon at a time and keep blending for a full four minutes.',
      'Spread into a bowl, pool olive oil in the middle and dust with paprika.',
    ],
    ingredients: [
      ['chickpeas', 480, 'g'], ['tahini', 4, 'tbsp'], ['lemon', 2, 'count'],
      ['garlic', 2, 'clove'], ['oliveoil', 3, 'tbsp'], ['cumin', 1, 'tsp'], ['paprika', 0.5, 'tsp'],
    ],
  },
];
