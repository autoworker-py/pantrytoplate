/**
 * Make me something: an order in, recipes out.
 *
 * The order (what the person wants, how it should feel, the cuisine, foods to
 * use up, include and leave out, the small print) goes with a numbered list of
 * what is in their kitchen to the same model Snap a meal uses: Gemini, or
 * Claude when that is the key. Two steps keep the bill down: three short ideas
 * first, and the full recipe only for the one picked. Nothing is stored here,
 * not the order and not the replies, until someone saves a recipe.
 *
 * The model is told the rules, and the app still checks the two that matter
 * most itself: nothing the person asked to leave out, and nothing their diet
 * forbids. An idea that breaks either is dropped, and a recipe that does is
 * refused, rather than shown with a caveat.
 *
 * With no key, a development server answers from a few sample recipes so the
 * flow can be built and tested; a deployed one says the feature is not set up.
 */
import { z } from 'zod';
import { env } from '../env.js';
import { HttpError } from '../errors.js';
import { prisma } from '../db.js';
import { listInventory, type InventoryView } from './inventory.js';
import { RETRYABLE, RetryableError, parseJson, post, snapProvider, withRetries } from './snap.js';
import { parseIngredientLine } from './ingredientParser.js';
import { findOrCreateFoodByName } from './foodRef.js';
import { normalizeUnit } from './units.js';

export const FEELS = ['Warm', 'Spicy', 'Refreshing', 'Cozy', 'Light', 'Hearty', 'Cheesy', 'Crunchy', 'Zesty', 'Smoky', 'Sweet', 'Creamy'];

const word = z.string().trim().max(40);
export const OrderSchema = z.object({
  want: z.string().max(240).default(''),
  feels: z.array(word).max(12).default([]),
  regions: z.array(word).max(9).default([]),
  dishes: z.array(word).max(30).default([]),
  include: z.array(z.string().trim().max(60)).max(12).default([]),
  leaveOut: z.array(z.string().trim().max(60)).max(12).default([]),
  from: z.enum(['only', 'mostly', 'anything']).default('mostly'),
  meal: word.default('Any meal'),
  time: word.default('Any time'),
  serves: z.coerce.number().int().min(1).max(12).default(2),
  skill: word.default('Easy'),
  kit: word.default('Any kit'),
  heat: word.default('Medium'),
  diet: word.default(''),
  calories: z.enum(['any', 'fit', 'light', 'hearty']).default('any'),
  /** what is left of today's target, for "fit what's left" */
  caloriesLeft: z.coerce.number().int().min(0).max(10000).nullish(),
  /** ideas already shown, so "three more" brings new ones */
  avoid: z.array(z.string().trim().max(80)).max(12).default([]),
});
export type Order = z.infer<typeof OrderSchema>;

export const IdeaSchema = z.object({
  name: z.string().trim().min(1).max(80),
  cuisine: z.string().trim().max(40).default(''),
  uses: z.array(z.string().max(40)).max(30).default([]),
  buy: z.array(z.string().trim().max(60)).max(12).default([]),
});
export type IdeaInput = z.infer<typeof IdeaSchema>;

export interface KitchenIdea {
  id: string;
  name: string;
  cuisine: string;
  feels: string[];
  minutes: number;
  kcal: number;
  serves: number;
  why: string;
  /** inventory item ids it uses */
  uses: string[];
  buy: string[];
}

export interface KitchenRecipe {
  ingredients: { name: string; amount: string; inventoryItemId?: string }[];
  steps: string[];
  kcal: number | null;
}

/* ---------- what is in the kitchen ---------- */

export interface KitchenFood {
  n: number;
  item: InventoryView;
}

/** What the kitchen holds, numbered for the model: soonest-dated first, and nothing past its date. */
export async function kitchenFor(userId: string): Promise<KitchenFood[]> {
  const items = await listInventory(userId, { sort: 'expiration' });
  return items
    .filter((item) => item.expiryStatus !== 'expired' && item.quantity > 0)
    .slice(0, 60)
    .map((item, i) => ({ n: i + 1, item }));
}

const round = (n: number) => Math.round(n * 100) / 100;
const clean = (text: string, max = 80) => text.replace(/["\r\n\\]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

function kitchenLines(kitchen: KitchenFood[]): string {
  if (!kitchen.length) return '(nothing)';
  return kitchen
    .map(({ n, item }) => `${n}. ${clean(item.food.name, 50)} (${round(item.quantity)} ${item.unit}${item.daysUntilExpiration !== null ? `, ${item.daysUntilExpiration}d left` : ''})`)
    .join('\n');
}

/* ---------- the rules the app holds itself ---------- */

const MEAT = /\b(chicken|beef|pork|lamb|mutton|veal|bacon|ham|turkey|duck|sausage|chorizo|pepperoni|salami|prosciutto|pancetta|mince|steak|ribs|venison|goat|gelatin|lard)\b/i;
const FISH = /\b(fish|salmon|tuna|cod|haddock|tilapia|trout|sardine|anchov(y|ies)|shrimp|prawn|crab|lobster|mussel|clam|oyster|scallop|squid|octopus|fish sauce)\b/i;
const ANIMAL = /\b(egg|eggs|milk|cheese|cheddar|parmesan|feta|mozzarella|butter|cream|yogurt|yoghurt|honey|ghee|whey|mayonnaise|mayo)\b/i;
const GLUTEN = /\b(wheat|flour|bread|pasta|noodles?|couscous|barley|rye|spaghetti|tortillas?|breadcrumbs|soy sauce|orzo|gnocchi|semolina)\b/i;
const DAIRY = /\b(milk|cheese|cheddar|parmesan|feta|mozzarella|butter|cream|yogurt|yoghurt|ghee|whey)\b/i;

/** The diet that applies: the order's own choice, or the one in Settings. */
export function dietFor(order: Order, settingsTags: string[]): string[] {
  return order.diet ? [order.diet.toLowerCase()] : settingsTags.map((t) => t.toLowerCase());
}

/** Whether a food name breaks the diet or the leave-out list. */
export function forbidden(name: string, order: Order, diet: string[]): boolean {
  const lower = name.toLowerCase();
  if (order.leaveOut.some((w) => w && lower.includes(w.toLowerCase()))) return true;
  const isVegan = diet.includes('vegan');
  if ((isVegan || diet.includes('vegetarian')) && (MEAT.test(lower) || FISH.test(lower))) return true;
  if (diet.includes('pescatarian') && MEAT.test(lower)) return true;
  if (isVegan && ANIMAL.test(lower)) return true;
  if (diet.includes('gluten-free') && GLUTEN.test(lower) && !/gluten[- ]free/.test(lower)) return true;
  if (diet.includes('dairy-free') && DAIRY.test(lower) && !/(dairy[- ]free|plant|oat|soy|almond|coconut)/.test(lower)) return true;
  return false;
}

/* ---------- the order, written for the model ---------- */

const TIMES: Record<string, string> = {
  'Under 15 min': 'ready in under 15 minutes',
  'Under 30 min': 'ready in under 30 minutes',
  'Under 45 min': 'ready in under 45 minutes',
  'Under an hour': 'ready in under an hour',
  'Slow is fine': 'slow cooking is welcome',
};
const SKILLS: Record<string, string> = { Easy: 'easy, few steps', 'Some effort': 'some effort is fine', 'Show off': 'impressive, worth the effort' };
const KIT: Record<string, string> = {
  'One pan': 'one pan or pot',
  'No oven': 'no oven',
  'Air fryer': 'an air fryer',
  'Microwave only': 'a microwave only',
  'Slow cooker': 'a slow cooker',
  'No cooking': 'no cooking at all',
};

export function orderLines(order: Order, diet: string[], unitSystem: string): string {
  const lines: string[] = [];
  if (order.want.trim()) lines.push(`- Wants: "${clean(order.want, 240)}"`);
  if (order.feels.length) lines.push(`- Should feel: ${order.feels.map((f) => clean(f, 20)).join(', ')}`);
  if (order.feels.includes('Spicy')) lines.push(`- Heat: ${clean(order.heat, 12).toLowerCase()}`);
  const cuisine = order.dishes.length ? order.dishes : order.regions;
  if (cuisine.length) lines.push(`- Cuisine: ${cuisine.map((c) => clean(c, 30)).join(' or ')}`);
  if (order.include.length) lines.push(`- Must include: ${order.include.map((f) => clean(f, 40)).join(', ')}`);
  if (order.leaveOut.length) lines.push(`- Never use: ${order.leaveOut.map((f) => clean(f, 40)).join(', ')}`);
  if (order.meal !== 'Any meal') lines.push(`- Meal: ${clean(order.meal, 20).toLowerCase()}`);
  if (TIMES[order.time]) lines.push(`- Time: ${TIMES[order.time]}`);
  lines.push(`- Serves ${order.serves}`);
  if (SKILLS[order.skill]) lines.push(`- Skill: ${SKILLS[order.skill]}`);
  if (KIT[order.kit]) lines.push(`- Equipment: ${KIT[order.kit]}`);
  if (diet.length) lines.push(`- Diet, strictly: ${diet.join(', ')}`);
  if (order.calories === 'fit' && order.caloriesLeft) lines.push(`- Under ${order.caloriesLeft} kcal a serving`);
  if (order.calories === 'light') lines.push('- Light: under 500 kcal a serving');
  if (order.calories === 'hearty') lines.push('- Hearty and filling');
  lines.push(`- Amounts in ${unitSystem === 'imperial' ? 'US units (cups, tbsp, tsp, oz, lb)' : 'metric units (g, ml)'}`);
  return lines.join('\n');
}

const STAPLES = 'salt, pepper, cooking oil, water and dried herbs and spices';
const FROM_RULE: Record<Order['from'], string> = {
  only: `- Use only kitchen foods, plus ${STAPLES}. Nothing to buy: b is empty.`,
  mostly: '- Use mostly kitchen foods, with at most 3 ingredients to buy.',
  anything: '- Any ingredients, using kitchen foods where they fit.',
};

export function ideasPrompt(order: Order, kitchen: KitchenFood[], diet: string[], unitSystem: string): string {
  return [
    'You plan home cooking for a pantry app. Suggest exactly 3 recipes for this order, clearly different from each other.',
    'ORDER',
    orderLines(order, diet, unitSystem),
    'KITCHEN (number. food (amount, days left))',
    kitchenLines(kitchen),
    'RULES',
    FROM_RULE[order.from],
    '- Prefer kitchen foods with the fewest days left.',
    '- Never use anything under "Never use", and follow the diet strictly.',
    '- Real dishes a home cook would make, with honest times and calories.',
    ...(order.avoid.length ? [`- Not these again: ${order.avoid.map((a) => clean(a, 60)).join('; ')}.`] : []),
    `Reply as JSON. r: the 3 recipes, each with n name (at most 48 characters), c cuisine (one or two words), f how it feels (1 to 3 of: ${FEELS.join(', ')}), m total minutes, k kcal per serving, w why it fits this order (at most 12 words), u the kitchen numbers it uses, b ingredients to buy (short names, lower case, not ${STAPLES}).`,
  ].join('\n');
}

export function recipePrompt(order: Order, idea: IdeaInput, kitchen: KitchenFood[], diet: string[], unitSystem: string): string {
  const uses = kitchen.filter(({ item }) => idea.uses.includes(item.id)).map(({ n, item }) => `${n}. ${clean(item.food.name, 50)}`);
  return [
    `Write the recipe for "${clean(idea.name, 60)}"${idea.cuisine ? ` (${clean(idea.cuisine, 30)})` : ''} for this order.`,
    'ORDER',
    orderLines(order, diet, unitSystem),
    'KITCHEN (number. food (amount, days left))',
    kitchenLines(kitchen),
    'RULES',
    `- From the kitchen, use: ${uses.length ? uses.join('; ') : 'whatever fits'}.`,
    `- To buy, only: ${idea.buy.length ? idea.buy.map((b) => clean(b, 40)).join(', ') : 'nothing'}, plus ${STAPLES}.`,
    '- Short, specific steps with times and how to tell when it is done. Cook meat, poultry, fish and eggs through to safe temperatures.',
    '- Never use anything under "Never use", and follow the diet strictly.',
    'Reply as JSON. g: the ingredients, each with n name, a amount, p its kitchen number when it comes from the kitchen. t: the steps, at most 10. k: kcal per serving.',
  ].join('\n');
}

/* ---------- asking the model ---------- */

const IDEAS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    r: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          n: { type: 'STRING' },
          c: { type: 'STRING' },
          f: { type: 'ARRAY', items: { type: 'STRING' } },
          m: { type: 'INTEGER' },
          k: { type: 'INTEGER' },
          w: { type: 'STRING' },
          u: { type: 'ARRAY', items: { type: 'INTEGER' } },
          b: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['n', 'c', 'f', 'm', 'k', 'w', 'u', 'b'],
      },
    },
  },
  required: ['r'],
};

const RECIPE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    g: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { n: { type: 'STRING' }, a: { type: 'STRING' }, p: { type: 'INTEGER' } }, required: ['n', 'a'] },
    },
    t: { type: 'ARRAY', items: { type: 'STRING' } },
    k: { type: 'INTEGER' },
  },
  required: ['g', 't', 'k'],
};

/** A photo sent with the words: base64 and its type. */
export interface ModelImage {
  data: string;
  mediaType: string;
}

async function askGemini(prompt: string, schema: object, maxTokens: number, temperature: number, model: string, image?: ModelImage): Promise<unknown> {
  const response = await post(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.geminiApiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: image ? [{ inline_data: { mime_type: image.mediaType, data: image.data } }, { text: prompt }] : [{ text: prompt }] }],
      generationConfig: { temperature, maxOutputTokens: maxTokens, responseMimeType: 'application/json', responseSchema: schema },
    }),
  });
  if (RETRYABLE.has(response.status)) throw new RetryableError(response.status);
  if (!response.ok) throw new HttpError(502, 'The kitchen could not write that. Try again.', 'kitchen_failed');
  const data = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
  return parseJson(text || '{}');
}

async function askClaude(prompt: string, example: string, maxTokens: number, image?: ModelImage): Promise<unknown> {
  const text = `${prompt} Reply with only JSON like ${example}`;
  const response = await post('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.anthropicApiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: env.anthropicModel,
      max_tokens: maxTokens,
      messages: [
        {
          role: 'user',
          content: image ? [{ type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } }, { type: 'text', text }] : text,
        },
      ],
    }),
  });
  if (RETRYABLE.has(response.status)) throw new RetryableError(response.status);
  if (!response.ok) throw new HttpError(502, 'The kitchen could not write that. Try again.', 'kitchen_failed');
  const data = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
  return parseJson(data.content?.find((block) => block.type === 'text')?.text ?? '{}');
}

/** For tests: answer as the model would, without one. */
let fakeModel: ((prompt: string) => unknown) | null = null;
export const useFakeKitchen = (answer: ((prompt: string) => unknown) | null) => { fakeModel = answer; };

export interface ModelShape {
  /** Gemini's response schema, so nothing else can come back */
  schema: object;
  /** a reply in the same shape, for a model without schemas */
  example: string;
  maxTokens: number;
  temperature: number;
  /** what a development server with no key answers with */
  sample: unknown;
  /** said when this server has no model at all */
  off: string;
}

/**
 * One JSON answer from whichever model this server has, retried while busy,
 * with the last tries going to a steadier model when the newest one stays
 * overloaded. Shared by the kitchen and by reading recipes out of posts.
 */
export async function askModel(prompt: string, shape: ModelShape, image?: ModelImage): Promise<unknown> {
  if (fakeModel) return fakeModel(prompt);
  const provider = snapProvider();
  if (!provider) throw new HttpError(503, shape.off, 'kitchen_off');
  if (provider === 'sample') return shape.sample;

  const model = (n: number) => (n >= 3 && env.geminiFallbackModel ? env.geminiFallbackModel : env.geminiModel);
  try {
    return await withRetries((n) =>
      provider === 'gemini' ? askGemini(prompt, shape.schema, shape.maxTokens, shape.temperature, model(n), image) : askClaude(prompt, shape.example, shape.maxTokens, image),
    );
  } catch (error) {
    if (error instanceof RetryableError) {
      throw error.status === 429
        ? new HttpError(429, 'Too many requests just now. Try again in a minute.', 'kitchen_busy')
        : new HttpError(503, 'The AI is busy right now. Try again in a minute.', 'kitchen_busy');
    }
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, 'The AI could not answer that. Try again.', 'kitchen_failed');
  }
}

function ask(prompt: string, kind: 'ideas' | 'recipe'): Promise<unknown> {
  return askModel(
    prompt,
    kind === 'ideas'
      ? { schema: IDEAS_SCHEMA, example: '{"r":[{"n":"Miso Butter Noodles","c":"Japanese","f":["Cozy"],"m":15,"k":560,"w":"Fast and uses the eggs first","u":[2],"b":["miso"]}]}', maxTokens: 900, temperature: 0.9, sample: SAMPLE_IDEAS, off: 'Make me something is not set up on this server yet.' }
      : { schema: RECIPE_SCHEMA, example: '{"g":[{"n":"eggs","a":"2","p":2}],"t":["Boil the noodles for 4 minutes."],"k":560}', maxTokens: 1400, temperature: 0.4, sample: SAMPLE_RECIPE, off: 'Make me something is not set up on this server yet.' },
  );
}

/* ---------- shaping the replies ---------- */

const IdeaReply = z.object({
  n: z.string().trim().min(1).transform((s) => s.slice(0, 80)),
  c: z.string().trim().default('').transform((s) => s.slice(0, 40)),
  f: z.array(z.string()).default([]),
  m: z.coerce.number().int().min(1).max(600),
  k: z.coerce.number().int().min(0).max(5000),
  w: z.string().trim().default('').transform((s) => s.slice(0, 160)),
  u: z.array(z.coerce.number().int()).default([]),
  b: z.array(z.string().trim().min(1)).default([]),
});

/** The model's ideas, as the app shows them: kitchen numbers become the person's own items, and rule-breakers are dropped. */
export function shapeIdeas(reply: unknown, kitchen: KitchenFood[], order: Order, diet: string[]): KitchenIdea[] {
  const raw = z.object({ r: z.array(z.unknown()).default([]) }).safeParse(reply);
  if (!raw.success) return [];
  const byNumber = new Map(kitchen.map(({ n, item }) => [n, item]));
  const stamp = Date.now().toString(36);
  const ideas: KitchenIdea[] = [];
  for (const candidate of raw.data.r.slice(0, 5)) {
    const parsed = IdeaReply.safeParse(candidate);
    if (!parsed.success) continue;
    const it = parsed.data;
    const used = [...new Set(it.u)].map((n) => byNumber.get(n)).filter((item): item is InventoryView => Boolean(item));
    const buy = [...new Set(it.b.map((b) => b.slice(0, 60)))].slice(0, 8);
    if (order.from === 'only' && buy.length) continue;
    if ([it.n, ...buy, ...used.map((item) => item.food.name)].some((name) => forbidden(name, order, diet))) continue;
    const feels = it.f.map((f) => FEELS.find((known) => known.toLowerCase() === f.trim().toLowerCase())).filter((f): f is string => Boolean(f));
    ideas.push({
      id: `${stamp}${ideas.length}`,
      name: it.n,
      cuisine: it.c,
      feels: [...new Set(feels)].slice(0, 3),
      minutes: it.m,
      kcal: it.k,
      serves: order.serves,
      why: it.w,
      uses: used.map((item) => item.id),
      buy,
    });
    if (ideas.length === 3) break;
  }
  return ideas;
}

const RecipeReply = z.object({
  g: z.array(z.object({ n: z.string().trim().min(1), a: z.string().trim().default(''), p: z.coerce.number().int().optional() })).min(1),
  t: z.array(z.string().trim().min(1)).min(1),
  k: z.coerce.number().int().min(0).max(5000).optional(),
});

/** words for how food is kept, cut or sized, not what it is */
const NOT_FOOD = new Set(['fresh', 'dried', 'frozen', 'canned', 'tinned', 'raw', 'cooked', 'leftover', 'whole', 'large', 'small', 'medium', 'baby', 'ground', 'chopped', 'sliced', 'diced', 'grated', 'minced', 'boneless', 'skinless', 'organic', 'plain', 'salted', 'unsalted', 'sweet', 'low', 'fat', 'free', 'extra', 'virgin', 'light', 'heavy', 'red', 'green', 'white', 'black', 'yellow', 'brown', 'and', 'with', 'the', 'all', 'purpose']);
const stem = (w: string) => w.replace(/ies$/, 'y').replace(/(o|ch|sh|x|ss)es$/, '$1').replace(/([^s])s$/, '$1');
const foodWords = (name: string) => name.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2 && !NOT_FOOD.has(w)).map(stem);

/** A model now and then gives an ingredient the wrong kitchen number; a link is only kept when the two names share a food word. */
export function sameFood(ingredient: string, food: string): boolean {
  const theirs = new Set(foodWords(food));
  return foodWords(ingredient).some((w) => theirs.has(w));
}

/** The full recipe: kitchen numbers become item ids; a recipe that breaks the person's rules is refused, not shown. */
export function shapeRecipe(reply: unknown, kitchen: KitchenFood[], order: Order, diet: string[]): KitchenRecipe {
  const parsed = RecipeReply.safeParse(reply);
  if (!parsed.success) throw new HttpError(502, 'The kitchen could not write that one up. Try again.', 'kitchen_failed');
  const byNumber = new Map(kitchen.map(({ n, item }) => [n, item]));
  const ingredients = parsed.data.g.slice(0, 30).map((g) => {
    const item = g.p !== undefined ? byNumber.get(g.p) : undefined;
    const linked = item && sameFood(g.n, item.food.name) ? item : undefined;
    return { name: g.n.slice(0, 80), amount: g.a.slice(0, 60), ...(linked ? { inventoryItemId: linked.id } : {}) };
  });
  if (ingredients.some((i) => forbidden(i.name, order, diet))) {
    throw new HttpError(502, 'That recipe came back with something you asked to leave out or your diet rules out. Pick another or try again.', 'kitchen_rules');
  }
  return { ingredients, steps: parsed.data.t.slice(0, 12).map((s) => s.slice(0, 500)), kcal: parsed.data.k ?? null };
}

/* ---------- the three things the screen does ---------- */

async function context(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { dietTags: true, unitSystem: true } });
  const tags = (user.dietTags ?? '').split(',').map((t) => t.trim()).filter(Boolean);
  return { tags, unitSystem: user.unitSystem };
}

export async function kitchenIdeas(userId: string, order: Order): Promise<{ ideas: KitchenIdea[]; sample: boolean }> {
  const [kitchen, { tags, unitSystem }] = await Promise.all([kitchenFor(userId), context(userId)]);
  const diet = dietFor(order, tags);
  const reply = await ask(ideasPrompt(order, kitchen, diet, unitSystem), 'ideas');
  return { ideas: shapeIdeas(reply, kitchen, order, diet), sample: !fakeModel && snapProvider() === 'sample' };
}

export async function kitchenRecipe(userId: string, order: Order, idea: IdeaInput): Promise<KitchenRecipe> {
  const [kitchen, { tags, unitSystem }] = await Promise.all([kitchenFor(userId), context(userId)]);
  const diet = dietFor(order, tags);
  const reply = await ask(recipePrompt(order, idea, kitchen, diet, unitSystem), 'recipe');
  return shapeRecipe(reply, kitchen, order, diet);
}

export const SaveSchema = z.object({
  name: z.string().trim().min(1).max(80),
  cuisine: z.string().trim().max(40).default(''),
  why: z.string().trim().max(160).default(''),
  minutes: z.coerce.number().int().min(1).max(600),
  serves: z.coerce.number().int().min(1).max(12),
  ingredients: z.array(z.object({ name: z.string().trim().min(1).max(80), amount: z.string().trim().max(60).default(''), inventoryItemId: z.string().max(40).optional() })).min(1).max(30),
  steps: z.array(z.string().trim().min(1).max(500)).min(1).max(12),
});

/**
 * Keep a recipe from the kitchen in the person's own book. A kitchen food
 * links to exactly the food on their shelf, so cooking it later deducts the
 * right thing; anything else is matched by name, and a food the app has never
 * seen becomes their own, never a shared catalogue entry.
 */
export async function saveKitchenRecipe(userId: string, body: z.infer<typeof SaveSchema>) {
  const ingredients = [];
  for (const ingredient of body.ingredients) {
    const parsed = parseIngredientLine(`${ingredient.amount} ${ingredient.name}`.trim());
    const own = ingredient.inventoryItemId
      ? await prisma.inventoryItem.findFirst({ where: { id: ingredient.inventoryItemId, userId }, select: { foodReferenceId: true } })
      : null;
    const foodReferenceId =
      own?.foodReferenceId ??
      (await findOrCreateFoodByName({ name: parsed.name || ingredient.name, defaultUnit: parsed.unit }, prisma, userId)).food.id;
    ingredients.push({
      foodReferenceId,
      quantityRequired: parsed.quantity > 0 ? parsed.quantity : 1,
      unitRequired: normalizeUnit(parsed.unit),
      note: parsed.quantityFound ? parsed.note : ingredient.amount || null,
    });
  }
  return prisma.recipe.create({
    data: {
      name: body.name,
      description: body.why || null,
      instructions: body.steps.map((step, i) => `${i + 1}. ${step}`).join('\n'),
      servings: body.serves,
      source: 'user',
      ownerId: userId,
      cookMinutes: body.minutes,
      cuisine: body.cuisine || null,
      tags: 'made to order',
      ingredients: { create: ingredients },
    },
    select: { id: true, name: true },
  });
}

/* ---------- a development server with no key answers from these ---------- */

const SAMPLE_IDEAS = {
  r: [
    { n: 'Spinach and Feta Omelette', c: 'Greek', f: ['Warm', 'Light'], m: 12, k: 380, w: 'Quick, and uses what is closest to its date', u: [1, 2], b: ['feta'] },
    { n: 'Miso Butter Noodles', c: 'Japanese', f: ['Cozy', 'Creamy'], m: 15, k: 560, w: 'Comforting and done in fifteen minutes', u: [2, 3], b: ['white miso', 'udon noodles'] },
    { n: 'Chickpea and Tomato Stew', c: 'Mediterranean', f: ['Warm', 'Hearty'], m: 30, k: 420, w: 'One pot from the cupboard', u: [3, 4], b: ['chickpeas'] },
  ],
};
const SAMPLE_RECIPE = {
  g: [
    { n: 'eggs', a: '3', p: 1 },
    { n: 'baby spinach', a: '2 handfuls', p: 2 },
    { n: 'feta', a: '40 g' },
    { n: 'butter', a: '1 tbsp' },
  ],
  t: [
    'Beat the eggs with a pinch of salt and pepper.',
    'Melt the butter in a non-stick pan over a medium heat and wilt the spinach, about a minute.',
    'Pour in the eggs and stir gently until almost set, then crumble over the feta.',
    'Fold it over and slide it onto a plate once the middle is just set.',
  ],
  k: 380,
};
