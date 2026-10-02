import type { InventoryItem } from '../../lib/types';
import { TIME_LIMIT, type Feel, type Order } from './options';

/*
 * Sample tickets, so the screens can be seen and used before the kitchen (the
 * AI) is connected. Each one is a real recipe, and which three come back
 * depends on the order and on what is in the pantry, the way the real ones
 * will. Every ticket made from these is stamped SAMPLE.
 */

interface Ingredient {
  name: string;
  amount: string;
  /** words that find it in a pantry, '|' between alternatives */
  key: string;
  /** salt, oil, spices: assumed to be in, never put on a list */
  staple?: boolean;
}

export interface Idea {
  id: string;
  name: string;
  region: string;
  dish: string;
  feels: Feel[];
  minutes: number;
  kcal: number;
  serves: number;
  vegetarian: boolean;
  meals: string[];
  /** 'One pan', 'No oven', 'No cooking' where they hold */
  kit: string[];
  ingredients: Ingredient[];
  steps: string[];
}

export interface Placed extends Idea {
  have: { ingredient: Ingredient; item: InventoryItem }[];
  buy: Ingredient[];
  note: string;
  urgent: boolean;
}

const SAMPLES: Idea[] = [
  {
    id: 'gochujang-bowls', name: 'Gochujang Chicken Rice Bowls', region: 'Asian', dish: 'Korean', feels: ['Spicy', 'Warm', 'Hearty'],
    minutes: 25, kcal: 610, serves: 2, vegetarian: false, meals: ['Lunch', 'Dinner'], kit: ['One pan', 'No oven'],
    ingredients: [
      { name: 'Chicken breast', amount: '2, about 400 g', key: 'chicken' },
      { name: 'Rice', amount: '1 cup', key: 'rice' },
      { name: 'Gochujang', amount: '2 tbsp', key: 'gochujang' },
      { name: 'Honey', amount: '1 tbsp', key: 'honey' },
      { name: 'Soy sauce', amount: '1 tbsp', key: 'soy' },
      { name: 'Garlic', amount: '2 cloves', key: 'garlic' },
      { name: 'Baby spinach', amount: '2 handfuls', key: 'spinach' },
      { name: 'Eggs', amount: '2', key: 'egg' },
      { name: 'Spring onions', amount: '2', key: 'spring onion|scallion' },
    ],
    steps: [
      'Rinse the rice and cook it with 2 cups of water, covered, for 15 minutes.',
      'Stir the gochujang, honey, soy sauce and grated garlic together. Slice the chicken thinly and toss it through.',
      'Fry the chicken in a hot pan with a little oil for 6 to 7 minutes, until cooked through (74°C / 165°F inside).',
      'Push the chicken aside and wilt the spinach in the same pan, about a minute.',
      'Fry the eggs so the yolks stay runny.',
      'Pile rice, chicken and spinach into bowls and top each with an egg and sliced spring onions.',
    ],
  },
  {
    id: 'red-curry', name: 'Coconut Red Curry with Spinach', region: 'Asian', dish: 'Thai', feels: ['Warm', 'Cozy', 'Spicy', 'Creamy'],
    minutes: 30, kcal: 520, serves: 3, vegetarian: false, meals: ['Dinner'], kit: ['One pan', 'No oven'],
    ingredients: [
      { name: 'Red curry paste', amount: '2 tbsp', key: 'curry paste' },
      { name: 'Coconut milk', amount: '1 can (400 ml)', key: 'coconut' },
      { name: 'Chicken breast', amount: '2', key: 'chicken' },
      { name: 'Onion', amount: '1', key: 'onion' },
      { name: 'Baby spinach', amount: '3 handfuls', key: 'spinach' },
      { name: 'Lime', amount: '1', key: 'lime' },
      { name: 'Fish sauce', amount: '1 tbsp', key: 'fish sauce' },
      { name: 'Rice', amount: '1 cup', key: 'rice' },
    ],
    steps: [
      'Start the rice.',
      'Soften the sliced onion in a little oil for 5 minutes, then fry the curry paste for a minute until it smells toasty.',
      'Add the coconut milk and the chicken, cut into bite-size pieces. Simmer 12 minutes, until the chicken is cooked through.',
      'Stir in the spinach until it wilts, then the fish sauce and the juice of half the lime.',
      'Taste: more lime for sharpness, more paste for heat. Serve over the rice.',
    ],
  },
  {
    id: 'miso-noodles', name: 'Miso Butter Noodles', region: 'Asian', dish: 'Japanese', feels: ['Cozy', 'Warm', 'Creamy'],
    minutes: 15, kcal: 560, serves: 2, vegetarian: true, meals: ['Lunch', 'Dinner'], kit: ['One pan', 'No oven'],
    ingredients: [
      { name: 'Udon or ramen noodles', amount: '200 g', key: 'noodle|udon|ramen' },
      { name: 'Butter', amount: '2 tbsp', key: 'butter' },
      { name: 'White miso', amount: '1 tbsp', key: 'miso' },
      { name: 'Garlic', amount: '2 cloves', key: 'garlic' },
      { name: 'Eggs', amount: '2', key: 'egg' },
      { name: 'Spring onions', amount: '2', key: 'spring onion|scallion' },
      { name: 'Sesame seeds', amount: '1 tsp', key: 'sesame', staple: true },
    ],
    steps: [
      'Cook the noodles as the packet says. Keep a mug of the cooking water.',
      'Melt the butter with the grated garlic over a low heat, then whisk in the miso and a splash of noodle water until glossy.',
      'Toss the noodles through the sauce, loosening it with more water if it needs it.',
      'Top with soft-boiled eggs (6½ minutes), spring onions and sesame seeds.',
    ],
  },
  {
    id: 'tinga-tacos', name: 'Chicken Tinga Tacos', region: 'Hispanic', dish: 'Mexican', feels: ['Spicy', 'Smoky', 'Zesty'],
    minutes: 30, kcal: 480, serves: 3, vegetarian: false, meals: ['Lunch', 'Dinner'], kit: ['No oven'],
    ingredients: [
      { name: 'Chicken breast', amount: '2', key: 'chicken' },
      { name: 'Chipotles in adobo', amount: '2', key: 'chipotle' },
      { name: 'Chopped tomatoes', amount: '1 can', key: 'tomato' },
      { name: 'Onion', amount: '1', key: 'onion' },
      { name: 'Garlic', amount: '2 cloves', key: 'garlic' },
      { name: 'Corn tortillas', amount: '8', key: 'tortilla' },
      { name: 'Lime', amount: '1', key: 'lime' },
      { name: 'Sour cream', amount: 'to serve', key: 'sour cream' },
    ],
    steps: [
      'Poach the chicken in simmering water for 15 minutes, until cooked through, then shred it with two forks.',
      'Meanwhile soften the sliced onion and garlic in a little oil, then mash or blend with the tomatoes and chopped chipotles.',
      'Simmer the sauce for 5 minutes, add the chicken and cook until the sauce clings.',
      'Warm the tortillas in a dry pan, fill them, and finish with sour cream and a squeeze of lime.',
    ],
  },
  {
    id: 'bean-quesadillas', name: 'Black Bean and Spinach Quesadillas', region: 'Hispanic', dish: 'Mexican', feels: ['Cheesy', 'Crunchy', 'Hearty'],
    minutes: 15, kcal: 590, serves: 2, vegetarian: true, meals: ['Lunch', 'Dinner', 'Snack'], kit: ['One pan', 'No oven'],
    ingredients: [
      { name: 'Flour tortillas', amount: '4', key: 'tortilla' },
      { name: 'Black beans', amount: '1 can', key: 'black bean' },
      { name: 'Baby spinach', amount: '2 handfuls', key: 'spinach' },
      { name: 'Cheddar', amount: '150 g', key: 'cheddar|cheese' },
      { name: 'Ground cumin', amount: '1 tsp', key: 'cumin', staple: true },
      { name: 'Salsa', amount: 'to serve', key: 'salsa' },
    ],
    steps: [
      'Drain the beans and mash half of them with the cumin and a pinch of salt.',
      'Spread the mash over two tortillas, add the spinach and grated cheese, and lay the other tortillas on top.',
      'Cook in a dry pan over a medium heat, 3 minutes a side, until crisp and melted.',
      'Cut into wedges and serve with salsa.',
    ],
  },
  {
    id: 'spinach-gnocchi', name: 'Creamy Garlic Spinach Gnocchi', region: 'European', dish: 'Italian', feels: ['Cozy', 'Creamy', 'Cheesy'],
    minutes: 20, kcal: 640, serves: 2, vegetarian: true, meals: ['Dinner'], kit: ['One pan', 'No oven'],
    ingredients: [
      { name: 'Gnocchi', amount: '500 g', key: 'gnocchi' },
      { name: 'Butter', amount: '1 tbsp', key: 'butter' },
      { name: 'Garlic', amount: '3 cloves', key: 'garlic' },
      { name: 'Whole milk', amount: '150 ml', key: 'milk' },
      { name: 'Parmesan', amount: '40 g', key: 'parmesan|cheese' },
      { name: 'Baby spinach', amount: '3 handfuls', key: 'spinach' },
      { name: 'Lemon', amount: '½', key: 'lemon' },
    ],
    steps: [
      'Fry the gnocchi in the butter over a medium-high heat for 6 to 8 minutes, until golden.',
      'Add the sliced garlic for the last minute, then pour in the milk and let it bubble for 2 minutes.',
      'Stir in the grated parmesan and the spinach until the sauce is glossy and the spinach has wilted.',
      'Finish with lemon zest, a squeeze of juice and plenty of black pepper.',
    ],
  },
  {
    id: 'lemon-orzo', name: 'Lemon Chicken Orzo', region: 'European', dish: 'Greek', feels: ['Refreshing', 'Light', 'Zesty'],
    minutes: 30, kcal: 520, serves: 3, vegetarian: false, meals: ['Lunch', 'Dinner'], kit: ['One pan', 'No oven'],
    ingredients: [
      { name: 'Chicken breast', amount: '2', key: 'chicken' },
      { name: 'Orzo', amount: '1 cup', key: 'orzo' },
      { name: 'Chicken stock', amount: '3 cups', key: 'stock' },
      { name: 'Lemon', amount: '1', key: 'lemon' },
      { name: 'Garlic', amount: '2 cloves', key: 'garlic' },
      { name: 'Baby spinach', amount: '2 handfuls', key: 'spinach' },
      { name: 'Feta', amount: '60 g', key: 'feta' },
      { name: 'Dill or parsley', amount: 'a handful', key: 'dill|parsley' },
    ],
    steps: [
      'Season the chicken and brown it in a deep pan, 4 minutes a side. Lift it out.',
      'Soften the garlic, add the orzo and stir for a minute, then pour in the stock.',
      'Put the chicken back, cover, and simmer 12 minutes, until the orzo is tender and the chicken is 74°C / 165°F inside.',
      'Slice the chicken. Stir the spinach, lemon zest and juice through the orzo, then top with feta and herbs.',
    ],
  },
  {
    id: 'shakshuka', name: 'Shakshuka', region: 'Middle Eastern', dish: 'Israeli', feels: ['Warm', 'Spicy', 'Hearty'],
    minutes: 25, kcal: 380, serves: 2, vegetarian: true, meals: ['Breakfast', 'Lunch', 'Dinner'], kit: ['One pan', 'No oven'],
    ingredients: [
      { name: 'Eggs', amount: '4', key: 'egg' },
      { name: 'Chopped tomatoes', amount: '1 can', key: 'tomato' },
      { name: 'Red pepper', amount: '1', key: 'pepper' },
      { name: 'Onion', amount: '1', key: 'onion' },
      { name: 'Garlic', amount: '2 cloves', key: 'garlic' },
      { name: 'Smoked paprika', amount: '1 tsp', key: 'paprika', staple: true },
      { name: 'Ground cumin', amount: '1 tsp', key: 'cumin', staple: true },
      { name: 'Feta', amount: '40 g', key: 'feta' },
      { name: 'Bread', amount: 'to serve', key: 'bread' },
    ],
    steps: [
      'Soften the sliced onion and pepper in a wide pan for 8 minutes.',
      'Add the garlic, paprika and cumin for a minute, then the tomatoes. Simmer 8 minutes, until thick.',
      'Make four hollows and crack an egg into each. Cover and cook 5 to 7 minutes, until the whites have set.',
      'Crumble over the feta and eat straight from the pan with bread.',
    ],
  },
  {
    id: 'toastie-soup', name: 'Ham and Cheese Toasties with Tomato Soup', region: 'American', dish: 'Diner', feels: ['Cheesy', 'Crunchy', 'Warm', 'Cozy'],
    minutes: 20, kcal: 690, serves: 2, vegetarian: false, meals: ['Lunch', 'Dinner'], kit: ['No oven'],
    ingredients: [
      { name: 'White bread', amount: '4 slices', key: 'bread' },
      { name: 'Sliced ham', amount: '4 slices', key: 'ham' },
      { name: 'Cheddar', amount: '80 g', key: 'cheddar|cheese' },
      { name: 'Butter', amount: '1 tbsp', key: 'butter' },
      { name: 'Chopped tomatoes', amount: '1 can', key: 'tomato' },
      { name: 'Onion', amount: '½', key: 'onion' },
      { name: 'Whole milk', amount: '100 ml', key: 'milk' },
    ],
    steps: [
      'Soften the chopped onion in a little butter, add the tomatoes and simmer for 10 minutes.',
      'Blend until smooth, stir in the milk and season. Keep it warm.',
      'Butter the bread on the outside and fill with ham and grated cheese.',
      'Toast in a pan over a medium heat, 3 minutes a side, pressing down, until golden and melted. Cut and dunk.',
    ],
  },
  {
    id: 'chickpea-salad', name: 'Cucumber, Mint and Chickpea Salad', region: 'Middle Eastern', dish: 'Lebanese', feels: ['Refreshing', 'Light', 'Zesty', 'Crunchy'],
    minutes: 10, kcal: 340, serves: 2, vegetarian: true, meals: ['Lunch', 'Snack'], kit: ['No cooking', 'No oven', 'One pan'],
    ingredients: [
      { name: 'Chickpeas', amount: '1 can', key: 'chickpea' },
      { name: 'Cucumber', amount: '1', key: 'cucumber' },
      { name: 'Cherry tomatoes', amount: '200 g', key: 'tomato' },
      { name: 'Red onion', amount: '¼', key: 'onion' },
      { name: 'Mint', amount: 'a handful', key: 'mint' },
      { name: 'Lemon', amount: '1', key: 'lemon' },
      { name: 'Olive oil', amount: '2 tbsp', key: 'olive oil', staple: true },
      { name: 'Feta', amount: '50 g', key: 'feta' },
    ],
    steps: [
      'Drain and rinse the chickpeas.',
      'Chop the cucumber, halve the tomatoes and slice the onion as thinly as you can.',
      'Toss everything with the torn mint, the lemon juice, the olive oil and a pinch of salt.',
      'Crumble the feta over the top. It keeps well for tomorrow’s lunch.',
    ],
  },
  {
    id: 'banana-pancakes', name: 'Banana Oat Pancakes', region: 'American', dish: 'Diner', feels: ['Sweet', 'Cozy', 'Warm'],
    minutes: 15, kcal: 420, serves: 2, vegetarian: true, meals: ['Breakfast', 'Dessert', 'Snack'], kit: ['One pan', 'No oven'],
    ingredients: [
      { name: 'Ripe bananas', amount: '2', key: 'banana' },
      { name: 'Eggs', amount: '2', key: 'egg' },
      { name: 'Oats', amount: '1 cup', key: 'oat' },
      { name: 'Whole milk', amount: '120 ml', key: 'milk' },
      { name: 'Baking powder', amount: '1 tsp', key: 'baking powder', staple: true },
      { name: 'Honey', amount: 'to serve', key: 'honey' },
    ],
    steps: [
      'Blend the bananas, eggs, oats, milk and baking powder until smooth, then let it rest for 5 minutes.',
      'Heat a lightly buttered pan over a medium heat and pour in small rounds.',
      'Cook until bubbles appear and the edges set, about 2 minutes, then flip for 1 more.',
      'Stack them up and drizzle with honey.',
    ],
  },
  {
    id: 'jerk-chicken', name: 'Jerk Chicken with Rice and Peas', region: 'Caribbean', dish: 'Jamaican', feels: ['Spicy', 'Smoky', 'Hearty'],
    minutes: 40, kcal: 650, serves: 3, vegetarian: false, meals: ['Dinner'], kit: [],
    ingredients: [
      { name: 'Chicken thighs', amount: '6', key: 'chicken' },
      { name: 'Jerk seasoning', amount: '2 tbsp', key: 'jerk' },
      { name: 'Lime', amount: '1', key: 'lime' },
      { name: 'Rice', amount: '1½ cups', key: 'rice' },
      { name: 'Kidney beans', amount: '1 can', key: 'kidney bean' },
      { name: 'Coconut milk', amount: '1 can', key: 'coconut' },
      { name: 'Spring onions', amount: '3', key: 'spring onion|scallion' },
      { name: 'Thyme', amount: 'a few sprigs', key: 'thyme', staple: true },
    ],
    steps: [
      'Rub the chicken with the jerk seasoning and lime juice and leave it for 10 minutes.',
      'Roast at 220°C / 425°F for 30 to 35 minutes, until charred at the edges and 74°C / 165°F inside.',
      'Meanwhile simmer the rice with the coconut milk, drained beans, spring onions, thyme and a cup of water, covered, for 18 minutes.',
      'Rest the chicken for 5 minutes and serve it on the rice and peas.',
    ],
  },
];

const words = (text: string) => text.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2);
const finds = (key: string, name: string) => key.split('|').some((k) => name.toLowerCase().includes(k));

/** made from a food rather than being it: chicken stock is not chicken */
const DERIVED = /\b(stock|broth|sauce|soup|powder|seasoning|juice|syrup|oil|flavou?r|cube|gravy|extract|spread)\b/;

/** The pantry food that is this ingredient, best match first; none rather than a wrong one. */
function matchFor(ingredient: Ingredient, pantry: InventoryItem[]): InventoryItem | undefined {
  const wanted = words(ingredient.name);
  let best: { item: InventoryItem; score: number } | undefined;
  for (const item of pantry) {
    const name = item.food.name.toLowerCase();
    if (!finds(ingredient.key, name)) continue;
    let score = 1 + wanted.filter((w) => name.includes(w)).length * 2;
    if (DERIVED.test(name) && !DERIVED.test(ingredient.name.toLowerCase())) score -= 4;
    if (score > 0 && (!best || score > best.score)) best = { item, score };
  }
  return best?.item;
}

function when(days: number | null): string {
  if (days === 0) return 'goes off today';
  if (days === 1) return 'goes off tomorrow';
  return `goes off in ${days} days`;
}

function place(idea: Idea, everything: InventoryItem[]): Placed {
  // food past its date is not something to cook with: a recipe that needs it has it to buy
  const pantry = everything.filter((i) => i.expiryStatus !== 'expired' && (i.daysUntilExpiration === null || i.daysUntilExpiration >= 0) && i.quantity > 0);
  const have: Placed['have'] = [];
  const buy: Ingredient[] = [];
  for (const ingredient of idea.ingredients) {
    const item = matchFor(ingredient, pantry);
    if (item) have.push({ ingredient, item });
    else if (!ingredient.staple) buy.push(ingredient);
  }
  // the soonest-expiring thing it uses is the reason to cook it
  const soonest = [...have].sort((a, b) => (a.item.daysUntilExpiration ?? 99) - (b.item.daysUntilExpiration ?? 99))[0];
  const days = soonest?.item.daysUntilExpiration ?? null;
  const urgent = days !== null && days <= 2;
  const note = urgent
    ? `Uses the ${soonest!.item.food.name.toLowerCase()}, which ${when(days)}.`
    : !buy.length
      ? 'Everything for it is already in your kitchen.'
      : have.length
        ? `Uses ${have.length} ${have.length === 1 ? 'thing' : 'things'} you have, with ${buy.length} to buy.`
        : `Needs a shop: ${buy.length} things to buy.`;
  return { ...idea, have, buy, note, urgent };
}

/** Three tickets for this order: the best fit first, none repeated from earlier rounds. */
export function pickIdeas(order: Order, pantry: InventoryItem[], shown: string[] = []): Placed[] {
  const asked = words(order.want);
  const include = order.include.map((w) => w.toLowerCase());
  const leaveOut = order.leaveOut.map((w) => w.toLowerCase());
  const vegetarianOnly = /vegetarian|vegan/i.test(order.diet);
  const limit = TIME_LIMIT[order.time] ?? null;

  const scored = SAMPLES.filter((idea) => !shown.includes(idea.id))
    .filter((idea) => !leaveOut.some((w) => idea.ingredients.some((i) => i.name.toLowerCase().includes(w)) || idea.name.toLowerCase().includes(w)))
    .filter((idea) => !vegetarianOnly || idea.vegetarian)
    .filter((idea) => order.kit !== 'No cooking' || idea.kit.includes('No cooking'))
    .filter((idea) => order.kit !== 'No oven' || idea.kit.includes('No oven'))
    .map((idea) => {
      const placed = place(idea, pantry);
      let score = 0;
      // a cuisine someone picked outweighs the meal the clock guessed for them
      if (order.regions.includes(idea.region)) score += 6;
      if (order.dishes.includes(idea.dish)) score += 6;
      if (order.regions.length && !order.regions.includes(idea.region)) score -= 3;
      score += idea.feels.filter((f) => order.feels.includes(f)).length * 2;
      score += include.filter((w) => placed.ingredients.some((i) => i.name.toLowerCase().includes(w))).length * 3;
      score += asked.filter((w) => words(`${idea.name} ${idea.feels.join(' ')} ${idea.ingredients.map((i) => i.name).join(' ')}`).includes(w)).length * 1.5;
      if (order.meal !== 'Any meal' && !idea.meals.includes(order.meal)) score -= 3;
      if (limit && idea.minutes > limit) score -= 3;
      if (order.kit === 'One pan' && idea.kit.includes('One pan')) score += 1;
      if (order.from === 'only') score -= placed.buy.length * 2;
      if (order.from === 'mostly') score -= Math.max(0, placed.buy.length - 2);
      if (placed.urgent) score += 2;
      score += placed.have.length * 0.5;
      return { placed, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, 3).map((s) => s.placed);
}

/** Tickets not yet shown, for "Three more"; empty when the samples run out. */
export const remaining = (shown: string[]) => SAMPLES.filter((s) => !shown.includes(s.id)).length;
