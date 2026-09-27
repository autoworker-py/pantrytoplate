/*
 * Reading a receipt. The phone's text recognition returns loose pieces of
 * text with their positions; this rebuilds the printed rows, picks out the
 * item lines, and matches each one against what this person has bought
 * before. Pure functions, so every rule is tested without a camera.
 *
 * Receipts print store shorthand ("BNLS SKNLS CHKN BRST"), so matching leans
 * on how shorthand is made: a word cut short, or its vowels dropped. Anything
 * the rules are unsure of is offered as a suggestion, never added unasked.
 */

export interface TextPiece {
  text: string;
  /** normalised to the photo, origin top left */
  x: number;
  y: number;
  w: number;
  h: number;
  confidence?: number;
}

export interface ParsedLine {
  /** the item as printed, without its price or product codes: "GRK YGRT PLN 32OZ" */
  text: string;
  /** what the memory is keyed on: the words alone, so "BANANAS 2.31 LB" and "BANANAS 1.87 LB" are one line */
  key: string;
  price: string | null;
  /** how many were bought: "3 @ .89" */
  count: number;
  /** a pack size ("32OZ", "24CT") or, when sold by weight, what was weighed ("2.31 LB") */
  measure: { quantity: number; unit: string; byWeight: boolean } | null;
  /** a bag fee, a deposit: skipped unless the person says otherwise */
  fee: boolean;
}

/* ---------- rows ---------- */

/** Pieces whose vertical middles line up are one printed row, read left to right. */
export function toRows(pieces: TextPiece[]): string[] {
  const sorted = pieces.filter((p) => p.text.trim()).sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
  const rows: TextPiece[][] = [];
  for (const piece of sorted) {
    const mid = piece.y + piece.h / 2;
    const row = rows[rows.length - 1];
    if (row) {
      const rowMid = row.reduce((sum, p) => sum + p.y + p.h / 2, 0) / row.length;
      const rowH = row.reduce((sum, p) => sum + p.h, 0) / row.length;
      if (Math.abs(mid - rowMid) < Math.max(rowH, piece.h) * 0.55) {
        row.push(piece);
        continue;
      }
    }
    rows.push([piece]);
  }
  return rows.map((row) => row.sort((a, b) => a.x - b.x).map((p) => p.text.trim()).join('  '));
}

/* ---------- lines ---------- */

const PRICE_AT_END = /(-?\$?\d{0,4}[.,]\d{2})(-?)\s*(?:[A-Z*])?\s*$/;
const NOT_AN_ITEM = /\b(SUB ?TOTAL|TOTAL|TAX|BALANCE|BAL|CHANGE|CASH|VISA|MASTER ?CARD|AMEX|DISCOVER|DEBIT|CREDIT|TEND(ER)?|PAYMENT|SAVINGS|YOU SAVED|SAVED|DISCOUNT|COUPON|REFUND|ITEMS? SOLD|AUTH|APPROV(AL|ED)|ACCOUNT|ACCT|CARD|REWARDS?|POINTS|MEMBER|TIP|AMOUNT|PURCHASE|TERMINAL|CASHIER|THANK|VOID)\b/;
const FEE = /\b(BAG FEE|BAGS?|CARRY ?OUT|DEPOSIT|BTL DEP|CRV)\b/;
const EACH = /\b(\d{1,3})\s*@\s*\$?\d*[.,]\d{2}(\s*\/?\s*EA)?/;
const WEIGHED = /\b(\d+[.,]\d{1,3})\s*(LBS?|KG)\b/;
const SIZE = /\b(\d+(?:[.,]\d+)?)\s*(FL ?OZ|OZ|LBS?|KG|G|ML|LTR|LT|L|GAL|QT|PT|CT|CNT|PK|PACK|EA)\b/;
const UNIT: Record<string, string> = {
  'FL OZ': 'floz', FLOZ: 'floz', OZ: 'oz', LB: 'lb', LBS: 'lb', KG: 'kg', G: 'g', ML: 'ml', LTR: 'l', LT: 'l', L: 'l',
  GAL: 'gallon', QT: 'quart', PT: 'pint', CT: 'count', CNT: 'count', PK: 'count', PACK: 'count', EA: 'count',
};
const UNIT_WORDS = new Set(Object.keys(UNIT).flatMap((u) => u.split(' ')));

const number = (s: string) => Number(s.replace(',', '.'));

/** The words alone, for remembering a line whatever its amount this time. */
export function lineKey(text: string): string {
  return text
    .toUpperCase()
    .split(/[^A-Z0-9&]+/)
    .filter((w) => w && !/\d/.test(w) && !UNIT_WORDS.has(w))
    .join(' ');
}

/** Item lines from printed rows. A row with a count or weight and no price belongs to the item beside it. */
export function parseReceipt(rows: string[]): ParsedLine[] {
  const lines: ParsedLine[] = [];
  let pendingCount: number | null = null;
  let pendingWeight: ParsedLine['measure'] = null;
  let lastWasItem = false;

  for (const raw of rows) {
    const row = raw
      .toUpperCase()
      .replace(/\s+/g, ' ')
      // text recognition reads a monospaced O after digits as a zero: "320Z" is 32OZ
      .replace(/(\d)0Z\b/g, '$1OZ')
      .trim();
    const price = PRICE_AT_END.exec(row);
    const each = EACH.exec(row);
    const weighed = WEIGHED.exec(row);
    const body = price ? row.slice(0, price.index).trim() : row;
    const letters = body.replace(/[^A-Z]/g, '');

    // "2 @ 1.99" or "2.31 LB @ 0.59 /LB" on a row of its own
    if (letters.length < 3 || (!price && (each || weighed))) {
      const count = each ? Number(each[1]) : null;
      const weight = weighed ? { quantity: number(weighed[1]), unit: UNIT[weighed[2]] ?? 'lb', byWeight: true } : null;
      if (!count && !weight) { lastWasItem = false; continue; }
      const previous = lines[lines.length - 1];
      if (lastWasItem && previous && previous.count === 1 && !previous.measure?.byWeight) {
        if (count) previous.count = count;
        if (weight) previous.measure = weight;
      } else {
        pendingCount = count;
        pendingWeight = weight;
      }
      lastWasItem = false;
      continue;
    }

    if (!price || price[2] === '-' || price[1].startsWith('-') || NOT_AN_ITEM.test(body)) {
      lastWasItem = false;
      continue;
    }

    let text = body
      .replace(EACH, ' ')
      .replace(/\b\d{5,}\b/g, ' ') // product codes and PLUs
      .replace(/\s+/g, ' ')
      .trim();
    const weight = WEIGHED.exec(text);
    if (weight) text = text.replace(WEIGHED, ' ').replace(/\s+/g, ' ').trim();
    const size = weight ? null : SIZE.exec(text);
    if (!/[A-Z]{2}/.test(text)) { lastWasItem = false; continue; }

    lines.push({
      text: weight ? `${text} ${weight[1]} ${weight[2]}` : text,
      key: lineKey(text),
      price: price[1].replace('$', '').replace(/^\./, '0.'),
      count: each ? Number(each[1]) : pendingCount ?? 1,
      measure: weight
        ? { quantity: number(weight[1]), unit: UNIT[weight[2]] ?? 'lb', byWeight: true }
        : pendingWeight ?? (size ? { quantity: number(size[1]), unit: UNIT[size[2]] ?? UNIT[size[2].replace(/\s/g, '')] ?? 'count', byWeight: false } : null),
      fee: FEE.test(text),
    });
    pendingCount = null;
    pendingWeight = null;
    lastWasItem = true;
  }
  return lines;
}

/** A long receipt in two photos: drop the lines the second one repeats from the end of the first. */
export function joinPhotos(first: ParsedLine[], second: ParsedLine[]): ParsedLine[] {
  const same = (a: ParsedLine, b: ParsedLine) => a.text === b.text && a.price === b.price;
  for (let overlap = Math.min(first.length, second.length); overlap > 0; overlap--) {
    const tail = first.slice(first.length - overlap);
    if (tail.every((line, i) => same(line, second[i]))) return [...first, ...second.slice(overlap)];
  }
  return [...first, ...second];
}

/* ---------- matching ---------- */

const EXPANSIONS: Record<string, string> = {
  OJ: 'ORANGE JUICE', PB: 'PEANUT BUTTER', EVOO: 'OLIVE OIL', BBQ: 'BARBECUE', HH: 'HALF HALF', 'H&H': 'HALF HALF',
};

/** Words that describe rather than name: they neither prove nor spoil a match. */
const SOFT = new Set([
  'ORGANIC', 'FRESH', 'WHOLE', 'BONELESS', 'SKINLESS', 'LARGE', 'SMALL', 'MEDIUM', 'JUMBO', 'MINI', 'EXTRA', 'LITE', 'LIGHT', 'LOW',
  'FAT', 'NONFAT', 'FREE', 'REDUCED', 'NATURAL', 'PREMIUM', 'CLASSIC', 'ORIGINAL', 'FAMILY', 'VALUE', 'SELECT', 'CHOICE', 'GRADE',
  'REGULAR', 'PLAIN', 'SHARP', 'MILD', 'AGED', 'SLICED', 'SHREDDED', 'CHOPPED', 'DICED', 'FROZEN', 'BRAND', 'STYLE', 'THE', 'OF', 'AND', 'WITH',
  // what kind of thing, when the name also says which one: "Cheddar Cheese" is on a receipt as CHDR
  'CHEESE', 'SAUCE',
]);

/** "EGGS" is eggs, but "BNLS" is boneless: shorthand has no vowels and is left alone. */
function singular(word: string): string {
  if (!/[AEIOU]/.test(word)) return word;
  if (word.length > 4 && word.endsWith('IES')) return `${word.slice(0, -3)}Y`;
  if (word.length > 4 && word.endsWith('OES')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('S') && !word.endsWith('SS')) return word.slice(0, -1);
  return word;
}

function wordsOf(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toUpperCase().split(/[^A-Z&]+/)) {
    if (!raw) continue;
    const expanded = EXPANSIONS[raw];
    if (expanded) out.push(...expanded.split(' '));
    else if (raw.length >= 2 && !UNIT_WORDS.has(raw)) out.push(singular(raw));
  }
  return out;
}

function isSubsequence(short: string, long: string): boolean {
  let i = 0;
  for (const ch of long) if (ch === short[i]) i += 1;
  return i === short.length;
}

/** Does a receipt word stand for this word? Whole, cut short ("SPAGH"), or with its vowels dropped ("YGRT"). */
export function standsFor(receiptWord: string, word: string): boolean {
  if (receiptWord === word) return true;
  if (receiptWord.length < 3 || receiptWord[0] !== word[0]) return false;
  if (word.startsWith(receiptWord)) return true;
  if (receiptWord.length >= word.length * 0.4 && isSubsequence(receiptWord, word)) return true;
  // shorthand plurals: "CHKNS"
  return receiptWord.length > 3 && receiptWord.endsWith('S') && standsFor(receiptWord.slice(0, -1), word);
}

export interface Candidate {
  id: string;
  name: string;
  category: string | null;
}

export interface Match<C extends Candidate> {
  food: C;
  /** sure enough to tick it: every word of the name is on the line, and nothing on the line is left over */
  sure: boolean;
}

/** The food this line most likely is, from things bought before; null when nothing is close. */
export function matchLine<C extends Candidate>(text: string, candidates: C[]): Match<C> | null {
  const printed = wordsOf(text);
  const isSoft = (w: string) => SOFT.has(w) || [...SOFT].some((s) => standsFor(w, s));
  const printedNaming = printed.filter((w) => !isSoft(w));
  const printedKey = printedNaming.filter((w) => w.length >= 3);
  let best: { food: C; named: number; explained: number; size: number } | null = null;

  for (const food of candidates) {
    const all = wordsOf(food.name);
    const key = all.filter((w) => !SOFT.has(w));
    const nameWords = key.length ? key : all;
    if (!nameWords.length) continue;
    // only naming words can name it: "ORG" is organic, not oregano
    const named = nameWords.filter((w) => printedNaming.some((p) => standsFor(p, w))).length / nameWords.length;
    if (named < 0.5) continue;
    const explained = printedKey.length ? printedKey.filter((p) => all.some((w) => standsFor(p, w))).length / printedKey.length : 1;
    const better =
      !best ||
      named + explained > best.named + best.explained + 1e-9 ||
      (Math.abs(named + explained - (best.named + best.explained)) < 1e-9 && nameWords.length > best.size);
    if (better) best = { food, named, explained, size: nameWords.length };
  }
  if (!best) return null;
  return { food: best.food, sure: best.named === 1 && best.explained === 1 };
}
