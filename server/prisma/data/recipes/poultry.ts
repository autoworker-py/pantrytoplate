import type { SeedRecipe } from './types.js';

export const POULTRY: SeedRecipe[] = [
  {
    name: 'Chicken Fried Rice',
    description: 'Uses up leftover rice and whatever is in the crisper.',
    servings: 2, prep: 12, cook: 15, difficulty: 'medium', cuisine: 'Chinese',
    tags: ['dinner', 'high-protein', 'leftovers', 'one-pan'],
    steps: [
      'Cook the rice and cool it — day-old is better.',
      'Sear the diced chicken in oil until browned, then set aside.',
      'Scramble the eggs, add the carrot and peas, then the rice and soy sauce.',
      'Return the chicken and toss over high heat for 2 minutes.',
    ],
    ingredients: [
      ['rice', 1, 'cup'], ['chicken', 1, 'count'], ['egg', 2, 'count'], ['carrot', 1, 'count'],
      ['peas', 100, 'g'], ['soysauce', 2, 'tbsp'], ['vegoil', 2, 'tbsp'], ['springonion', 2, 'count'],
    ],
  },
  {
    name: 'Lemon Garlic Roast Chicken Thighs',
    description: 'Crisp skin, almost no work.',
    servings: 4, prep: 10, cook: 40, difficulty: 'easy', cuisine: 'Mediterranean',
    tags: ['dinner', 'high-protein', 'one-pan'],
    steps: [
      'Heat the oven to 220C / 425F.',
      'Toss the thighs with olive oil, lemon, garlic, thyme, salt and pepper.',
      'Roast skin-side up for 35-40 minutes until deeply browned.',
      'Rest 5 minutes and spoon the pan juices over.',
    ],
    ingredients: [
      ['chickenthigh', 800, 'g'], ['lemon', 1, 'count'], ['garlic', 5, 'clove'], ['oliveoil', 2, 'tbsp'],
      ['driedthyme', 1, 'tsp'], ['salt', 1, 'tsp'], ['pepper', 0.5, 'tsp'],
    ],
  },
  {
    name: 'Chicken Curry',
    description: 'A weeknight curry built from cupboard spices.',
    servings: 4, prep: 15, cook: 30, difficulty: 'medium', cuisine: 'Indian',
    tags: ['dinner', 'high-protein'],
    steps: [
      'Fry the onion in oil for 8 minutes until golden.',
      'Add the garlic, ginger and spices and cook 1 minute until fragrant.',
      'Add the chicken and brown, then the tomatoes and coconut milk.',
      'Simmer 20 minutes, finish with coriander, and serve with rice.',
    ],
    ingredients: [
      ['chicken', 2, 'count'], ['onion', 1, 'count'], ['garlic', 4, 'clove'], ['ginger', 15, 'g'],
      ['currypowder', 2, 'tbsp'], ['turmeric', 1, 'tsp'], ['tinnedtomato', 1, 'can'], ['coconutmilk', 1, 'can'],
      ['vegoil', 2, 'tbsp'], ['coriander', 10, 'g'], ['basmati', 1, 'cup'],
    ],
  },
  {
    name: 'Chicken Noodle Stir Fry',
    description: 'Fifteen minutes from fridge to table.',
    servings: 2, prep: 10, cook: 10, difficulty: 'easy', cuisine: 'Chinese',
    tags: ['dinner', 'quick', 'high-protein', 'one-pan'],
    steps: [
      'Cook the noodles and drain.',
      'Stir fry the sliced chicken in hot oil for 4 minutes.',
      'Add the pepper, broccoli, garlic and ginger for 3 minutes.',
      'Toss through the noodles with soy sauce and sesame oil.',
    ],
    ingredients: [
      ['chicken', 1, 'count'], ['noodles', 2, 'nest'], ['redpepper', 1, 'count'], ['broccoli', 150, 'g'],
      ['garlic', 2, 'clove'], ['ginger', 10, 'g'], ['soysauce', 3, 'tbsp'], ['sesameoil', 1, 'tsp'], ['vegoil', 1, 'tbsp'],
    ],
  },
  {
    name: 'Chicken Caesar Salad',
    description: 'Grilled chicken over crisp romaine.',
    servings: 2, prep: 15, cook: 12, difficulty: 'medium', cuisine: 'American',
    tags: ['lunch', 'high-protein', 'salad'],
    steps: [
      'Season and grill the chicken, then rest and slice.',
      'Whisk the mayo, mustard, lemon, garlic and parmesan into a dressing.',
      'Toss the romaine with dressing, top with chicken and croutons from the baguette.',
    ],
    ingredients: [
      ['chicken', 1, 'count'], ['lettuce', 200, 'g'], ['parmesan', 40, 'g'], ['mayo', 3, 'tbsp'],
      ['mustard', 1, 'tsp'], ['lemon', 0.5, 'count'], ['garlic', 1, 'clove'], ['baguette', 0.25, 'count'], ['oliveoil', 1, 'tbsp'],
    ],
  },
  {
    name: 'Chicken Fajitas',
    description: 'Everything on one tray, wrapped at the table.',
    servings: 4, prep: 15, cook: 20, difficulty: 'easy', cuisine: 'Mexican',
    tags: ['dinner', 'one-pan', 'high-protein'],
    steps: [
      'Heat the oven to 220C / 425F.',
      'Toss sliced chicken, peppers and onion with oil, cumin, paprika and chilli powder.',
      'Roast 18-20 minutes, turning once.',
      'Serve with warm tortillas, soured cream and lime.',
    ],
    ingredients: [
      ['chicken', 2, 'count'], ['redpepper', 2, 'count'], ['onion', 1, 'count'], ['tortilla', 8, 'count'],
      ['cumin', 2, 'tsp'], ['paprika', 2, 'tsp'], ['chillipowder', 1, 'tsp'], ['oliveoil', 2, 'tbsp'],
      ['sourcream', 100, 'g'], ['lime', 1, 'count'],
    ],
  },
  {
    name: 'Honey Mustard Chicken',
    description: 'Four ingredients for the sauce, nothing to it.',
    servings: 4, prep: 8, cook: 25, difficulty: 'easy', cuisine: 'American',
    tags: ['dinner', 'high-protein', 'one-pan'],
    steps: [
      'Brown the chicken in oil on both sides.',
      'Whisk the honey, mustard, stock and thyme and pour into the pan.',
      'Simmer 15 minutes, spooning the sauce over, until thick and glossy.',
    ],
    ingredients: [
      ['chicken', 2, 'count'], ['honey', 3, 'tbsp'], ['mustard', 2, 'tbsp'], ['stock', 0.5, 'cup'],
      ['driedthyme', 1, 'tsp'], ['oliveoil', 1, 'tbsp'], ['salt', 0.5, 'tsp'],
    ],
  },
  {
    name: 'Chicken and Rice Soup',
    description: 'What you want when you feel rough.',
    servings: 4, prep: 10, cook: 35, difficulty: 'easy', cuisine: 'American',
    tags: ['dinner', 'soup', 'high-protein'],
    steps: [
      'Soften the onion, carrot and celery in butter for 8 minutes.',
      'Add the stock, rice and chicken and simmer 20 minutes.',
      'Shred the chicken, return it, and finish with lemon and parsley.',
    ],
    ingredients: [
      ['chicken', 1, 'count'], ['stock', 6, 'cup'], ['rice', 0.5, 'cup'], ['onion', 1, 'count'],
      ['carrot', 2, 'count'], ['celery', 2, 'stalk'], ['butter', 1, 'tbsp'], ['lemon', 0.5, 'count'], ['parsley', 10, 'g'],
    ],
  },
  {
    name: 'Chicken Parmesan',
    description: 'Breaded, sauced and baked under mozzarella.',
    servings: 4, prep: 20, cook: 25, difficulty: 'medium', cuisine: 'Italian',
    tags: ['dinner', 'high-protein'],
    steps: [
      'Flatten the chicken, then coat in flour, beaten egg and breadcrumbs mixed with parmesan.',
      'Fry until golden on both sides.',
      'Top with passata and mozzarella and bake at 200C / 400F for 15 minutes.',
      'Serve with spaghetti.',
    ],
    ingredients: [
      ['chicken', 2, 'count'], ['breadcrumbs', 1, 'cup'], ['parmesan', 50, 'g'], ['egg', 1, 'count'],
      ['flour', 0.5, 'cup'], ['passata', 400, 'g'], ['mozzarella', 125, 'g'], ['oliveoil', 3, 'tbsp'], ['spaghetti', 300, 'g'],
    ],
  },
  {
    name: 'Teriyaki Chicken',
    description: 'Sticky, sweet and salty, over rice.',
    servings: 3, prep: 10, cook: 18, difficulty: 'easy', cuisine: 'Japanese',
    tags: ['dinner', 'high-protein'],
    steps: [
      'Whisk the soy sauce, honey, ginger, garlic and rice vinegar.',
      'Brown the chicken thighs, then pour in the sauce.',
      'Simmer until the sauce coats the chicken, about 8 minutes.',
      'Serve over rice with sesame seeds and spring onion.',
    ],
    ingredients: [
      ['chickenthigh', 600, 'g'], ['soysauce', 4, 'tbsp'], ['honey', 2, 'tbsp'], ['ginger', 10, 'g'],
      ['garlic', 2, 'clove'], ['ricevinegar', 1, 'tbsp'], ['rice', 1, 'cup'], ['sesame', 1, 'tbsp'], ['springonion', 2, 'count'],
    ],
  },
  {
    name: 'Chicken Tacos',
    description: 'Spiced shredded chicken, piled into tortillas.',
    servings: 4, prep: 12, cook: 20, difficulty: 'easy', cuisine: 'Mexican',
    tags: ['dinner', 'high-protein'],
    steps: [
      'Cook the chicken with cumin, paprika, chilli powder and a splash of stock, 15 minutes.',
      'Shred with two forks and reduce any remaining liquid.',
      'Fill warm tortillas with chicken, cabbage, salsa and lime.',
    ],
    ingredients: [
      ['chicken', 2, 'count'], ['cornTortilla', 8, 'count'], ['cumin', 2, 'tsp'], ['paprika', 1, 'tsp'],
      ['chillipowder', 1, 'tsp'], ['stock', 0.5, 'cup'], ['cabbage', 150, 'g'], ['salsa', 6, 'tbsp'], ['lime', 1, 'count'],
    ],
  },
  {
    name: 'Chicken and Mushroom Pie',
    description: 'A proper pie, made with shop-bought effort.',
    servings: 4, prep: 25, cook: 40, difficulty: 'hard', cuisine: 'British',
    tags: ['dinner', 'comfort'],
    steps: [
      'Brown the chicken and mushrooms in butter, then set aside.',
      'Make a roux with the butter and flour, whisk in the stock and cream, and simmer to thicken.',
      'Fold the filling back in with thyme, and season well.',
      'Top with pastry or mashed potato and bake at 200C / 400F for 30 minutes.',
    ],
    ingredients: [
      ['chicken', 2, 'count'], ['mushroom', 250, 'g'], ['butter', 50, 'g'], ['flour', 3, 'tbsp'],
      ['stock', 2, 'cup'], ['doublecream', 100, 'g'], ['driedthyme', 1, 'tsp'], ['potato', 4, 'count'], ['onion', 1, 'count'],
    ],
  },
  {
    name: 'Buffalo Chicken Wraps',
    description: 'Hot sauce, cool ranch-ish dressing, big wrap.',
    servings: 2, prep: 12, cook: 12, difficulty: 'easy', cuisine: 'American',
    tags: ['lunch', 'quick', 'high-protein'],
    steps: [
      'Fry the sliced chicken until cooked through.',
      'Toss with sriracha and melted butter.',
      'Fill the tortillas with chicken, lettuce, and a dressing of yogurt, mayo and garlic.',
    ],
    ingredients: [
      ['chicken', 1, 'count'], ['tortilla', 2, 'count'], ['sriracha', 2, 'tbsp'], ['butter', 1, 'tbsp'],
      ['lettuce', 80, 'g'], ['yogurt', 60, 'g'], ['mayo', 1, 'tbsp'], ['garlic', 1, 'clove'],
    ],
  },
  {
    name: 'Roast Chicken Dinner',
    description: 'A whole afternoon, and leftovers for days.',
    servings: 4, prep: 20, cook: 90, difficulty: 'medium', cuisine: 'British',
    tags: ['dinner', 'high-protein', 'comfort'],
    steps: [
      'Heat the oven to 200C / 400F. Rub the chicken with butter, salt and pepper and stuff with lemon.',
      'Roast for 20 minutes per 500g plus 20 minutes, basting twice.',
      'Roast the potatoes and carrots alongside in oil for the last hour.',
      'Rest the chicken 15 minutes before carving.',
    ],
    ingredients: [
      ['chicken', 4, 'count'], ['potato', 6, 'count'], ['carrot', 4, 'count'], ['butter', 50, 'g'],
      ['lemon', 1, 'count'], ['rosemary', 4, 'g'], ['vegoil', 3, 'tbsp'], ['salt', 2, 'tsp'],
    ],
  },
  {
    name: 'Chicken Satay Skewers',
    description: 'Peanut sauce doing the heavy lifting.',
    servings: 4, prep: 20, cook: 12, difficulty: 'medium', cuisine: 'Thai',
    tags: ['dinner', 'high-protein'],
    steps: [
      'Marinate the chicken strips in soy sauce, turmeric and a little oil for 20 minutes.',
      'Whisk the peanut butter, coconut milk, soy sauce, lime and sriracha into a sauce.',
      'Grill the skewers 5 minutes a side and serve with the sauce.',
    ],
    ingredients: [
      ['chicken', 2, 'count'], ['peanutbutter', 4, 'tbsp'], ['coconutmilk', 150, 'g'], ['soysauce', 3, 'tbsp'],
      ['lime', 1, 'count'], ['sriracha', 1, 'tsp'], ['turmeric', 0.5, 'tsp'], ['vegoil', 1, 'tbsp'],
    ],
  },
  {
    name: 'Creamy Tuscan Chicken',
    description: 'Spinach, sun-dried richness, one pan.',
    servings: 4, prep: 10, cook: 25, difficulty: 'medium', cuisine: 'Italian',
    tags: ['dinner', 'high-protein', 'one-pan'],
    steps: [
      'Sear the seasoned chicken in oil, then set aside.',
      'Soften the garlic, add the cream, parmesan and paprika, and simmer to thicken.',
      'Wilt in the spinach and tomatoes, return the chicken, and simmer 8 minutes.',
    ],
    ingredients: [
      ['chicken', 2, 'count'], ['doublecream', 200, 'g'], ['parmesan', 40, 'g'], ['spinach', 150, 'g'],
      ['tomato', 2, 'count'], ['garlic', 3, 'clove'], ['paprika', 1, 'tsp'], ['oliveoil', 1, 'tbsp'],
    ],
  },
  {
    name: 'Chicken Quesadilla',
    description: 'Leftover chicken, cheese, done in six minutes.',
    servings: 2, prep: 6, cook: 8, difficulty: 'easy', cuisine: 'Mexican',
    tags: ['lunch', 'quick', 'leftovers'],
    steps: [
      'Scatter chicken, cheese, pepper and spring onion over one tortilla.',
      'Top with a second tortilla and cook in a dry pan, 3 minutes a side.',
      'Cut into wedges and serve with salsa.',
    ],
    ingredients: [
      ['tortilla', 2, 'count'], ['chicken', 1, 'count'], ['cheddar', 100, 'g'], ['redpepper', 0.5, 'count'],
      ['springonion', 1, 'count'], ['salsa', 3, 'tbsp'],
    ],
  },
  {
    name: 'Turkey-Style Chicken Meatballs',
    description: 'Baked, not fried, and freezer-friendly.',
    servings: 4, prep: 15, cook: 25, difficulty: 'easy', cuisine: 'Italian',
    tags: ['dinner', 'high-protein', 'make-ahead'],
    steps: [
      'Mix the mince with breadcrumbs, egg, garlic, parmesan and herbs.',
      'Roll into 20 balls and bake at 200C / 400F for 18 minutes.',
      'Simmer in passata for 10 minutes and serve with pasta.',
    ],
    ingredients: [
      ['chickenmince', 500, 'g'], ['breadcrumbs', 0.5, 'cup'], ['egg', 1, 'count'], ['garlic', 2, 'clove'],
      ['parmesan', 40, 'g'], ['mixedherbs', 1, 'tsp'], ['passata', 500, 'g'], ['penne', 300, 'g'],
    ],
  },
  {
    name: 'Chicken Shawarma Bowls',
    description: 'Spiced chicken, couscous, garlicky yogurt.',
    servings: 4, prep: 20, cook: 20, difficulty: 'medium', cuisine: 'Middle Eastern',
    tags: ['dinner', 'high-protein'],
    steps: [
      'Marinate the chicken in oil, cumin, paprika, turmeric, garlic and lemon for 20 minutes.',
      'Roast at 220C / 425F for 20 minutes, then slice.',
      'Cook the couscous and build bowls with cucumber, tomato and a yogurt-tahini sauce.',
    ],
    ingredients: [
      ['chickenthigh', 700, 'g'], ['couscous', 1, 'cup'], ['yogurt', 150, 'g'], ['tahini', 2, 'tbsp'],
      ['cumin', 2, 'tsp'], ['paprika', 1, 'tsp'], ['turmeric', 1, 'tsp'], ['garlic', 3, 'clove'],
      ['lemon', 1, 'count'], ['cucumber', 0.5, 'count'], ['tomato', 2, 'count'], ['oliveoil', 3, 'tbsp'],
    ],
  },
  {
    name: 'Sticky Sesame Chicken',
    description: 'Better than the takeaway, and quicker to arrive.',
    servings: 3, prep: 12, cook: 15, difficulty: 'medium', cuisine: 'Chinese',
    tags: ['dinner', 'high-protein'],
    steps: [
      'Toss the chicken pieces in cornflour and fry until crisp.',
      'Whisk soy sauce, honey, rice vinegar, garlic and sesame oil, then bubble in the pan.',
      'Return the chicken, coat, and finish with sesame seeds over rice.',
    ],
    ingredients: [
      ['chicken', 2, 'count'], ['cornflour', 3, 'tbsp'], ['soysauce', 3, 'tbsp'], ['honey', 3, 'tbsp'],
      ['ricevinegar', 1, 'tbsp'], ['garlic', 2, 'clove'], ['sesameoil', 1, 'tsp'], ['sesame', 1, 'tbsp'],
      ['rice', 1, 'cup'], ['vegoil', 3, 'tbsp'],
    ],
  },
  {
    name: 'Chicken and Chickpea Traybake',
    description: 'One tin, one tray, forty minutes.',
    servings: 4, prep: 10, cook: 40, difficulty: 'easy', cuisine: 'Mediterranean',
    tags: ['dinner', 'one-pan', 'high-protein'],
    steps: [
      'Heat the oven to 200C / 400F.',
      'Toss the thighs, drained chickpeas, red onion and lemon with oil, cumin and paprika.',
      'Roast 40 minutes until the chicken is browned and the chickpeas crisp.',
      'Scatter with parsley.',
    ],
    ingredients: [
      ['chickenthigh', 700, 'g'], ['chickpeas', 1, 'can'], ['redonion', 1, 'count'], ['lemon', 1, 'count'],
      ['oliveoil', 3, 'tbsp'], ['cumin', 2, 'tsp'], ['paprika', 1, 'tsp'], ['parsley', 10, 'g'],
    ],
  },
  {
    name: 'Chicken Fried Steak-Style Cutlets',
    description: 'Crisp crumbed cutlets with a peppery gravy.',
    servings: 4, prep: 20, cook: 20, difficulty: 'medium', cuisine: 'American',
    tags: ['dinner', 'comfort'],
    steps: [
      'Flatten the chicken and dredge in seasoned flour, egg and flour again.',
      'Shallow fry until deep golden, 4 minutes a side, then drain.',
      'Make a gravy from the pan with flour, milk and plenty of black pepper.',
    ],
    ingredients: [
      ['chicken', 2, 'count'], ['flour', 1, 'cup'], ['egg', 2, 'count'], ['milk', 1.5, 'cup'],
      ['vegoil', 0.5, 'cup'], ['pepper', 1, 'tsp'], ['paprika', 1, 'tsp'], ['salt', 1, 'tsp'],
    ],
  },
  {
    name: 'Coronation Chicken Sandwich',
    description: 'Curried, fruity, and the best use of leftover roast.',
    servings: 2, prep: 10, cook: 0, difficulty: 'easy', cuisine: 'British',
    tags: ['lunch', 'quick', 'leftovers', 'no-cook'],
    steps: [
      'Mix the mayo, yogurt, curry powder and mango chutney-style jam.',
      'Fold through the shredded chicken and raisins.',
      'Pile into buttered bread with lettuce.',
    ],
    ingredients: [
      ['chicken', 1, 'count'], ['mayo', 3, 'tbsp'], ['yogurt', 2, 'tbsp'], ['currypowder', 1, 'tsp'],
      ['jam', 1, 'tbsp'], ['raisin', 20, 'g'], ['bread', 4, 'slice'], ['lettuce', 40, 'g'],
    ],
  },
  {
    name: 'Katsu Chicken Curry',
    description: 'Crumbed chicken under a smooth, mild curry sauce.',
    servings: 4, prep: 20, cook: 30, difficulty: 'medium', cuisine: 'Japanese',
    tags: ['dinner', 'comfort'],
    steps: [
      'Soften the onion and carrot, add curry powder and flour, then stock, and simmer 15 minutes.',
      'Blend the sauce smooth and season with soy sauce and honey.',
      'Crumb the chicken in flour, egg and breadcrumbs and fry until golden.',
      'Slice over rice and pour the sauce around.',
    ],
    ingredients: [
      ['chicken', 2, 'count'], ['breadcrumbs', 1, 'cup'], ['egg', 1, 'count'], ['flour', 0.5, 'cup'],
      ['onion', 1, 'count'], ['carrot', 1, 'count'], ['currypowder', 2, 'tbsp'], ['stock', 2, 'cup'],
      ['soysauce', 1, 'tbsp'], ['honey', 1, 'tsp'], ['rice', 1, 'cup'], ['vegoil', 4, 'tbsp'],
    ],
  },
];
