/*
 * Food, drawn as soft lit objects.
 *
 * Every item in a pantry gets a drawing, including ones nobody planned for: a
 * handful of foods have their own (eggs in a carton, a jug of milk), and
 * everything else is matched to a container by what it is — a jar, a tin, a
 * bottle, a sack, a box, loose produce — coloured from its name. A new food
 * someone types in on day one looks like it belongs on the shelf.
 *
 * Countable things are drawn one by one, so nine eggs look like nine eggs.
 * Packs show how much is left when the amount says so (0.6 bag is a bag 60%
 * full); weighed amounts only claim "plenty" or "running low", because the
 * pantry does not know what the pack weighed when it was full.
 */

export type ArtKind =
  | 'jug' | 'tub' | 'butter' | 'eggs' | 'block' | 'wedge' | 'tray' | 'sliced' | 'leftover' | 'leafy' | 'punnet'
  | 'berries' | 'produce' | 'long' | 'jar' | 'bottle' | 'tin' | 'box' | 'sack' | 'carton' | 'loaf' | 'flat'
  | 'bunch' | 'spice';

export interface ArtSpec {
  kind: ArtKind;
  /** how full, 0..1, for packs whose fill can be shown */
  level: number;
  /** how many, for things drawn one by one */
  n: number;
  /** the food's own colour: contents, flesh, skin */
  color: string;
  /** the packaging's colour: lid, label, cap */
  accent: string;
  /** shape variant for loose produce and trays */
  shape?: 'round' | 'oval' | 'long' | 'curve' | 'bulb' | 'big' | 'pepper' | 'sausage' | 'fillet';
}

export interface ItemLike {
  name: string;
  category: string | null;
  quantity: number;
  unit: string;
  isLowStock?: boolean;
  isLeftover?: boolean;
}

/* ---------- matching a food to a drawing ---------- */

const COUNT_UNITS = new Set(['count', 'slice', 'clove', 'stick', 'piece', 'pieces', 'rasher', 'fillet', 'breast', 'egg', 'serving', 'servings', 'portion']);
const PACK_UNITS = new Set(['bag', 'jar', 'bottle', 'box', 'can', 'tin', 'packet', 'pack', 'package', 'carton', 'tub', 'loaf', 'bunch', 'head', 'punnet', 'gallon', 'l', 'litre', 'quart', 'pint', 'dozen']);

const PALETTE = ['#c8553d', '#d99a3a', '#4f7cae', '#5c8f5b', '#8a5a9e', '#c46c8a', '#3f8f8a', '#b98b4e', '#6b7c8f', '#a33b3b', '#2f6f9f', '#7d8b3a'];
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return Math.abs(h);
}
const pick = (name: string, salt = 0) => PALETTE[(hash(name) + salt) % PALETTE.length];

/** name fragment → [kind, food colour, shape] — first match wins, so the specific come first */
const RULES: Array<[RegExp, ArtKind, string?, ArtSpec['shape']?]> = [
  // names that contain another food's name go first: black pepper is not a pepper
  [/toaster pastr|pop.?tart/, 'box', '#e7a8c0'],
  [/black pepper|white pepper|peppercorn|cayenne|pepper flakes/, 'spice', '#3a332c'],
  [/stock|broth|bouillon/, 'carton', '#d8a24a'],
  [/chopped tomato|tinned tomato|canned tomato|plum tomatoes|tomato puree|tomato paste/, 'tin', '#c8553d'],
  // a paste or purée is a jar, whatever it is made of
  [/\bpaste\b|\bpur[eé]e\b|\bcurd\b/, 'jar', '#b8452f'],
  [/\beggplant|aubergine/, 'long', '#5b3a6b', 'long'],
  [/\beggs?\b|duck egg/, 'eggs', '#f5e9d6'],
  [/coconut milk|condensed|evaporated/, 'tin', '#f4f1ea'],
  [/oat milk|almond milk|soy milk|soya milk/, 'carton', '#f1ece2'],
  [/\bmilk\b|buttermilk/, 'jug', '#ffffff'],
  [/yog(h)?urt|kefir|skyr|fromage frais|custard|creme fraiche|crème fraîche|sour cream/, 'tub', '#f4eedf'],
  [/single cream|double cream|heavy cream|whipping cream|\bcream\b/, 'carton', '#fbf6ea'],
  [/peanut butter|nut butter|almond butter/, 'jar', '#b9803f'],
  [/butter bean/, 'tin', '#e8dfc6'],
  [/\bbutter\b|margarine|ghee|spread/, 'butter', '#f5e4a3'],
  [/parmesan|pecorino|grana|manchego/, 'wedge', '#f1e4bf'],
  [/mozzarella|burrata|ricotta|cottage cheese|mascarpone|cream cheese/, 'tub', '#fbfaf6'],
  [/feta|halloumi|paneer|goat/, 'block', '#f6f3ea'],
  [/cheddar|red leicester|double gloucester/, 'block', '#eba43a'],
  [/cheese|gouda|emmental|gruyere|brie|camembert|edam|jarlsberg/, 'block', '#f2cf6e'],
  [/bacon|pancetta|prosciutto|ham\b|salami|pepperoni|chorizo|gammon|pastrami|turkey slices/, 'sliced', '#c8574c'],
  [/sausage|hot dog|frankfurter|bratwurst/, 'tray', '#c9765f', 'sausage'],
  [/salmon|trout/, 'tray', '#f08a5d', 'fillet'],
  [/\bcod\b|haddock|white fish|pollock|hake|tilapia|sea bass|plaice/, 'tray', '#f3ece2', 'fillet'],
  [/prawn|shrimp|scampi/, 'tray', '#f3a08b', 'round'],
  [/tuna steak|mackerel|sardine fillet/, 'tray', '#b56b5c', 'fillet'],
  [/chicken|turkey|poultry|thigh|drumstick/, 'tray', '#efc4b6'],
  [/steak|beef|mince|lamb|pork|veal|venison|duck|liver|ribs/, 'tray', '#b8453d'],
  [/leftover/, 'leftover', '#8e3d24'],
  [/spinach|kale|lettuce|rocket|arugula|salad|watercress|chard|greens|cavolo|pak choi|bok choy|mixed leaves/, 'leafy', '#5d9a50'],
  [/mushroom|shiitake/, 'punnet', '#c29a73'],
  [/blueberr/, 'berries', '#4a5d9e'],
  [/raspberr|redcurrant/, 'berries', '#c93b54'],
  [/strawberr/, 'berries', '#d8433c'],
  [/blackberr|blackcurrant/, 'berries', '#3a2a44'],
  [/grape/, 'berries', '#7c9a45'],
  [/cherr(y|ies)\b(?!.*tomato)/, 'berries', '#8f1d2c'],
  [/cherry tomato|baby tomato/, 'berries', '#d9432f'],
  [/frozen (mixed )?berr|berries/, 'berries', '#6b3a5e'],
  [/banana|plantain/, 'long', '#f1cf4b', 'curve'],
  [/carrot|parsnip/, 'long', '#ec8a2c', 'long'],
  [/cucumber|courgette|zucchini/, 'long', '#4f7d3b', 'long'],
  [/leek|celery|spring onion|scallion|asparagus|green bean/, 'long', '#7fae55', 'long'],
  [/corn on the cob|sweetcorn cob|corncob|corn cob/, 'long', '#efc94c', 'long'],
  [/chilli|chili|jalape/, 'long', '#c8321f', 'long'],
  [/red pepper|red bell/, 'produce', '#d23a26', 'pepper'],
  [/yellow pepper|yellow bell/, 'produce', '#efc12f', 'pepper'],
  [/green pepper|green bell|bell pepper|pepper\b(?!corn)/, 'produce', '#4f8a3a', 'pepper'],
  [/tomato/, 'produce', '#d9432f', 'round'],
  [/red onion|shallot/, 'produce', '#8a3b5a', 'round'],
  [/onion/, 'produce', '#d9b37a', 'round'],
  [/garlic/, 'produce', '#f1eadb', 'bulb'],
  [/sweet potato/, 'produce', '#b8643a', 'oval'],
  [/potato/, 'produce', '#b58a5c', 'oval'],
  [/lemon/, 'produce', '#f3d23f', 'oval'],
  [/lime/, 'produce', '#7cae3a', 'oval'],
  [/grapefruit|orange|clementine|satsuma|mandarin|tangerine/, 'produce', '#ef8f2b', 'round'],
  [/apple/, 'produce', '#c9372c', 'round'],
  [/pear/, 'produce', '#b9c24a', 'oval'],
  [/peach|nectarine|apricot/, 'produce', '#f2a15a', 'round'],
  [/plum/, 'produce', '#6c2d5a', 'round'],
  [/avocado/, 'produce', '#3e5a2c', 'oval'],
  [/kiwi/, 'produce', '#8d6b3f', 'oval'],
  [/mango|papaya/, 'produce', '#f0b43a', 'oval'],
  [/melon|watermelon|pineapple|pumpkin|squash|butternut|cabbage|cauliflower|broccoli|celeriac/, 'produce', '#6f9a4a', 'big'],
  [/beetroot|beet\b|radish|turnip|swede/, 'produce', '#8e2f4f', 'round'],
  [/ginger|galangal|turmeric root/, 'produce', '#caa066', 'oval'],
  [/coriander|cilantro|parsley|basil|mint|dill|rosemary|thyme|sage|tarragon|chives|oregano leaves/, 'bunch', '#4e8a45'],
  [/bread|loaf|sourdough|rye|brioche|baguette/, 'loaf', '#c98d4a'],
  [/tortilla|wrap|naan|pitta|pita|flatbread/, 'flat', '#e9d3a4'],
  [/bagel|crumpet|english muffin|croissant|bun\b|roll\b|muffin/, 'produce', '#c98d4a', 'round'],
  [/juice/, 'carton', '#e9a23a'],
  [/spaghetti|penne|pasta|macaroni|fusilli|tagliatelle|lasagne|linguine|noodle|orzo|rigatoni/, 'box', '#f0d27a'],
  [/cornflakes|cereal|weetabix|bran|shredded wheat|pop.?tart|toaster pastr|cracker|biscuit|cookie/, 'box', '#e5c07b'],
  [/tea\b|tea bag/, 'box', '#6b4a33'],
  [/rice|oats|porridge|flour|sugar|couscous|quinoa|bulgur|polenta|semolina|lentil|split pea|barley|granola|muesli|breadcrumb|cornflour|cornstarch/, 'sack', '#efe6d2'],
  [/coffee/, 'sack', '#3b2a22'],
  [/chocolate|cocoa|chips\b/, 'sack', '#4a2e22'],
  [/crisps|tortilla chips|popcorn|pretzel/, 'sack', '#e8c15a'],
  [/chopped tomato|tinned tomato|canned tomato|plum tomatoes|black bean|kidney bean|chickpea|cannellini|borlotti|baked bean|tuna\b|sardine|anchov|soup|sweetcorn|coconut cream/, 'tin', '#c8553d'],
  [/olive oil|vegetable oil|sunflower oil|rapeseed|canola|sesame oil|coconut oil|\boil\b/, 'bottle', '#d9b44a'],
  [/vinegar/, 'bottle', '#8a4a3a'],
  [/soy sauce|tamari|fish sauce|worcestershire|oyster sauce/, 'bottle', '#3a2418'],
  [/ketchup|sriracha|hot sauce|chilli sauce|sweet chilli|bbq|barbecue/, 'bottle', '#c0302a'],
  [/maple|syrup|golden syrup|treacle|molasses/, 'bottle', '#a8612a'],
  [/wine|beer|cider|vermouth|sherry/, 'bottle', '#6d2433'],
  [/vanilla|extract|essence/, 'bottle', '#4a2d1c'],
  [/honey/, 'jar', '#e3a52f'],
  [/jam|marmalade|jelly|preserve|curd/, 'jar', '#b3263a'],
  [/mayo|aioli|mustard|pesto|salsa|passata|curry paste|tahini|hummus|houmous|olive|caper|gherkin|pickle|chutney|relish|sauce|nutella|spread/, 'jar', '#c9a24a'],
  [/salt|pepper\b|peppercorn|paprika|cumin|cinnamon|nutmeg|turmeric|coriander seed|ground|dried|chilli flakes|cayenne|garam|curry powder|five spice|allspice|cloves|cardamom|bay lea|oregano|thyme dried|mixed herbs|baking powder|bicarbonate|baking soda|yeast|cream of tartar|gelatin/, 'spice', '#b5652f'],
  [/almond|walnut|cashew|pecan|hazelnut|pistachio|peanut|seed|nut\b|nuts/, 'jar', '#b98b4e'],
];

const BY_CATEGORY: Record<string, [ArtKind, string, ArtSpec['shape']?]> = {
  'Dairy & Eggs': ['tub', '#f4eedf'],
  Cheese: ['block', '#f2cf6e'],
  'Meat & Seafood': ['tray', '#c96a5a'],
  Produce: ['produce', '#6f9a4a', 'round'],
  Fruit: ['produce', '#d9563a', 'round'],
  Herbs: ['bunch', '#4e8a45'],
  Bakery: ['loaf', '#c98d4a'],
  Grains: ['sack', '#efe6d2'],
  Pasta: ['box', '#f0d27a'],
  Legumes: ['sack', '#d9b77c'],
  Baking: ['sack', '#f3ede0'],
  'Canned Goods': ['tin', '#c8553d'],
  Condiments: ['jar', '#c9a24a'],
  Sauces: ['jar', '#b8452f'],
  'Oils & Vinegars': ['bottle', '#d9b44a'],
  Spices: ['spice', '#b5652f'],
  'Nuts & Seeds': ['jar', '#b98b4e'],
  Snacks: ['box', '#e5c07b'],
  Frozen: ['box', '#9cc3e6'],
  Beverages: ['bottle', '#6d8fb0'],
};

export function artFor(item: ItemLike): ArtSpec {
  const name = item.name.toLowerCase();
  let kind: ArtKind = 'jar';
  let color = '#c9a24a';
  let shape: ArtSpec['shape'];

  if (item.isLeftover) {
    kind = 'leftover';
    color = '#8e3d24';
  } else {
    const rule = RULES.find(([pattern]) => pattern.test(name));
    if (rule) {
      [, kind, color = color, shape] = rule;
    } else if (item.category && BY_CATEGORY[item.category]) {
      [kind, color, shape] = BY_CATEGORY[item.category];
      // an unfamiliar tin or box still looks like its own product, not a clone
      if (['tin', 'box', 'sack', 'jar', 'bottle', 'carton'].includes(kind)) color = kind === 'jar' || kind === 'bottle' ? color : pick(name);
    }
  }

  const unit = item.unit.toLowerCase();
  // whatever it is, if it is counted in cans it is a tin on the shelf
  if (unit === 'can' || unit === 'tin') kind = 'tin';
  const q = Math.max(0, item.quantity);
  let n = 1;
  let level = item.isLowStock ? 0.22 : 0.82;
  if (COUNT_UNITS.has(unit)) {
    n = Math.max(1, Math.round(q));
    level = 1;
  } else if (PACK_UNITS.has(unit)) {
    const frac = q - Math.floor(q);
    level = q < 1 ? Math.max(0.08, q) : frac > 0.05 ? frac : 1;
    if (unit === 'dozen') { n = Math.round(q * 12); level = 1; }
  }
  if (kind === 'eggs' && !COUNT_UNITS.has(unit) && unit !== 'dozen') n = 12;
  if (item.isLowStock && COUNT_UNITS.has(unit) === false && level > 0.3) level = 0.22;

  return { kind, level: Math.min(1, level), n, color, accent: pick(name, 3), shape };
}

/* ---------- drawing ---------- */

let seq = 0;
const uid = (p: string) => `${p}${(++seq).toString(36)}`;
const EDGE = 'stroke="rgba(20,22,26,.28)" stroke-width=".8" stroke-linejoin="round"';

function mix(hex: string, to: string, amount: number): string {
  const a = parseInt(hex.slice(1), 16), b = parseInt(to.slice(1), 16);
  const ch = (x: number, shift: number) => (x >> shift) & 255;
  const m = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * amount);
  return `#${((1 << 24) | (m(16) << 16) | (m(8) << 8) | m(0)).toString(16).slice(1)}`;
}
const light = (c: string, a = 0.35) => mix(c, '#ffffff', a);
const dark = (c: string, a = 0.3) => mix(c, '#000000', a);

class Kit {
  defs: string[] = [];
  grad(stops: Array<[number, string, number?]>, dir: 'v' | 'h' | 'd' | 'r' = 'v'): string {
    const id = uid('g');
    const s = stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('');
    if (dir === 'r') this.defs.push(`<radialGradient id="${id}" cx=".38" cy=".3" r=".78">${s}</radialGradient>`);
    else {
      const [x2, y2] = dir === 'h' ? [1, 0] : dir === 'd' ? [1, 1] : [0, 1];
      this.defs.push(`<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${s}</linearGradient>`);
    }
    return `url(#${id})`;
  }
  /** a cylinder's light: bright left of centre, falling away to both edges */
  cyl(c: string): string {
    return this.grad([[0, dark(c, 0.18)], [0.28, light(c, 0.28)], [0.62, c], [1, dark(c, 0.3)]], 'h');
  }
  clip(shape: string): string {
    const id = uid('c');
    this.defs.push(`<clipPath id="${id}">${shape}</clipPath>`);
    return `url(#${id})`;
  }
  shadow(cx: number, cy: number, rx: number, ry: number): string {
    const id = uid('s');
    this.defs.push(`<radialGradient id="${id}"><stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>`);
    return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${id})"/>`;
  }
  out(w: number, h: number, body: string) {
    return { w, h, svg: `<defs>${this.defs.join('')}</defs>${body}` };
  }
}

const hl = (x: number, y: number, w: number, h: number, o = 0.6) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(w, h) / 2}" fill="#fff" opacity="${o}"/>`;
const lvl = (level: number, inner: string) => `<g class="lvl" style="transform:scaleY(${level})">${inner}</g>`;
const gone = (i: number, n: number) => `class="gone-able${i >= n ? ' gone' : ''}" data-i="${i}"`;

type Drawn = { w: number; h: number; svg: string };
const DRAW: Record<ArtKind, (a: ArtSpec) => Drawn> = {
  jug(a) {
    const k = new Kit();
    const body = 'M17 10H29V16H41Q53 16 56 26L58 33V84Q58 92 50 92H12Q4 92 4 84V33Q4 23 12 19L17 16Z';
    const hole = 'M37 22H48Q52 22 52 26V31Q52 35 48 35H37Q34 35 34 31V25Q34 22 37 22Z';
    const cp = k.clip(`<path d="${body}"/>`);
    return k.out(62, 98, `${k.shadow(31, 94, 29, 4)}
      <path d="${body} ${hole}" fill-rule="evenodd" fill="${k.grad([[0, '#d9e1e5'], [0.2, '#fff'], [0.6, '#edf1f3'], [1, '#c3cdd3']], 'h')}" opacity=".85"/>
      <g clip-path="${cp}">${lvl(a.level, `<rect x="0" y="32" width="62" height="62" fill="${k.grad([[0, '#eef2f4'], [0.25, '#fff'], [0.65, '#f7f9fa'], [1, '#dbe2e5']], 'h')}"/><rect x="0" y="32" width="62" height="1.5" fill="#cbd5da"/>`)}</g>
      <path d="${body} ${hole}" fill="none" ${EDGE}/>
      ${hl(8, 30, 5, 54, 0.8)}
      <rect x="15" y="3" width="16" height="9" rx="2.5" fill="${k.grad([[0, light(a.accent, 0.25)], [1, dark(a.accent, 0.2)]])}" ${EDGE}/>`);
  },
  tub(a) {
    const k = new Kit();
    const body = 'M6 13H58L54 50Q53.6 53 50.6 53H13.4Q10.4 53 10 50Z';
    const cp = k.clip(`<path d="${body}"/>`);
    return k.out(64, 58, `${k.shadow(32, 55, 25, 3.5)}
      <path d="${body}" fill="${k.cyl('#f4f6f7')}"/>
      <g clip-path="${cp}"><rect x="0" y="27" width="64" height="12" fill="${k.cyl(a.accent)}"/></g>
      <path d="${body}" fill="none" ${EDGE}/>
      <rect x="3" y="5" width="58" height="10" rx="4" fill="${k.grad([[0, light(a.accent, 0.3)], [1, dark(a.accent, 0.15)]])}" ${EDGE}/>
      ${hl(8, 6.5, 30, 2, 0.5)}${hl(13, 16, 4, 32, 0.65)}`);
  },
  butter(a) {
    const k = new Kit();
    const top = k.grad([[0, light(a.color, 0.45)], [1, light(a.color, 0.15)]]);
    const front = k.grad([[0, a.color], [1, dark(a.color, 0.12)]]);
    const end = k.grad([[0, dark(a.color, 0.14)], [1, dark(a.color, 0.26)]]);
    let s = k.shadow(38, 46, 34, 3);
    const n = a.level < 0.5 ? 1 : Math.min(2, Math.max(2, a.n));
    for (let i = 0; i < 2; i++) {
      const y = 30 - i * 14;
      s += `<g ${gone(i, n)}><path d="M4 ${y}L10 ${y - 5}H72L66 ${y}Z" fill="${top}" ${EDGE}/><rect x="4" y="${y}" width="62" height="12" rx="1" fill="${front}" ${EDGE}/><path d="M66 ${y}L72 ${y - 5}V${y + 7}L66 ${y + 12}Z" fill="${end}" ${EDGE}/><path d="M4 ${y + 5}H66" stroke="#fff" stroke-opacity=".55"/></g>`;
    }
    return k.out(76, 48, s);
  },
  eggs(a) {
    const k = new Kit();
    const front = k.grad([[0, '#fffaf2'], [0.55, '#f1e1c8'], [1, '#d6bd9a']], 'r');
    const back = k.grad([[0, '#f5ecdd'], [0.6, '#e1cdb0'], [1, '#c6aa85']], 'r');
    const n = Math.min(12, a.n);
    // front row first, right to left, the way you would take them
    const order = [5, 4, 3, 2, 1, 0, 11, 10, 9, 8, 7, 6];
    const present = new Set(order.slice(12 - n));
    let b = '', f = '';
    for (let i = 0; i < 6; i++) b += `<ellipse class="gone-able${present.has(6 + i) ? '' : ' gone'}" data-i="${6 + i}" cx="${17 + i * 18}" cy="21" rx="8" ry="10.5" fill="${back}"/>`;
    for (let i = 0; i < 6; i++) f += `<ellipse class="gone-able${present.has(i) ? '' : ' gone'}" data-i="${i}" cx="${11 + i * 19}" cy="28" rx="8.6" ry="11" fill="${front}"/>`;
    return k.out(124, 56, `${k.shadow(62, 52, 58, 4)}${b}${f}
      <path d="M2 31H122L117 52H7Z" fill="${k.grad([[0, '#d3dadc'], [1, '#a9b3b7']])}" ${EDGE}/>
      <path d="M2 31Q7.5 37 13 31T24 31T35 31T46 31T57 31T68 31T79 31T90 31T101 31T112 31T122 31" fill="none" ${EDGE}/>
      <path d="M9 40H115" stroke="#fff" stroke-opacity=".4"/>`);
  },
  block(a) {
    const k = new Kit();
    return k.out(76, 46, `${k.shadow(38, 43, 34, 3)}<g class="lvl lvlx" style="transform:scaleX(${Math.max(0.3, a.level)})">
      <path d="M3 15L12 6H73L64 15Z" fill="${k.grad([[0, light(a.color, 0.3)], [1, light(a.color, 0.08)]])}" ${EDGE}/>
      <rect x="3" y="15" width="61" height="27" fill="${k.grad([[0, a.color], [1, dark(a.color, 0.1)]])}" ${EDGE}/>
      <path d="M64 15L73 6V33L64 42Z" fill="${k.grad([[0, dark(a.color, 0.14)], [1, dark(a.color, 0.26)]])}" ${EDGE}/>
      <path d="M5 17H62" stroke="#fff" stroke-opacity=".4"/></g>`);
  },
  wedge(a) {
    const k = new Kit();
    const dots = [[16, 24], [30, 30], [44, 32], [22, 34], [52, 35]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".9" fill="${dark(a.color, 0.2)}"/>`).join('');
    return k.out(66, 44, `${k.shadow(33, 41, 30, 3)}<g class="lvl lvlx" style="transform:scaleX(${Math.max(0.3, a.level)})">
      <path d="M3 40H63V24Q39 8 7 4Q3 4 3 9Z" fill="${k.grad([[0, light(a.color, 0.25)], [1, dark(a.color, 0.06)]])}" ${EDGE}/>
      <path d="M3 9Q3 4 7 4Q39 8 63 24V30Q39 14 6 10Q3 10 3 13Z" fill="${k.grad([[0, '#dcb772'], [1, '#b58b47']], 'd')}"/>${dots}</g>`);
  },
  tray(a) {
    const k = new Kit();
    const meat = k.grad([[0, light(a.color, 0.45)], [0.6, a.color], [1, dark(a.color, 0.14)]], 'r');
    const n = Math.min(a.shape === 'round' ? 6 : 4, a.n);
    const slots = a.shape === 'round' ? 6 : a.shape === 'sausage' ? 4 : 3;
    let p = '';
    for (let i = 0; i < slots; i++) {
      if (a.shape === 'sausage') {
        const x = 10 + i * 27;
        p += `<rect ${gone(i, n)} x="${x}" y="9" width="22" height="16" rx="8" fill="${meat}" transform="rotate(-8 ${x + 11} 17)"/>`;
      } else if (a.shape === 'round') {
        const x = 16 + i * 18.5;
        p += `<path ${gone(i, n)} d="M${x - 8} 19a8 8 0 1 1 16 0l-4 4h-8z" fill="${meat}"/>`;
      } else if (a.shape === 'fillet') {
        const x = 8 + i * 38;
        p += `<path ${gone(i, n)} d="M${x} 20Q${x + 4} 10 ${x + 18} 10Q${x + 34} 11 ${x + 34} 18Q${x + 30} 26 ${x + 14} 26Q${x} 26 ${x} 20Z" fill="${meat}"/><path d="M${x + 8} 14l3 9M${x + 15} 12l3 12M${x + 22} 12l3 11" stroke="#fff" stroke-opacity=".35" stroke-width="1.1"/>`;
      } else {
        const x = 7 + i * 38;
        p += `<path ${gone(i, n)} d="M${x} 22Q${x} 12 ${x + 15} 11Q${x + 33} 10 ${x + 35} 17Q${x + 33} 27 ${x + 16} 28Q${x} 29 ${x} 22Z" fill="${meat}"/>`;
      }
    }
    return k.out(126, 44, `${k.shadow(63, 41, 58, 3.5)}${p}
      <path d="M2 21H124L118 40H8Z" fill="${k.grad([[0, '#f6f8f9'], [1, '#c5ced2']])}" ${EDGE}/>
      <path d="M5 21.6H121" stroke="#fff" stroke-width="1.4"/>
      <path d="M8 13Q60 6 118 14" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.2"/>`);
  },
  sliced(a) {
    const k = new Kit();
    let r = '';
    const n = Math.min(8, a.n);
    for (let i = 0; i < 8; i++) {
      const y = 20 + i * 4;
      r += `<g ${gone(i, n)}><path d="M10 ${y}q10 -2.2 20 0t20 0t20 0t18 0" fill="none" stroke="${a.color}" stroke-width="3.2"/><path d="M10 ${y - 0.9}q10 -2.2 20 0t20 0t20 0t18 0" fill="none" stroke="${light(a.color, 0.3)}" stroke-width=".9" opacity=".8"/><path d="M10 ${y + 1.7}q10 -2.2 20 0t20 0t20 0t18 0" fill="none" stroke="#fbe4d9" stroke-width="1.1"/></g>`;
    }
    return k.out(98, 62, `${k.shadow(49, 59, 44, 3.5)}
      <rect x="3" y="3" width="92" height="55" rx="5" fill="${k.grad([[0, '#fff'], [1, '#dce3e6']])}" ${EDGE}/>
      <rect x="3" y="3" width="92" height="11" rx="5" fill="${k.grad([[0, light(a.accent, 0.1)], [1, dark(a.accent, 0.2)]])}"/>
      <rect x="8" y="16" width="82" height="38" rx="3" fill="#f8e6dd"/>${r}
      <rect x="8" y="16" width="82" height="38" rx="3" fill="none" stroke="#fff" stroke-opacity=".6"/>${hl(11, 18, 30, 3, 0.6)}`);
  },
  leftover(a) {
    const k = new Kit();
    const cp = k.clip('<rect x="4" y="14" width="58" height="32" rx="6"/>');
    const beans = [[14, 34], [24, 38], [36, 33], [46, 39], [52, 31], [20, 29], [42, 29]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="2.6" ry="1.8" fill="${light(a.color, 0.3)}"/>`).join('');
    return k.out(66, 50, `${k.shadow(33, 47, 30, 3)}
      <g clip-path="${cp}">${lvl(a.level, `<rect x="0" y="18" width="66" height="30" fill="${k.grad([[0, light(a.color, 0.1)], [1, dark(a.color, 0.25)]])}"/>${beans}`)}</g>
      <rect x="4" y="14" width="58" height="32" rx="6" fill="rgba(255,255,255,.3)" ${EDGE}/>
      <rect x="2" y="7" width="62" height="9" rx="3.5" fill="${k.grad([[0, '#eef3f5'], [1, '#c1cbd0']])}" ${EDGE}/>
      <g transform="rotate(-4 33 27)"><rect x="15" y="22" width="36" height="10" rx="1" fill="#f1e5b9"/><path d="M19 27.5q3-2.4 6 0t6 0M34 27h11" stroke="#2a2f33" stroke-width="1.1" fill="none" stroke-linecap="round"/></g>${hl(8, 17, 3.5, 26, 0.55)}`);
  },
  leafy(a) {
    const k = new Kit();
    const shape = 'M7 11Q45 5 83 11L87 67Q45 75 3 67Z';
    const cp = k.clip(`<path d="${shape}"/>`);
    const leaf = k.grad([[0, light(a.color, 0.28)], [1, dark(a.color, 0.28)]], 'd');
    const leaf2 = k.grad([[0, light(a.color, 0.1)], [1, dark(a.color, 0.42)]], 'd');
    const leaves = [[20, 60, -30, 0], [40, 62, 20, 1], [60, 60, -15, 0], [74, 57, 35, 1], [27, 46, 40, 1], [47, 48, -40, 0], [67, 44, 10, 1], [35, 32, -20, 0], [55, 30, 30, 1], [20, 30, 15, 1], [72, 30, -30, 0]];
    return k.out(90, 78, `${k.shadow(45, 74, 40, 3.5)}
      <g clip-path="${cp}">${lvl(a.level, leaves.map(([x, y, r, t]) => `<g transform="rotate(${r} ${x} ${y})"><ellipse cx="${x}" cy="${y}" rx="14" ry="8.5" fill="${t ? leaf : leaf2}"/><path d="M${x - 11} ${y}H${x + 11}" stroke="#b5dca6" stroke-width=".9" opacity=".7"/></g>`).join(''))}</g>
      <path d="${shape}" fill="#fff" fill-opacity=".14" ${EDGE}/>
      <path d="M14 18Q16 44 12 62" stroke="#fff" stroke-opacity=".75" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M7 11Q45 5 83 11" fill="none" stroke="#9aa6ab" stroke-width="4" stroke-dasharray="1.5 2.5"/>`);
  },
  punnet(a) {
    const k = new Kit();
    const cap = k.grad([[0, light(a.color, 0.35)], [0.55, a.color], [1, dark(a.color, 0.3)]], 'r');
    const stem = k.grad([[0, '#fbf6ee'], [1, '#ddd1bf']], 'h');
    const pos = [[58, 14], [16, 22], [36, 18], [56, 21], [76, 18], [26, 27], [46, 26], [66, 27], [86, 25], [10, 26]];
    const n = Math.max(1, Math.round(pos.length * Math.min(1, a.level + 0.1)));
    const caps = pos.map(([x, y], i) => `<g ${gone(i, n)}><rect x="${x - 3}" y="${y - 1}" width="6" height="9" rx="2.5" fill="${stem}"/><path d="M${x - 11} ${y + 1}Q${x - 11} ${y - 10} ${x} ${y - 10}Q${x + 11} ${y - 10} ${x + 11} ${y + 1}Z" fill="${cap}"/><path d="M${x - 9} ${y + 1}H${x + 9}" stroke="${dark(a.color, 0.4)}" stroke-width="1.1" opacity=".7"/></g>`).join('');
    return k.out(98, 54, `${k.shadow(49, 51, 44, 3.5)}${caps}
      <path d="M3 28H95L89 50H9Z" fill="${k.grad([[0, '#5a8bca'], [1, '#2d5890']])}" ${EDGE}/><path d="M4 28.6H94" stroke="#fff" stroke-opacity=".5"/>`);
  },
  berries(a) {
    const k = new Kit();
    const berry = k.grad([[0, light(a.color, 0.4)], [0.6, a.color], [1, dark(a.color, 0.35)]], 'r');
    const count = Math.max(4, Math.round(16 * Math.min(1, a.level + 0.1)));
    let b = '';
    for (let i = 0; i < 16; i++) {
      const x = 12 + (i % 8) * 10.5 + (i >= 8 ? 5 : 0), y = i >= 8 ? 22 : 17;
      b += `<circle ${gone(i, count)} cx="${x}" cy="${y}" r="6" fill="${berry}"/>`;
    }
    return k.out(98, 50, `${k.shadow(49, 47, 44, 3)}${b}
      <path d="M3 24H95L89 46H9Z" fill="${k.grad([[0, 'rgba(255,255,255,.55)'], [1, 'rgba(220,228,232,.45)']])}" ${EDGE}/>
      <path d="M6 30H92M8 36H90M9 42H89" stroke="#fff" stroke-opacity=".35"/>`);
  },
  produce(a) {
    const k = new Kit();
    const skin = k.grad([[0, light(a.color, 0.42)], [0.55, a.color], [1, dark(a.color, 0.32)]], 'r');
    const big = a.shape === 'big';
    const max = big ? 1 : 6;
    const n = Math.min(max, a.n);
    const W = big ? 70 : 104;
    let s = k.shadow(W / 2, 47, W / 2 - 4, 3.5);
    for (let i = 0; i < max; i++) {
      const col = i % 3, row = i >= 3 ? 1 : 0;
      const x = big ? 35 : 20 + col * 32 + (row ? 16 : 0);
      const y = big ? 26 : row ? 22 : 34;
      let shape: string;
      if (big) shape = `<circle cx="35" cy="26" r="20" fill="${skin}"/><path d="M35 6c-2 4-2 6 0 8" stroke="${dark(a.color, 0.4)}" stroke-width="2" fill="none"/>`;
      else if (a.shape === 'oval') shape = `<ellipse cx="${x}" cy="${y}" rx="13" ry="9.5" fill="${skin}"/>`;
      else if (a.shape === 'bulb') shape = `<path d="M${x} ${y - 13}c2 4 11 6 11 14a11 11 0 0 1-22 0c0-8 9-10 11-14Z" fill="${skin}"/><path d="M${x} ${y - 4}v11M${x - 5} ${y - 1}c0 5 2 7 5 8M${x + 5} ${y - 1}c0 5-2 7-5 8" stroke="${dark(a.color, 0.2)}" stroke-width=".8" fill="none"/>`;
      else if (a.shape === 'pepper') shape = `<path d="M${x - 11} ${y - 6}c0-5 5-6 11-6s11 1 11 6c0 7-2 14-5 15-2 1-4-2-6-2s-4 3-6 2c-3-1-5-8-5-15Z" fill="${skin}"/><path d="M${x} ${y - 12}v-4" stroke="#4f7d3b" stroke-width="2.4" stroke-linecap="round"/>`;
      else shape = `<circle cx="${x}" cy="${y}" r="12" fill="${skin}"/><path d="M${x} ${y - 12}c-1 -2 0 -4 2 -5" stroke="#4f7d3b" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
      s += `<g ${gone(i, n)}>${shape}<ellipse cx="${big ? 28 : x - 4}" cy="${big ? 16 : y - 5}" rx="${big ? 6 : 3.5}" ry="${big ? 4 : 2.2}" fill="#fff" opacity=".35"/></g>`;
    }
    return k.out(W, 50, s);
  },
  long(a) {
    const k = new Kit();
    const skin = k.grad([[0, light(a.color, 0.35)], [0.5, a.color], [1, dark(a.color, 0.3)]]);
    const n = Math.min(5, a.n);
    let s = k.shadow(52, 46, 48, 3.5);
    for (let i = 0; i < 5; i++) {
      const y = 38 - i * 6, x = 8 + (i % 2) * 6;
      const body = a.shape === 'curve'
        ? `<path d="M${x} ${y - 4}q40 16 84 -8q-2 9 -8 12q-36 14 -74 2q-3 -2 -2 -6Z" fill="${skin}"/><path d="M${x + 84} ${y - 12}l4 -3" stroke="#5a4a2a" stroke-width="2.4" stroke-linecap="round"/>`
        : `<rect x="${x}" y="${y - 5}" width="84" height="11" rx="5.5" fill="${skin}"/>${a.color === '#ec8a2c' ? `<path d="M${x + 84} ${y}l7 -4M${x + 84} ${y}l7 2" stroke="#5c8f3a" stroke-width="1.8" stroke-linecap="round"/>` : ''}`;
      s += `<g ${gone(i, n)}>${body}</g>`;
    }
    return k.out(104, 50, s);
  },
  jar(a) {
    const k = new Kit();
    const body = 'M9 16Q9 12 13 12H43Q47 12 47 16V58Q47 64 41 64H15Q9 64 9 58Z';
    const cp = k.clip(`<path d="${body}"/>`);
    return k.out(56, 68, `${k.shadow(28, 65, 24, 3)}
      <path d="${body}" fill="rgba(255,255,255,.22)"/>
      <g clip-path="${cp}">${lvl(a.level, `<rect x="0" y="16" width="56" height="50" fill="${k.cyl(a.color)}"/>`)}<rect x="9" y="30" width="38" height="18" fill="${k.grad([[0, '#f6efe0'], [1, '#e2d6bd']])}"/><path d="M14 36h20M14 41h14" stroke="${dark(a.accent, 0.1)}" stroke-width="1.6" stroke-linecap="round" opacity=".7"/></g>
      <path d="${body}" fill="none" ${EDGE}/>
      <rect x="10" y="4" width="36" height="10" rx="3" fill="${k.cyl(a.accent)}" ${EDGE}/>${hl(13, 18, 3.5, 40, 0.55)}`);
  },
  spice(a) {
    const k = new Kit();
    const body = 'M8 16H36V56Q36 60 32 60H12Q8 60 8 56Z';
    const cp = k.clip(`<path d="${body}"/>`);
    return k.out(44, 64, `${k.shadow(22, 61, 18, 2.5)}
      <path d="${body}" fill="rgba(255,255,255,.22)"/>
      <g clip-path="${cp}">${lvl(a.level, `<rect x="0" y="16" width="44" height="46" fill="${k.cyl(a.color)}"/>`)}<rect x="8" y="30" width="28" height="14" fill="#f4ecdc"/></g>
      <path d="${body}" fill="none" ${EDGE}/>
      <rect x="7" y="5" width="30" height="12" rx="2" fill="${k.cyl('#2f3337')}"/>${hl(11, 18, 3, 36, 0.5)}`);
  },
  bottle(a) {
    const k = new Kit();
    const body = 'M19 4H29V16Q29 20 34 24Q40 28 40 36V86Q40 92 34 92H14Q8 92 8 86V36Q8 28 14 24Q19 20 19 16Z';
    const cp = k.clip(`<path d="${body}"/>`);
    return k.out(48, 96, `${k.shadow(24, 93, 20, 3)}
      <path d="${body}" fill="rgba(255,255,255,.2)"/>
      <g clip-path="${cp}">${lvl(a.level, `<rect x="0" y="22" width="48" height="72" fill="${k.cyl(a.color)}"/>`)}<rect x="8" y="50" width="32" height="24" fill="${k.grad([[0, light(a.accent, 0.1)], [1, dark(a.accent, 0.15)]])}"/><path d="M13 58h16M13 64h11" stroke="#fff" stroke-opacity=".7" stroke-width="1.6" stroke-linecap="round"/></g>
      <path d="${body}" fill="none" ${EDGE}/>
      <rect x="17" y="1" width="14" height="8" rx="2" fill="${k.cyl('#2f3337')}"/>${hl(12, 30, 3.5, 54, 0.5)}`);
  },
  tin(a) {
    const k = new Kit();
    return k.out(54, 64, `${k.shadow(27, 61, 24, 3)}
      <rect x="5" y="8" width="44" height="52" rx="4" fill="${k.cyl('#d5dadc')}" ${EDGE}/>
      <rect x="5" y="17" width="44" height="34" fill="${k.cyl(a.color)}"/>
      <path d="M11 29h24M11 36h16" stroke="#fff" stroke-opacity=".75" stroke-width="2" stroke-linecap="round"/>
      <ellipse cx="27" cy="8" rx="22" ry="3.5" fill="${k.grad([[0, '#f2f4f5'], [1, '#aab3b7']])}" ${EDGE}/>
      <path d="M5 13H49M5 55H49" stroke="#8d969b" stroke-width=".8" opacity=".7"/>${hl(10, 18, 3, 32, 0.4)}`);
  },
  box(a) {
    const k = new Kit();
    return k.out(66, 80, `${k.shadow(33, 77, 30, 3)}
      <path d="M8 12L16 6H62L54 12Z" fill="${k.grad([[0, light(a.color, 0.35)], [1, light(a.color, 0.1)]])}" ${EDGE}/>
      <rect x="8" y="12" width="46" height="64" fill="${k.grad([[0, light(a.color, 0.08)], [1, dark(a.color, 0.14)]], 'h')}" ${EDGE}/>
      <path d="M54 12L62 6V70L54 76Z" fill="${k.grad([[0, dark(a.color, 0.22)], [1, dark(a.color, 0.34)]])}" ${EDGE}/>
      <rect x="13" y="24" width="36" height="22" rx="3" fill="#fff" opacity=".86"/>
      <path d="M18 31h24M18 38h16" stroke="${dark(a.color, 0.35)}" stroke-width="2" stroke-linecap="round"/>${hl(11, 14, 3, 56, 0.35)}`);
  },
  sack(a) {
    const k = new Kit();
    const shape = 'M12 14Q12 8 18 8H50Q56 8 56 14L60 72Q60 78 54 78H14Q8 78 8 72Z';
    return k.out(68, 82, `${k.shadow(34, 79, 30, 3)}
      <path d="${shape}" fill="${k.grad([[0, light(a.color, 0.25)], [0.45, a.color], [1, dark(a.color, 0.22)]], 'h')}" ${EDGE}/>
      <path d="M12 16Q34 22 56 16" fill="none" stroke="${dark(a.color, 0.3)}" stroke-width="1.2" opacity=".6"/>
      <path d="M18 8l4 -4h24l4 4" fill="${light(a.color, 0.1)}" ${EDGE}/>
      <rect x="17" y="34" width="34" height="24" rx="3" fill="${k.grad([[0, light(a.accent, 0.12)], [1, dark(a.accent, 0.12)]])}"/>
      <path d="M22 42h22M22 49h14" stroke="#fff" stroke-opacity=".8" stroke-width="2" stroke-linecap="round"/>
      <path d="M16 22Q14 46 14 68" stroke="#fff" stroke-opacity=".3" stroke-width="3" fill="none" stroke-linecap="round"/>`);
  },
  carton(a) {
    const k = new Kit();
    return k.out(52, 92, `${k.shadow(26, 89, 22, 3)}
      <path d="M8 22L18 8H38L44 22Z" fill="${k.grad([[0, '#fbfbfa'], [1, '#dfe4e6']])}" ${EDGE}/>
      <rect x="8" y="22" width="30" height="66" fill="${k.grad([[0, '#ffffff'], [1, '#e3e7e9']], 'h')}" ${EDGE}/>
      <path d="M38 22L44 22V84L38 88Z" fill="${k.grad([[0, '#cfd6d9'], [1, '#b7c0c4']])}" ${EDGE}/>
      <rect x="8" y="46" width="30" height="28" fill="${k.grad([[0, light(a.color, 0.1)], [1, dark(a.color, 0.15)]])}"/>
      <path d="M13 55h20M13 62h13" stroke="#fff" stroke-opacity=".8" stroke-width="1.8" stroke-linecap="round"/>
      <rect x="22" y="10" width="7" height="5" rx="1.5" fill="${a.accent}"/>`);
  },
  loaf(a) {
    const k = new Kit();
    const cp = k.clip('<path d="M6 22Q6 8 22 8H66Q82 8 82 22V50H6Z"/>');
    return k.out(88, 56, `${k.shadow(44, 52, 40, 3.5)}
      <g clip-path="${cp}"><rect x="0" y="0" width="${Math.max(24, 88 * a.level)}" height="56" fill="${k.grad([[0, light(a.color, 0.3)], [0.5, a.color], [1, dark(a.color, 0.28)]])}"/></g>
      <path d="M6 22Q6 8 22 8H66Q82 8 82 22V50H6Z" fill="rgba(255,255,255,.12)" ${EDGE}/>
      <path d="M22 12q4 8 0 16M38 11q4 8 0 16M54 11q4 8 0 16" stroke="${light(a.color, 0.5)}" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".7"/>
      <path d="M78 30h8l-2 8h-6" fill="#e9eef0" ${EDGE}/>`);
  },
  flat(a) {
    const k = new Kit();
    const n = Math.min(4, Math.max(1, Math.round(a.n > 1 ? a.n / 2 : 3)));
    let s = k.shadow(46, 34, 42, 3);
    for (let i = 0; i < 4; i++) s += `<ellipse ${gone(i, n)} cx="46" cy="${30 - i * 3.5}" rx="40" ry="6" fill="${k.grad([[0, light(a.color, 0.3)], [1, dark(a.color, 0.15)]])}" ${EDGE}/>`;
    return k.out(92, 38, `${s}<rect x="4" y="14" width="84" height="20" rx="8" fill="rgba(255,255,255,.18)" ${EDGE}/>`);
  },
  bunch(a) {
    const k = new Kit();
    const leaf = k.grad([[0, light(a.color, 0.3)], [1, dark(a.color, 0.3)]], 'd');
    let s = k.shadow(30, 58, 22, 3);
    const tips = [[16, 12, -30], [26, 6, -10], [36, 8, 12], [44, 16, 30], [20, 22, -40], [40, 24, 38], [30, 16, 0]];
    for (const [x, y, r] of tips) s += `<path d="M30 52Q${(30 + x) / 2} ${(52 + y) / 2 + 6} ${x} ${y}" stroke="#5d8a3e" stroke-width="1.4" fill="none"/><ellipse cx="${x}" cy="${y}" rx="7" ry="4.5" transform="rotate(${r} ${x} ${y})" fill="${leaf}"/>`;
    return k.out(60, 62, `${s}<rect x="25" y="44" width="10" height="7" rx="2" fill="#c9a26a"/>`);
  },
};

export function drawArt(spec: ArtSpec): Drawn {
  return DRAW[spec.kind](spec);
}
