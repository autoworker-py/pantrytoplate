/* Shared demo data and helpers for the Fridge Light variations. */
let flUid = 0;
const uid = (p) => `${p}${++flUid}`;
/* eggs leave the front row first, right to left, the way you would take them */
const EGG_ORDER = [5, 4, 3, 2, 1, 0, 11, 10, 9, 8, 7, 6];
const eggsGone = (n) => new Set(EGG_ORDER.slice(0, 12 - n));

/* The demo account's fridge as seeded, plus one container of leftovers. */
const FOOD = {
  milk:    { name: 'Whole milk', q: '1 gal', days: 2, draw: 'jug', level: .94 },
  yogurt:  { name: 'Greek yogurt', q: '500 g', days: 10, draw: 'tub', level: .8 },
  butter:  { name: 'Butter', q: '227 g', days: 45, draw: 'butter', n: 2 },
  egg:     { name: 'Eggs', q: '12', days: 18, draw: 'eggs', n: 12 },
  cheddar: { name: 'Cheddar', q: '250 g', days: 21, draw: 'cheddar', level: .56 },
  parm:    { name: 'Parmesan', q: '100 g', days: 40, draw: 'wedge', level: .5 },
  chicken: { name: 'Chicken breast', q: '3', days: 3, draw: 'tray', n: 3 },
  bacon:   { name: 'Bacon', q: '8 slices', days: 6, draw: 'bacon', n: 8 },
  chilli:  { name: 'Chilli', q: '2 servings', days: 4, draw: 'box', level: .55 },
  spinach: { name: 'Baby spinach', q: '142 g', days: 1, draw: 'bag', level: 1 },
  mush:    { name: 'Mushrooms', q: '250 g', days: 6, draw: 'punnet', n: 10 },
};

const RECIPES = [
  { name: 'Spinach and Cheddar Scramble', why: 'Uses the spinach, which goes off tomorrow.', urgent: true, facts: '9 min · 390 kcal · serves 1',
    plus: 'Plus olive oil and salt from the cupboard.',
    badge: { egg: '3 eggs', spinach: '2 cups spinach', cheddar: '30 g cheddar' },
    after: { egg: { n: 9, q: '9' }, spinach: { level: .58, q: '82 g' }, cheddar: { level: .5, q: '220 g' } },
    done: 'Cooked. 9 eggs, 82 g spinach and 220 g cheddar left.', kcal: 390 },
  { name: 'Chicken Fried Steak-Style Cutlets', why: 'Uses the milk before Monday.', facts: '40 min · 587 kcal · serves 4',
    plus: 'Plus flour, oil and spices from the cupboard.',
    badge: { chicken: '2 breasts', milk: '1½ cups', egg: '2 eggs' } },
  { name: 'Bacon Carbonara', why: 'Nothing to buy.', facts: '23 min · 1,155 kcal · serves 2',
    plus: 'Plus spaghetti and black pepper.',
    badge: { bacon: '6 slices', egg: '3 eggs', parm: '60 g parmesan' } },
];
