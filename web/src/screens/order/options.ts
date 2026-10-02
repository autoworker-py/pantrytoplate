/*
 * What can go on an order. The feels and cuisines are the ticket's printed
 * tags; the small print is the receipt lines at its foot, each one a native
 * picker.
 */

export const FEELS = ['Warm', 'Spicy', 'Refreshing', 'Cozy', 'Light', 'Hearty', 'Cheesy', 'Crunchy', 'Zesty', 'Smoky', 'Sweet', 'Creamy'] as const;
export type Feel = (typeof FEELS)[number];

/** Broad groups first; tapping one prints its own cuisines underneath. */
export const CUISINES: { region: string; dishes: string[] }[] = [
  { region: 'Asian', dishes: ['Chinese', 'Japanese', 'Korean', 'Thai', 'Vietnamese', 'Filipino', 'Indonesian'] },
  { region: 'Hispanic', dishes: ['Mexican', 'Tex-Mex', 'Peruvian', 'Cuban', 'Colombian', 'Puerto Rican', 'Argentinian'] },
  { region: 'European', dishes: ['Italian', 'French', 'Spanish', 'Greek', 'German', 'British', 'Polish'] },
  { region: 'Mediterranean', dishes: ['Greek', 'Italian', 'Spanish', 'Lebanese', 'Turkish'] },
  { region: 'Middle Eastern', dishes: ['Lebanese', 'Turkish', 'Persian', 'Israeli', 'Moroccan'] },
  { region: 'South Asian', dishes: ['Indian', 'Pakistani', 'Sri Lankan', 'Nepali', 'Bangladeshi'] },
  { region: 'American', dishes: ['Southern', 'BBQ', 'Cajun', 'Diner', 'Hawaiian'] },
  { region: 'Caribbean', dishes: ['Jamaican', 'Cuban', 'Trinidadian', 'Haitian'] },
  { region: 'African', dishes: ['Ethiopian', 'Nigerian', 'Moroccan', 'South African', 'Senegalese'] },
];

export type From = 'only' | 'mostly' | 'anything';
export const FROM: [From, string][] = [
  ['only', 'Only mine'],
  ['mostly', 'Mostly mine'],
  ['anything', 'Anything'],
];

export const SMALL_PRINT = {
  meal: ['Any meal', 'Breakfast', 'Lunch', 'Dinner', 'Snack', 'Dessert'],
  time: ['Any time', 'Under 15 min', 'Under 30 min', 'Under 45 min', 'Under an hour', 'Slow is fine'],
  serves: ['1', '2', '3', '4', '5', '6', '8'],
  skill: ['Easy', 'Some effort', 'Show off'],
  kit: ['Any kit', 'One pan', 'No oven', 'Air fryer', 'Microwave only', 'Slow cooker', 'No cooking'],
  heat: ['Mild', 'Medium', 'Hot', 'Very hot'],
  diet: ['Vegetarian', 'Vegan', 'Pescatarian', 'Gluten-free', 'Dairy-free', 'Halal', 'Kosher', 'Low-carb'],
} as const;

/** minutes a time choice allows, or null for no limit */
export const TIME_LIMIT: Record<string, number | null> = {
  'Under 15 min': 15,
  'Under 30 min': 30,
  'Under 45 min': 45,
  'Under an hour': 60,
};

export interface Order {
  want: string;
  feels: Feel[];
  regions: string[];
  dishes: string[];
  include: string[];
  leaveOut: string[];
  from: From;
  meal: string;
  time: string;
  serves: string;
  skill: string;
  kit: string;
  heat: string;
  /** '' follows the diet in Settings */
  diet: string;
  calories: 'any' | 'fit' | 'light' | 'hearty';
}

/** What the clock suggests: nobody wants a dinner idea at 7am. */
export function mealNow(date = new Date()): string {
  const h = date.getHours() + date.getMinutes() / 60;
  if (h < 4) return 'Snack'; // after midnight is late, not early
  if (h < 10.5) return 'Breakfast';
  if (h < 15) return 'Lunch';
  if (h < 17) return 'Snack';
  return 'Dinner';
}

export function blankOrder(): Order {
  return {
    want: '',
    feels: [],
    regions: [],
    dishes: [],
    include: [],
    leaveOut: [],
    from: 'mostly',
    meal: mealNow(),
    time: 'Any time',
    serves: '2',
    skill: 'Easy',
    kit: 'Any kit',
    heat: 'Medium',
    diet: '',
    calories: 'any',
  };
}

/** Nothing written or ticked: the kitchen chooses. */
export const isBlank = (o: Order) => !o.want.trim() && !o.feels.length && !o.regions.length && !o.dishes.length && !o.include.length;
