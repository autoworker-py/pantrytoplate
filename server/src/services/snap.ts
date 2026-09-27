/**
 * Snap a meal: a photo of a plate in, the foods on it out, each with a
 * portion, calories and macros for the person to check before logging.
 *
 * The photo goes to one vision model, chosen by which key is configured:
 * Gemini (GEMINI_API_KEY) or Claude (ANTHROPIC_API_KEY). Swapping is a setting,
 * not a code change. With neither, a development server answers with a sample
 * plate so the flow can be built and tested; a deployed one says photo
 * reading is not set up. The photo is never stored here.
 *
 * Estimates from a photo are rough, and the prompt asks for honesty about it:
 * hidden fats and sauces come back as their own items with a note saying what
 * they were inferred from, so the person can take them out.
 */
import { z } from 'zod';
import { env } from '../env.js';
import { HttpError } from '../errors.js';

export interface PlateItem {
  id: string;
  name: string;
  grams: number;
  portion: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** where it sits in the photo, as fractions of width and height from the top left */
  at: [number, number];
  note?: string;
}

export interface Plate {
  items: PlateItem[];
  provider: 'gemini' | 'claude' | 'sample';
}

const PROMPT = `You are estimating the nutrition of a meal from one photo, for a calorie-tracking app.

List each distinct food or drink you can see. Group identical pieces ("sliced chicken breast", not each slice). For each item give:
- name: a short everyday name, lower case except proper nouns ("grilled chicken", "white rice")
- grams: your best estimate of its weight as served
- portion: how a person would say the amount ("about 1 cup", "two slices", "about 150 g")
- calories, protein, carbs, fat: for that portion; protein, carbs and fat in grams
- x, y: where the item's centre sits in the photo, from 0 to 1, with 0,0 the top left
- note: only when useful, one short sentence

Include fats and sauces you can reasonably infer (an oil sheen, a dressing, butter on bread) as their own items, with a note saying what you inferred them from, so the person can remove them if they were not there. If you are unsure what something is, say so in the note. Judge portions from the plate, cutlery and hands for scale. Estimate honestly rather than rounding everything to neat numbers. If the photo shows no food, return an empty list.`;

const ItemSchema = z.object({
  name: z.string().min(1).max(80),
  grams: z.coerce.number().nonnegative().max(5000),
  portion: z.string().max(80).default(''),
  calories: z.coerce.number().nonnegative().max(10000),
  protein: z.coerce.number().nonnegative().max(1000).default(0),
  carbs: z.coerce.number().nonnegative().max(1000).default(0),
  fat: z.coerce.number().nonnegative().max(1000).default(0),
  x: z.coerce.number().default(0.5),
  y: z.coerce.number().default(0.5),
  note: z.string().max(200).nullish(),
});
const ReplySchema = z.object({ items: z.array(z.unknown()).default([]) });

/** The shape asked of Gemini, in its schema dialect. */
const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          grams: { type: 'NUMBER' },
          portion: { type: 'STRING' },
          calories: { type: 'NUMBER' },
          protein: { type: 'NUMBER' },
          carbs: { type: 'NUMBER' },
          fat: { type: 'NUMBER' },
          x: { type: 'NUMBER' },
          y: { type: 'NUMBER' },
          note: { type: 'STRING' },
        },
        required: ['name', 'grams', 'portion', 'calories', 'protein', 'carbs', 'fat', 'x', 'y'],
      },
    },
  },
  required: ['items'],
};

const SAMPLE: Array<z.infer<typeof ItemSchema>> = [
  { name: 'grilled chicken', grams: 150, portion: 'About 150 g, sliced', calories: 248, protein: 46, carbs: 0, fat: 5, x: 0.66, y: 0.66 },
  { name: 'white rice', grams: 158, portion: 'About 1 cup', calories: 205, protein: 4, carbs: 45, fat: 0.4, x: 0.34, y: 0.4 },
  { name: 'broccoli', grams: 91, portion: 'About 1 cup', calories: 31, protein: 3, carbs: 6, fat: 0.3, x: 0.7, y: 0.32 },
  { name: 'butter or oil', grams: 14, portion: 'About 1 tbsp', calories: 102, protein: 0, carbs: 0, fat: 11.5, x: 0.52, y: 0.2, note: 'Guessed from the shine on the broccoli. Take it out if there wasn’t any.' },
];

/** Busy, rate-limited or briefly down: worth another try after a wait. */
export class RetryableError extends Error {
  constructor(public status: number) {
    super(`The photo reader answered ${status}.`);
  }
}

const RETRYABLE = new Set([429, 500, 502, 503, 504, 529]);
/** Google's advice for a 503: wait 1, 2, 4, then 8 seconds between attempts. */
export const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000];
/** each attempt's own limit, so five of them and the waits fit inside the phone's 100 seconds */
const ATTEMPT_TIMEOUT_MS = 15_000;

export async function withRetries<T>(
  attempt: (n: number) => Promise<T>,
  delays: number[] = RETRY_DELAYS_MS,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<T> {
  for (let n = 0; ; n++) {
    try {
      return await attempt(n);
    } catch (error) {
      if (!(error instanceof RetryableError) || n >= delays.length) throw error;
      await sleep(delays[n]!);
    }
  }
}

export function snapProvider(): Plate['provider'] | null {
  if (env.geminiApiKey) return 'gemini';
  if (env.anthropicApiKey) return 'claude';
  return env.nodeEnv === 'production' ? null : 'sample';
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0.5));
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function tidy(raw: unknown[]): PlateItem[] {
  const items: PlateItem[] = [];
  for (const [i, candidate] of raw.slice(0, 12).entries()) {
    const parsed = ItemSchema.safeParse(candidate);
    if (!parsed.success) continue;
    const it = parsed.data;
    items.push({
      id: `i${i}`,
      name: capitalise(it.name.trim()),
      grams: Math.round(it.grams),
      portion: it.portion.trim() || `About ${Math.round(it.grams)} g`,
      calories: Math.round(it.calories),
      protein: round1(it.protein),
      carbs: round1(it.carbs),
      fat: round1(it.fat),
      at: [clamp01(it.x), clamp01(it.y)],
      ...(it.note ? { note: it.note.trim() } : {}),
    });
  }
  return items;
}

/** A reply the model wrapped in a code fence is still a reply. */
function parseJson(text: string): unknown {
  const bare = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  return JSON.parse(bare);
}

/** A timed-out or dropped request is as retryable as a busy answer. */
async function post(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS) });
  } catch {
    throw new RetryableError(504);
  }
}

async function askGemini(image: string, mediaType: string, model: string): Promise<unknown> {
  const response = await post(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.geminiApiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mediaType, data: image } }, { text: PROMPT }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: GEMINI_SCHEMA },
    }),
  });
  if (RETRYABLE.has(response.status)) throw new RetryableError(response.status);
  if (!response.ok) throw new HttpError(502, 'That photo could not be read. Try again.', 'snap_failed');
  const data = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
  return parseJson(text || '{"items":[]}');
}

async function askClaude(image: string, mediaType: string): Promise<unknown> {
  const response = await post('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.anthropicApiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: env.anthropicModel,
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
            { type: 'text', text: `${PROMPT}\n\nReply with only a JSON object: {"items": [{"name", "grams", "portion", "calories", "protein", "carbs", "fat", "x", "y", "note"}]}.` },
          ],
        },
      ],
    }),
  });
  if (RETRYABLE.has(response.status)) throw new RetryableError(response.status);
  if (!response.ok) throw new HttpError(502, 'That photo could not be read. Try again.', 'snap_failed');
  const data = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
  return parseJson(data.content?.find((block) => block.type === 'text')?.text ?? '{"items":[]}');
}

export async function readPlate(image: string, mediaType: string): Promise<Plate> {
  const provider = snapProvider();
  if (!provider) throw new HttpError(503, 'Photo reading is not set up on this server yet.', 'snap_off');
  if (provider === 'sample') return { provider, items: tidy(SAMPLE) };

  // the last two tries go to a steadier model when the newest one stays overloaded
  const model = (n: number) => (n >= 3 && env.geminiFallbackModel ? env.geminiFallbackModel : env.geminiModel);
  let reply: unknown;
  try {
    reply = await withRetries((n) => (provider === 'gemini' ? askGemini(image, mediaType, model(n)) : askClaude(image, mediaType)));
  } catch (error) {
    if (error instanceof RetryableError) {
      throw error.status === 429
        ? new HttpError(429, 'Too many photos just now. Try again in a minute.', 'snap_busy')
        : new HttpError(503, 'The photo reader is busy right now. Try again in a minute.', 'snap_busy');
    }
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, 'That photo could not be read. Try again.', 'snap_failed');
  }
  const parsed = ReplySchema.safeParse(reply);
  return { provider, items: parsed.success ? tidy(parsed.data.items) : [] };
}
