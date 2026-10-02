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
 * Every photo arrives as exactly 768 by 768 pixels, so each read costs the
 * same, and the reply is only what the app uses. Estimates from a photo are
 * rough: fats and sauces the model infers but cannot see come back as their
 * own items, flagged, so the person can take them out.
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
  note?: string;
}

export interface Plate {
  items: PlateItem[];
  provider: 'gemini' | 'claude' | 'sample';
}

/*
 * Output is billed by the token, so the reader answers with exactly what the
 * app uses and nothing else: one-letter keys, whole numbers, no prose. A food
 * it inferred rather than saw is a flag, and the server writes the sentence.
 * Where each food sits in the photo is not asked for: it was never placed
 * well enough to be worth its tokens.
 *   n name, g grams, k kcal, p c f protein, carbs and fat in grams, e inferred
 */
const PROMPT =
  'Estimate the nutrition of the meal in this photo for a calorie tracker. One entry per distinct food or drink; group identical pieces. ' +
  'n: short everyday name, lower case. g: grams as served. k: kcal. p, c, f: protein, carbs and fat in grams. ' +
  'Add cooking fat or sauce you can infer but not see (an oil sheen, butter on toast) as its own entry with e true. ' +
  'Judge size from the plate, cutlery and hands, and do not round to neat numbers. No food: an empty list.';

/**
 * The prompt, with the person's own words for what is in the photo when they
 * gave any. Their words name the foods; the photo still decides how much.
 */
export function promptFor(hint?: string): string {
  const said = hint?.replace(/["\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
  return said ? `${PROMPT} The person says it is: "${said}". Use that to name the foods; judge amounts from the photo.` : PROMPT;
}

/** A plate's worth of entries is a few hundred tokens; a runaway reply stops here instead of being billed. */
const MAX_OUTPUT_TOKENS = 1024;

const INFERRED = 'Not visible in the photo, just likely. Leave it out if it wasn’t used.';

const ItemSchema = z.object({
  n: z.string().trim().min(1).transform((name) => name.slice(0, 60)),
  g: z.coerce.number().nonnegative().max(5000),
  k: z.coerce.number().nonnegative().max(10000),
  p: z.coerce.number().nonnegative().max(1000).default(0),
  c: z.coerce.number().nonnegative().max(1000).default(0),
  f: z.coerce.number().nonnegative().max(1000).default(0),
  e: z.unknown().transform((flag) => flag === true || flag === 'true'),
});
const ReplySchema = z.object({ i: z.array(z.unknown()).default([]) });

/** The same shape, as Gemini's schema, so nothing else can come back. */
const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    i: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          n: { type: 'STRING' },
          g: { type: 'INTEGER' },
          k: { type: 'INTEGER' },
          p: { type: 'INTEGER' },
          c: { type: 'INTEGER' },
          f: { type: 'INTEGER' },
          e: { type: 'BOOLEAN' },
        },
        required: ['n', 'g', 'k', 'p', 'c', 'f'],
      },
    },
  },
  required: ['i'],
};

const SAMPLE: Array<z.input<typeof ItemSchema>> = [
  { n: 'grilled chicken', g: 150, k: 248, p: 46, c: 0, f: 5 },
  { n: 'white rice', g: 158, k: 205, p: 4, c: 45, f: 0 },
  { n: 'broccoli', g: 91, k: 31, p: 3, c: 6, f: 0 },
  { n: 'butter or oil', g: 14, k: 102, p: 0, c: 0, f: 12, e: true },
];

/** The one size every photo is sent at. */
export const PHOTO_SIDE = 768;

/**
 * A photo's width and height from its header, without decoding it: JPEG's
 * start-of-frame marker, or PNG's IHDR chunk. Null when it is neither.
 */
export function photoSize(base64: string): { width: number; height: number } | null {
  // the size sits in the first few kilobytes, after any camera metadata
  const bytes = Buffer.from(base64.slice(0, 200_000), 'base64');
  if (bytes.length > 24 && bytes.readUInt32BE(0) === 0x89504e47) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let at = 2;
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) return null;
    if (bytes[at + 1] === 0xff) {
      at++; // padding between markers
      continue;
    }
    const marker = bytes[at + 1]!;
    // start of frame: every SOF except the three that are not (DHT, JPG, DAC)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: bytes.readUInt16BE(at + 5), width: bytes.readUInt16BE(at + 7) };
    }
    at += 2 + bytes.readUInt16BE(at + 2);
  }
  return null;
}

/** Busy, rate-limited or briefly down: worth another try after a wait. */
export class RetryableError extends Error {
  constructor(public status: number) {
    super(`The photo reader answered ${status}.`);
  }
}

export const RETRYABLE = new Set([429, 500, 502, 503, 504, 529]);
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

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The compact reply, as the app's items: names, portions, and the sentence an inferred item needs. */
export function tidy(raw: unknown[]): PlateItem[] {
  const items: PlateItem[] = [];
  for (const [i, candidate] of raw.slice(0, 12).entries()) {
    const parsed = ItemSchema.safeParse(candidate);
    if (!parsed.success) continue;
    const it = parsed.data;
    items.push({
      id: `i${i}`,
      name: capitalise(it.n.trim()),
      grams: Math.round(it.g),
      portion: `About ${Math.round(it.g)} g`,
      calories: Math.round(it.k),
      protein: Math.round(it.p),
      carbs: Math.round(it.c),
      fat: Math.round(it.f),
      ...(it.e ? { note: INFERRED } : {}),
    });
  }
  return items;
}

/** A reply the model wrapped in a code fence is still a reply. */
export function parseJson(text: string): unknown {
  const bare = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  return JSON.parse(bare);
}

/** A timed-out or dropped request is as retryable as a busy answer. */
export async function post(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS) });
  } catch {
    throw new RetryableError(504);
  }
}

async function askGemini(image: string, mediaType: string, model: string, prompt: string): Promise<unknown> {
  const response = await post(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.geminiApiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mediaType, data: image } }, { text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: MAX_OUTPUT_TOKENS, responseMimeType: 'application/json', responseSchema: GEMINI_SCHEMA },
    }),
  });
  if (RETRYABLE.has(response.status)) throw new RetryableError(response.status);
  if (!response.ok) throw new HttpError(502, 'That photo could not be read. Try again.', 'snap_failed');
  const data = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
  return parseJson(text || '{"i":[]}');
}

async function askClaude(image: string, mediaType: string, prompt: string): Promise<unknown> {
  const response = await post('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.anthropicApiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: env.anthropicModel,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
            { type: 'text', text: `${prompt} Reply with only JSON like {"i":[{"n":"white rice","g":150,"k":195,"p":4,"c":42,"f":0}]}` },
          ],
        },
      ],
    }),
  });
  if (RETRYABLE.has(response.status)) throw new RetryableError(response.status);
  if (!response.ok) throw new HttpError(502, 'That photo could not be read. Try again.', 'snap_failed');
  const data = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
  return parseJson(data.content?.find((block) => block.type === 'text')?.text ?? '{"i":[]}');
}

export async function readPlate(image: string, mediaType: string, hint?: string): Promise<Plate> {
  const provider = snapProvider();
  if (!provider) throw new HttpError(503, 'Photo reading is not set up on this server yet.', 'snap_off');
  if (provider === 'sample') return { provider, items: tidy(SAMPLE) };

  // the last two tries go to a steadier model when the newest one stays overloaded
  const model = (n: number) => (n >= 3 && env.geminiFallbackModel ? env.geminiFallbackModel : env.geminiModel);
  let reply: unknown;
  try {
    const prompt = promptFor(hint);
    reply = await withRetries((n) => (provider === 'gemini' ? askGemini(image, mediaType, model(n), prompt) : askClaude(image, mediaType, prompt)));
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
  return { provider, items: parsed.success ? tidy(parsed.data.i) : [] };
}
