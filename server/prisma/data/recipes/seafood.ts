import type { SeedRecipe } from './types.js';

export const SEAFOOD: SeedRecipe[] = [
  {
    name: 'Lemon Butter Salmon',
    description: 'Twelve minutes, one pan, no fuss.',
    servings: 2, prep: 5, cook: 12, difficulty: 'easy', cuisine: 'French',
    tags: ['dinner', 'quick', 'high-protein', 'one-pan'],
    steps: [
      'Season the fillets and sear skin-side down for 5 minutes.',
      'Flip, add butter, garlic and lemon, and baste for 3 minutes.',
      'Rest a minute and spoon the pan butter over.',
    ],
    ingredients: [['salmon', 2, 'fillet'], ['butter', 30, 'g'], ['garlic', 2, 'clove'], ['lemon', 1, 'count'], ['dill', 5, 'g'], ['oliveoil', 1, 'tbsp']],
  },
  {
    name: 'Garlic Prawn Pasta',
    description: 'Chilli, garlic, prawns, done before the pasta drains.',
    servings: 2, prep: 8, cook: 12, difficulty: 'easy', cuisine: 'Italian',
    tags: ['dinner', 'quick', 'high-protein'],
    steps: [
      'Cook the spaghetti.',
      'Gently warm the garlic and chilli flakes in olive oil, then add the prawns for 3 minutes.',
      'Toss with the pasta, lemon, parsley and a splash of pasta water.',
    ],
    ingredients: [
      ['prawn', 300, 'g'], ['spaghetti', 250, 'g'], ['garlic', 4, 'clove'], ['chilliflakes', 0.5, 'tsp'],
      ['oliveoil', 3, 'tbsp'], ['lemon', 1, 'count'], ['parsley', 10, 'g'],
    ],
  },
  {
    name: 'Fish and Chips',
    description: 'Beer batter without the beer, and oven chips without the guilt.',
    servings: 4, prep: 20, cook: 30, difficulty: 'hard', cuisine: 'British',
    tags: ['dinner', 'comfort'],
    steps: [
      'Cut the potatoes into chips, toss in oil, and roast at 220C / 425F for 30 minutes.',
      'Whisk the flour, cornflour and cold water into a thin batter.',
      'Dip the fish and fry in hot oil for 6 minutes until deep golden.',
      'Drain, salt heavily, and serve with peas and lemon.',
    ],
    ingredients: [
      ['whitefish', 600, 'g'], ['potato', 5, 'count'], ['flour', 1, 'cup'], ['cornflour', 0.25, 'cup'],
      ['vegoil', 2, 'cup'], ['peas', 200, 'g'], ['lemon', 1, 'count'], ['salt', 2, 'tsp'],
    ],
  },
  {
    name: 'Tuna Pasta Bake',
    description: 'Store cupboard dinner, no shame in it.',
    servings: 4, prep: 12, cook: 30, difficulty: 'easy', cuisine: 'British',
    tags: ['dinner', 'batch-cook', 'comfort'],
    steps: [
      'Cook the pasta and drain.',
      'Make a white sauce from butter, flour and milk, then stir in most of the cheese.',
      'Fold in the tuna, sweetcorn and pasta, top with the rest of the cheese, and bake 25 minutes at 200C / 400F.',
    ],
    ingredients: [
      ['penne', 400, 'g'], ['tunacan', 2, 'can'], ['sweetcorn', 200, 'g'], ['butter', 40, 'g'],
      ['flour', 0.25, 'cup'], ['milk', 2.5, 'cup'], ['cheddar', 200, 'g'], ['mustard', 1, 'tsp'],
    ],
  },
  {
    name: 'Thai Green-Style Prawn Curry',
    description: 'Curry paste, coconut milk, ten minutes.',
    servings: 3, prep: 10, cook: 15, difficulty: 'easy', cuisine: 'Thai',
    tags: ['dinner', 'quick', 'high-protein'],
    steps: [
      'Fry the curry paste in oil for a minute until it smells fragrant.',
      'Add the coconut milk and simmer 5 minutes.',
      'Add the prawns, green beans and pepper and cook 4 minutes.',
      'Finish with fish sauce, lime and coriander, and serve with rice.',
    ],
    ingredients: [
      ['prawn', 400, 'g'], ['currypaste', 2, 'tbsp'], ['coconutmilk', 1, 'can'], ['greenbeans', 150, 'g'],
      ['redpepper', 1, 'count'], ['fishsauce', 1, 'tbsp'], ['lime', 1, 'count'], ['coriander', 10, 'g'],
      ['basmati', 1, 'cup'], ['vegoil', 1, 'tbsp'],
    ],
  },
  {
    name: 'Salmon and Broccoli Traybake',
    description: 'Dinner and the washing up, both minimal.',
    servings: 2, prep: 8, cook: 20, difficulty: 'easy', cuisine: 'Mediterranean',
    tags: ['dinner', 'one-pan', 'high-protein'],
    steps: [
      'Heat the oven to 200C / 400F.',
      'Toss the broccoli and baby potatoes in oil and roast 15 minutes.',
      'Add the salmon and lemon and roast 12 minutes more.',
    ],
    ingredients: [['salmon', 2, 'fillet'], ['broccoli', 250, 'g'], ['babypotato', 400, 'g'], ['oliveoil', 2, 'tbsp'], ['lemon', 1, 'count'], ['garlic', 2, 'clove']],
  },
  {
    name: 'Tuna Melt',
    description: 'The sandwich that justifies a tin of tuna.',
    servings: 2, prep: 6, cook: 6, difficulty: 'easy', cuisine: 'American',
    tags: ['lunch', 'quick'],
    steps: [
      'Mix the tuna with mayo, spring onion and lemon.',
      'Pile onto bread with cheese on top.',
      'Grill until the cheese bubbles.',
    ],
    ingredients: [['tunacan', 1, 'can'], ['bread', 4, 'slice'], ['mayo', 2, 'tbsp'], ['cheddar', 80, 'g'], ['springonion', 1, 'count'], ['lemon', 0.25, 'count']],
  },
  {
    name: 'Fish Tacos',
    description: 'Crisp fish, sharp slaw, lime over everything.',
    servings: 4, prep: 15, cook: 12, difficulty: 'medium', cuisine: 'Mexican',
    tags: ['dinner', 'high-protein'],
    steps: [
      'Toss the fish in flour, cumin and paprika and fry 3 minutes a side.',
      'Shred the cabbage and dress with lime, yogurt and coriander.',
      'Fill warm tortillas with fish and slaw.',
    ],
    ingredients: [
      ['whitefish', 500, 'g'], ['cornTortilla', 8, 'count'], ['cabbage', 200, 'g'], ['yogurt', 100, 'g'],
      ['lime', 2, 'count'], ['coriander', 10, 'g'], ['flour', 0.25, 'cup'], ['cumin', 1, 'tsp'],
      ['paprika', 1, 'tsp'], ['vegoil', 3, 'tbsp'],
    ],
  },
  {
    name: 'Prawn Fried Rice',
    description: 'Faster than ordering it.',
    servings: 3, prep: 10, cook: 12, difficulty: 'easy', cuisine: 'Chinese',
    tags: ['dinner', 'quick', 'leftovers', 'one-pan'],
    steps: [
      'Scramble the eggs in a hot wok and set aside.',
      'Fry the prawns 2 minutes, add peas and spring onion.',
      'Add the cold rice, soy sauce and sesame oil and fry hard, then fold the egg back in.',
    ],
    ingredients: [
      ['prawn', 300, 'g'], ['rice', 1.5, 'cup'], ['egg', 2, 'count'], ['peas', 100, 'g'],
      ['springonion', 3, 'count'], ['soysauce', 3, 'tbsp'], ['sesameoil', 1, 'tsp'], ['vegoil', 2, 'tbsp'],
    ],
  },
  {
    name: 'Baked Cod with Herb Crust',
    description: 'Breadcrumbs, parsley, lemon — that is the whole trick.',
    servings: 4, prep: 12, cook: 18, difficulty: 'easy', cuisine: 'British',
    tags: ['dinner', 'high-protein'],
    steps: [
      'Mix the breadcrumbs with parsley, lemon zest, garlic and melted butter.',
      'Press onto the cod fillets.',
      'Bake at 200C / 400F for 15-18 minutes until the crust is golden.',
    ],
    ingredients: [['whitefish', 600, 'g'], ['breadcrumbs', 1, 'cup'], ['parsley', 15, 'g'], ['lemon', 1, 'count'], ['garlic', 2, 'clove'], ['butter', 50, 'g']],
  },
  {
    name: 'Salmon Poke-Style Bowl',
    description: 'Rice, raw-style salmon, and a soy dressing.',
    servings: 2, prep: 20, cook: 20, difficulty: 'medium', cuisine: 'Hawaiian',
    tags: ['dinner', 'high-protein'],
    steps: [
      'Cook the rice and season with rice vinegar.',
      'Sear the salmon briefly on all sides and cube it.',
      'Dress with soy sauce, sesame oil and lime, and build bowls with cucumber and avocado.',
    ],
    ingredients: [
      ['salmon', 2, 'fillet'], ['rice', 1, 'cup'], ['ricevinegar', 2, 'tbsp'], ['soysauce', 3, 'tbsp'],
      ['sesameoil', 1, 'tsp'], ['lime', 1, 'count'], ['cucumber', 0.5, 'count'], ['avocado', 1, 'count'], ['sesame', 1, 'tbsp'],
    ],
  },
  {
    name: 'Anchovy and Garlic Spaghetti',
    description: 'Anchovies melt away and leave depth behind.',
    servings: 2, prep: 5, cook: 15, difficulty: 'easy', cuisine: 'Italian',
    tags: ['dinner', 'quick', 'cupboard'],
    steps: [
      'Warm the garlic and anchovies in olive oil until the anchovies dissolve.',
      'Add chilli flakes and a ladle of pasta water.',
      'Toss with the drained spaghetti, parsley and breadcrumbs toasted in oil.',
    ],
    ingredients: [
      ['spaghetti', 250, 'g'], ['anchovy', 6, 'fillet'], ['garlic', 4, 'clove'], ['chilliflakes', 0.5, 'tsp'],
      ['oliveoil', 4, 'tbsp'], ['parsley', 10, 'g'], ['breadcrumbs', 0.25, 'cup'],
    ],
  },
  {
    name: 'Prawn and Chorizo Skewers',
    description: 'Smoky, quick, and good off a barbecue.',
    servings: 4, prep: 15, cook: 10, difficulty: 'easy', cuisine: 'Spanish',
    tags: ['dinner', 'quick', 'high-protein'],
    steps: [
      'Thread prawns, chorizo and pepper onto skewers.',
      'Brush with oil, paprika and garlic.',
      'Grill 4 minutes a side and finish with lemon and parsley.',
    ],
    ingredients: [
      ['prawn', 400, 'g'], ['chorizo', 200, 'g'], ['redpepper', 2, 'count'], ['oliveoil', 2, 'tbsp'],
      ['paprika', 1, 'tsp'], ['garlic', 2, 'clove'], ['lemon', 1, 'count'], ['parsley', 8, 'g'],
    ],
  },
  {
    name: 'Salmon Fishcakes',
    description: 'A good way to stretch one fillet into supper for two.',
    servings: 3, prep: 25, cook: 15, difficulty: 'medium', cuisine: 'British',
    tags: ['dinner', 'leftovers'],
    steps: [
      'Boil and mash the potatoes, then cool.',
      'Flake in the cooked salmon with spring onion, dill, mustard and lemon.',
      'Shape into cakes, coat in breadcrumbs, and fry 4 minutes a side.',
    ],
    ingredients: [
      ['salmon', 2, 'fillet'], ['potato', 3, 'count'], ['springonion', 2, 'count'], ['dill', 8, 'g'],
      ['mustard', 1, 'tsp'], ['lemon', 0.5, 'count'], ['breadcrumbs', 1, 'cup'], ['egg', 1, 'count'], ['vegoil', 3, 'tbsp'],
    ],
  },
  {
    name: 'Coconut Fish Curry',
    description: 'Mild, fast, and forgiving.',
    servings: 4, prep: 12, cook: 20, difficulty: 'easy', cuisine: 'Indian',
    tags: ['dinner', 'high-protein'],
    steps: [
      'Soften the onion, then add garlic, ginger, turmeric and curry powder.',
      'Pour in the coconut milk and tomatoes and simmer 8 minutes.',
      'Slide in the fish and poach gently for 6 minutes without stirring.',
      'Finish with lime and coriander.',
    ],
    ingredients: [
      ['whitefish', 600, 'g'], ['coconutmilk', 1, 'can'], ['tinnedtomato', 200, 'g'], ['onion', 1, 'count'],
      ['garlic', 3, 'clove'], ['ginger', 15, 'g'], ['turmeric', 1, 'tsp'], ['currypowder', 1, 'tbsp'],
      ['lime', 1, 'count'], ['coriander', 10, 'g'], ['basmati', 1, 'cup'],
    ],
  },
  {
    name: 'Smoked-Style Salmon Scrambled Eggs',
    description: 'Brunch, in one pan, in six minutes.',
    servings: 2, prep: 4, cook: 6, difficulty: 'easy', cuisine: 'British',
    tags: ['breakfast', 'quick', 'high-protein'],
    steps: [
      'Beat the eggs with cream and pepper.',
      'Scramble slowly in butter over low heat.',
      'Fold the flaked salmon and dill in at the very end and pile onto toast.',
    ],
    ingredients: [['egg', 4, 'count'], ['salmon', 1, 'fillet'], ['doublecream', 2, 'tbsp'], ['butter', 20, 'g'], ['dill', 5, 'g'], ['bread', 2, 'slice']],
  },
];
