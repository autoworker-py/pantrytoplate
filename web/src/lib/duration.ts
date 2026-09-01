/**
 * Pulls a cook time out of a recipe step.
 *
 * Recipes are written by people, not machines: "cook for thirty-five minutes"
 * is as common as "cook for 35 minutes", and an imported recipe will happily
 * say "an hour and a half". The old matcher only understood digits, so every
 * spelled-out step silently lost its timer button.
 *
 * Returns whole seconds, or null when the step names no duration.
 */

const WORD: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90,
  // a common misspelling, and the articles that stand in for "one"
  fourty: 40, a: 1, an: 1,
};

const UNIT_SECONDS: Record<string, number> = { hour: 3600, minute: 60, second: 1 };

/** Maps every spelling we accept back to a canonical unit key. */
function unitKey(raw: string): 'hour' | 'minute' | 'second' {
  if (/^h/.test(raw)) return 'hour';
  if (/^m/.test(raw)) return 'minute';
  return 'second';
}

const WORD_ALT = Object.keys(WORD).sort((a, b) => b.length - a.length).join('|');
// "thirty-five" and "thirty five" are the same number written two ways
const QUANTITY = `(?:\\d+(?:\\.\\d+)?|(?:${WORD_ALT})(?:[-\\s]+(?:${WORD_ALT}))?)`;
const UNIT = '(hours?|hrs?|minutes?|mins?|seconds?|secs?)';
const RANGE = '(?:\\s*(?:-|–|—|to|or)\\s*(' + QUANTITY + '))?';
const PATTERN = new RegExp(`\\b(${QUANTITY})${RANGE}\\s*${UNIT}\\b`, 'gi');

/** "thirty-five" -> 35, "40" -> 40, "an" -> 1. */
function toNumber(raw: string): number | null {
  const text = raw.trim().toLowerCase();
  if (/^\d/.test(text)) return Number(text);

  const parts = text.split(/[-\s]+/);
  const values = parts.map((part) => WORD[part]);
  if (values.some((value) => value === undefined)) return null;
  if (values.length === 1) return values[0];

  // only "<tens> <ones>" compounds are real: "thirty five" is 35,
  // but "five thirty" is a clock time and not a duration we should invent
  const [tens, ones] = values;
  if (tens >= 20 && tens % 10 === 0 && ones >= 1 && ones <= 9) return tens + ones;
  return null;
}

export function parseDuration(text: string): number | null {
  const source = text.toLowerCase();

  // fractional hours read naturally but tokenise badly, so handle them whole
  if (/\b(?:an?\s+)?hour\s+and\s+a\s+half\b/.test(source)) return 5400;
  if (/\bhalf\s+an?\s+hour\b/.test(source)) return 1800;
  if (/\b(?:a\s+)?quarter\s+of\s+an?\s+hour\b/.test(source)) return 900;

  const matches = [...source.matchAll(PATTERN)];
  if (matches.length === 0) return null;

  let total = 0;
  let previous: number | null = null;
  let previousEnd = -1;

  for (const match of matches) {
    const [whole, low, high, rawUnit] = match;
    const unit = unitKey(rawUnit);
    const seconds = UNIT_SECONDS[unit];

    // a range means "check it at the earliest, it may need the longest" —
    // time the upper bound so the timer never cuts the cook short
    const value = toNumber(high ?? low ?? '');
    if (value === null) continue;

    if (previous === null) {
      total = value * seconds;
      previous = seconds;
      previousEnd = (match.index ?? 0) + whole.length;
      continue;
    }

    // "1 hour 30 minutes" is one duration in two parts; "bake 20 minutes,
    // rest 5 minutes" is two separate steps that must not be added together.
    // The parts of a single duration descend in size and sit next to each other.
    const gap = source.slice(previousEnd, match.index ?? 0);
    const adjacent = /^[\s,]*(and\s*)?$/.test(gap);
    if (seconds >= previous || !adjacent) break;

    total += value * seconds;
    previous = seconds;
    previousEnd = (match.index ?? 0) + whole.length;
  }

  return total > 0 ? Math.round(total) : null;
}

/** "1:30:00" for hours, "9:05" below an hour. */
export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** How the timer button describes itself: "Start 35 minute timer". */
export function describeDuration(totalSeconds: number): string {
  if (totalSeconds % 3600 === 0) {
    const hours = totalSeconds / 3600;
    return `${hours} hour`;
  }
  if (totalSeconds >= 3600) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.round((totalSeconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }
  if (totalSeconds % 60 === 0) return `${totalSeconds / 60} minute`;
  return `${totalSeconds} second`;
}
