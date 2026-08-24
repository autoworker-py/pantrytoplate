import type { SeedRecipe } from './types.js';

export const SOUPS_SALADS: SeedRecipe[] = [
  {
    name: 'Tomato Soup',
    description: 'Tinned tomatoes, treated well.',
    servings: 4, prep: 10, cook: 30, difficulty: 'easy', cuisine: 'British',
    tags: ['soup', 'lunch', 'vegetarian', 'cupboard'],
    steps: [
      'Soften the onion and garlic in butter for 10 minutes without colouring.',
      'Add the tomatoes, stock and a pinch of sugar and simmer 20 minutes.',
      'Blend smooth, season, and finish with cream and basil.',
    ],
    ingredients: [
      ['tinnedtomato', 2, 'can'], ['onion', 1, 'count'], ['garlic', 3, 'clove'], ['vegstock', 2, 'cup'],
      ['butter', 30, 'g'], ['doublecream', 60, 'g'], ['sugar', 1, 'tsp'], ['basil', 8, 'g'],
    ],
  },
  {
    name: 'Chicken Noodle Soup',
    description: 'The one that fixes things.',
    servings: 4, prep: 12, cook: 30, difficulty: 'easy', cuisine: 'American',
    tags: ['soup', 'dinner', 'high-protein'],
    steps: [
      'Soften the onion, carrot and celery in butter.',
      'Add the stock and chicken and simmer 20 minutes.',
      'Shred the chicken, return it with the noodles, and cook 6 minutes more.',
      'Finish with parsley and plenty of pepper.',
    ],
    ingredients: [
      ['chicken', 1, 'count'], ['stock', 6, 'cup'], ['noodles', 3, 'nest'], ['onion', 1, 'count'],
      ['carrot', 2, 'count'], ['celery', 2, 'stalk'], ['butter', 20, 'g'], ['parsley', 10, 'g'], ['pepper', 0.5, 'tsp'],
    ],
  },
  {
    name: 'Minestrone',
    description: 'Whatever vegetables you have, plus beans and pasta.',
    servings: 5, prep: 15, cook: 35, difficulty: 'easy', cuisine: 'Italian',
    tags: ['soup', 'vegetarian', 'batch-cook'],
    steps: [
      'Soften the onion, carrot and celery for 10 minutes.',
      'Add garlic, tomatoes, stock and beans and simmer 20 minutes.',
      'Add the pasta and green beans for the last 10 minutes.',
      'Serve with parmesan and olive oil.',
    ],
    ingredients: [
      ['onion', 1, 'count'], ['carrot', 2, 'count'], ['celery', 2, 'stalk'], ['garlic', 3, 'clove'],
      ['tinnedtomato', 1, 'can'], ['cannellini', 1, 'can'], ['vegstock', 6, 'cup'], ['penne', 150, 'g'],
      ['greenbeans', 100, 'g'], ['parmesan', 40, 'g'], ['oliveoil', 2, 'tbsp'],
    ],
  },
  {
    name: 'Potato and Leek Soup',
    description: 'Three ingredients and it still tastes expensive.',
    servings: 4, prep: 12, cook: 30, difficulty: 'easy', cuisine: 'French',
    tags: ['soup', 'vegetarian', 'comfort'],
    steps: [
      'Sweat the sliced leeks in butter for 10 minutes.',
      'Add the diced potato and stock and simmer 20 minutes.',
      'Blend until smooth and finish with cream and chives or spring onion.',
    ],
    ingredients: [['leek', 400, 'g'], ['potato', 4, 'count'], ['vegstock', 5, 'cup'], ['butter', 40, 'g'], ['doublecream', 80, 'g'], ['springonion', 2, 'count']],
  },
  {
    name: 'Lentil and Bacon Soup',
    description: 'Thick enough to stand a spoon in.',
    servings: 4, prep: 12, cook: 40, difficulty: 'easy', cuisine: 'British',
    tags: ['soup', 'batch-cook', 'high-protein'],
    steps: [
      'Crisp the bacon, then soften the onion, carrot and celery in the fat.',
      'Add the lentils, stock and thyme and simmer 30 minutes.',
      'Season hard and finish with vinegar to lift it.',
    ],
    ingredients: [
      ['greenlentil', 250, 'g'], ['bacon', 4, 'slice'], ['onion', 1, 'count'], ['carrot', 2, 'count'],
      ['celery', 2, 'stalk'], ['stock', 5, 'cup'], ['driedthyme', 1, 'tsp'], ['vinegar', 1, 'tsp'],
    ],
  },
  {
    name: 'Miso-Style Noodle Soup',
    description: 'A fast broth for a cold evening.',
    servings: 2, prep: 8, cook: 12, difficulty: 'easy', cuisine: 'Japanese',
    tags: ['soup', 'quick', 'vegetarian'],
    steps: [
      'Simmer the stock with ginger, garlic and soy sauce for 8 minutes.',
      'Add the noodles and mushrooms and cook 4 minutes.',
      'Finish with spinach, spring onion and sesame oil.',
    ],
    ingredients: [
      ['vegstock', 5, 'cup'], ['noodles', 2, 'nest'], ['mushroom', 150, 'g'], ['ginger', 15, 'g'],
      ['garlic', 2, 'clove'], ['soysauce', 3, 'tbsp'], ['spinach', 80, 'g'], ['springonion', 2, 'count'], ['sesameoil', 1, 'tsp'],
    ],
  },
  {
    name: 'Carrot and Coriander Soup',
    description: 'Cheap, bright, and freezes perfectly.',
    servings: 4, prep: 10, cook: 30, difficulty: 'easy', cuisine: 'British',
    tags: ['soup', 'vegetarian', 'batch-cook'],
    steps: [
      'Soften the onion in oil, add the coriander seeds and cumin.',
      'Add the sliced carrots and stock and simmer 25 minutes.',
      'Blend smooth and stir through fresh coriander.',
    ],
    ingredients: [['carrot', 8, 'count'], ['onion', 1, 'count'], ['vegstock', 5, 'cup'], ['coriandergr', 2, 'tsp'], ['cumin', 1, 'tsp'], ['coriander', 15, 'g'], ['oliveoil', 2, 'tbsp']],
  },
  {
    name: 'Greek Salad',
    description: 'No lettuce. That is the rule.',
    servings: 4, prep: 15, cook: 0, difficulty: 'easy', cuisine: 'Greek',
    tags: ['salad', 'lunch', 'vegetarian', 'no-cook', 'quick'],
    steps: [
      'Chunk the tomatoes, cucumber and red onion.',
      'Add olives if you have them and a whole slab of feta on top.',
      'Dress with olive oil, vinegar and oregano.',
    ],
    ingredients: [
      ['tomato', 4, 'count'], ['cucumber', 1, 'count'], ['redonion', 0.5, 'count'], ['feta', 200, 'g'],
      ['oliveoil', 4, 'tbsp'], ['vinegar', 1, 'tbsp'], ['oregano', 1, 'tsp'],
    ],
  },
  {
    name: 'Quinoa and Roasted Vegetable Salad',
    description: 'Good warm, better cold the next day.',
    servings: 4, prep: 15, cook: 30, difficulty: 'easy', cuisine: 'Mediterranean',
    tags: ['salad', 'lunch', 'vegetarian', 'make-ahead'],
    steps: [
      'Roast the courgette, pepper and red onion in oil at 220C / 425F for 25 minutes.',
      'Cook the quinoa in stock and cool slightly.',
      'Toss everything with feta, lemon, olive oil and parsley.',
    ],
    ingredients: [
      ['quinoa', 1, 'cup'], ['courgette', 1, 'count'], ['redpepper', 1, 'count'], ['redonion', 1, 'count'],
      ['feta', 100, 'g'], ['lemon', 1, 'count'], ['oliveoil', 3, 'tbsp'], ['parsley', 10, 'g'], ['vegstock', 2, 'cup'],
    ],
  },
  {
    name: 'Caesar-Style Kale Salad',
    description: 'Massage the kale — it genuinely matters.',
    servings: 3, prep: 15, cook: 8, difficulty: 'easy', cuisine: 'American',
    tags: ['salad', 'lunch', 'vegetarian'],
    steps: [
      'Massage the shredded kale with olive oil and lemon for a minute until it softens.',
      'Whisk mayo, mustard, garlic, parmesan and lemon into a dressing.',
      'Toss with toasted breadcrumbs and more parmesan.',
    ],
    ingredients: [
      ['kale', 250, 'g'], ['mayo', 3, 'tbsp'], ['mustard', 1, 'tsp'], ['garlic', 1, 'clove'],
      ['parmesan', 50, 'g'], ['lemon', 1, 'count'], ['breadcrumbs', 0.5, 'cup'], ['oliveoil', 2, 'tbsp'],
    ],
  },
  {
    name: 'Tuna Nicoise-Style Salad',
    description: 'A whole meal in a bowl.',
    servings: 2, prep: 20, cook: 15, difficulty: 'medium', cuisine: 'French',
    tags: ['salad', 'lunch', 'high-protein'],
    steps: [
      'Boil the baby potatoes and green beans; boil the eggs for 7 minutes.',
      'Whisk oil, vinegar and mustard into a dressing.',
      'Arrange lettuce, potatoes, beans, tomatoes, tuna and halved eggs, and dress.',
    ],
    ingredients: [
      ['tunacan', 1, 'can'], ['babypotato', 300, 'g'], ['greenbeans', 150, 'g'], ['egg', 2, 'count'],
      ['tomato', 2, 'count'], ['lettuce', 100, 'g'], ['oliveoil', 3, 'tbsp'], ['vinegar', 1, 'tbsp'], ['mustard', 1, 'tsp'],
    ],
  },
  {
    name: 'Caprese Salad',
    description: 'Three ingredients, so buy good ones.',
    servings: 2, prep: 8, cook: 0, difficulty: 'easy', cuisine: 'Italian',
    tags: ['salad', 'quick', 'vegetarian', 'no-cook'],
    steps: ['Slice the tomatoes and mozzarella.', 'Layer alternately with basil leaves.', 'Dress with olive oil, balsamic, salt and pepper.'],
    ingredients: [['tomato', 3, 'count'], ['mozzarella', 250, 'g'], ['basil', 10, 'g'], ['oliveoil', 2, 'tbsp'], ['balsamic', 1, 'tbsp'], ['salt', 0.5, 'tsp']],
  },
  {
    name: 'Chickpea and Feta Salad',
    description: 'Ten minutes, no cooking, keeps for days.',
    servings: 3, prep: 12, cook: 0, difficulty: 'easy', cuisine: 'Mediterranean',
    tags: ['salad', 'lunch', 'vegetarian', 'no-cook', 'make-ahead'],
    steps: ['Drain the chickpeas and combine with diced cucumber, tomato and red onion.', 'Crumble in the feta.', 'Dress with olive oil, lemon, parsley and mint.'],
    ingredients: [
      ['chickpeas', 1, 'can'], ['cucumber', 0.5, 'count'], ['tomato', 2, 'count'], ['redonion', 0.5, 'count'],
      ['feta', 120, 'g'], ['oliveoil', 3, 'tbsp'], ['lemon', 1, 'count'], ['parsley', 10, 'g'], ['mint', 5, 'g'],
    ],
  },
  {
    name: 'Coleslaw',
    description: 'Make it an hour ahead so it softens.',
    servings: 6, prep: 15, cook: 0, difficulty: 'easy', cuisine: 'American',
    tags: ['side', 'vegetarian', 'no-cook', 'make-ahead'],
    steps: ['Shred the cabbage and carrot as finely as you can.', 'Mix mayo, yogurt, mustard and vinegar.', 'Combine, season and rest an hour before serving.'],
    ingredients: [['cabbage', 400, 'g'], ['carrot', 2, 'count'], ['mayo', 4, 'tbsp'], ['yogurt', 3, 'tbsp'], ['mustard', 1, 'tsp'], ['vinegar', 1, 'tbsp']],
  },
  {
    name: 'Potato Salad',
    description: 'Dress the potatoes while they are still warm.',
    servings: 6, prep: 15, cook: 20, difficulty: 'easy', cuisine: 'American',
    tags: ['side', 'vegetarian', 'make-ahead'],
    steps: [
      'Boil the baby potatoes until tender and drain.',
      'While warm, toss with vinegar and oil.',
      'When cool, fold in mayo, mustard, spring onion and dill.',
    ],
    ingredients: [
      ['babypotato', 900, 'g'], ['mayo', 5, 'tbsp'], ['mustard', 1, 'tbsp'], ['vinegar', 1, 'tbsp'],
      ['oliveoil', 1, 'tbsp'], ['springonion', 3, 'count'], ['dill', 10, 'g'], ['egg', 2, 'count'],
    ],
  },
  {
    name: 'Roasted Vegetable Couscous',
    description: 'Couscous needs nothing but boiling stock and a lid.',
    servings: 4, prep: 15, cook: 30, difficulty: 'easy', cuisine: 'Moroccan',
    tags: ['side', 'lunch', 'vegetarian'],
    steps: [
      'Roast the aubergine, courgette, pepper and red onion in oil for 25 minutes.',
      'Pour boiling stock over the couscous, cover, and leave 8 minutes.',
      'Fork through and combine with the vegetables, lemon, mint and almonds.',
    ],
    ingredients: [
      ['couscous', 1.5, 'cup'], ['vegstock', 1.5, 'cup'], ['aubergine', 1, 'count'], ['courgette', 1, 'count'],
      ['redpepper', 1, 'count'], ['redonion', 1, 'count'], ['oliveoil', 3, 'tbsp'], ['lemon', 1, 'count'],
      ['mint', 8, 'g'], ['almond', 30, 'g'],
    ],
  },
  {
    name: 'Broccoli and Cheddar Soup',
    description: 'Thick, cheesy, and quick.',
    servings: 4, prep: 10, cook: 25, difficulty: 'easy', cuisine: 'American',
    tags: ['soup', 'vegetarian', 'comfort'],
    steps: [
      'Soften the onion in butter, whisk in flour, then the stock and milk.',
      'Add the broccoli and simmer 15 minutes.',
      'Blend partly smooth and melt in the cheddar off the heat.',
    ],
    ingredients: [
      ['broccoli', 500, 'g'], ['cheddar', 200, 'g'], ['onion', 1, 'count'], ['butter', 40, 'g'],
      ['flour', 3, 'tbsp'], ['vegstock', 3, 'cup'], ['milk', 1.5, 'cup'], ['mustard', 0.5, 'tsp'],
    ],
  },
  {
    name: 'Beetroot and Feta Salad',
    description: 'Sweet, salty, and it looks like effort.',
    servings: 4, prep: 15, cook: 0, difficulty: 'easy', cuisine: 'Mediterranean',
    tags: ['salad', 'vegetarian', 'no-cook'],
    steps: ['Dice the cooked beetroot.', 'Toss with rocket, walnuts and feta.', 'Dress with olive oil, balsamic and a little honey.'],
    ingredients: [['beetroot', 400, 'g'], ['rocket', 100, 'g'], ['feta', 120, 'g'], ['walnut', 50, 'g'], ['oliveoil', 3, 'tbsp'], ['balsamic', 1, 'tbsp'], ['honey', 1, 'tsp']],
  },
];
