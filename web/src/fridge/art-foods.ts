/*
 * Foods drawn as themselves.
 *
 * art.ts draws any food as the container it comes in, coloured from its name,
 * so something typed in on day one still looks at home on the shelf. The
 * default ingredients deserve better: broccoli should look like broccoli, not
 * a green ball, and rice like rice, not the same sack as flour. A rule in
 * art.ts picks one of these through the spec's `shape`; the kind it keeps
 * decides where it sits (produce in the drawer, meat on a tray), so the
 * shelves lay out as before. Counted foods still show how many are left.
 */
import type { ArtSpec } from './art';
import { EDGE, Kit, dark, gone, hl, light, lvl, mix, type Drawn } from './art-kit';

type One = (k: Kit, x: number, y: number, a: ArtSpec, i: number) => string;

/* ---------- shared touches ---------- */

/** a round thing lit from the upper left */
const ball = (k: Kit, c: string) => k.grad([[0, light(c, 0.42)], [0.55, c], [1, dark(c, 0.32)]], 'r');
/** a thing lying on its side: light along the top, shade underneath */
const lying = (k: Kit, c: string) => k.grad([[0, light(c, 0.32)], [0.5, c], [1, dark(c, 0.3)]]);
/** a flat printed face, a little darker toward its far edge */
const face = (k: Kit, c: string) => k.grad([[0, light(c, 0.1)], [1, dark(c, 0.14)]], 'h');
const shine = (x: number, y: number, rx: number, ry: number, o = 0.35) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#fff" opacity="${o}"/>`;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** The same scatter every time for the same seed: textures must not shift between renders. */
function scatter(count: number, seed: number, x0: number, y0: number, w: number, h: number): Array<[number, number]> {
  let s = seed * 9301 + 49297;
  const next = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  return Array.from({ length: count }, () => [r1(x0 + next() * w), r1(y0 + next() * h)] as [number, number]);
}
/** points inside a circle, for textures that must stay on a round thing */
function disc(count: number, seed: number, cx: number, cy: number, r: number): Array<[number, number]> {
  return scatter(count * 2, seed, cx - r, cy - r, r * 2, r * 2).filter(([x, y]) => (x - cx) ** 2 + (y - cy) ** 2 < r * r).slice(0, count);
}
const dots = (pts: Array<[number, number]>, rad: number, fill: string, o = 1) => pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${rad}" fill="${fill}" opacity="${o}"/>`).join('');
/** a tomato's or strawberry's green star */
const calyx = (x: number, y: number, s = 1) =>
  [0, 72, 144, 216, 288].map((r) => `<ellipse cx="${x}" cy="${r1(y - 3 * s)}" rx="${r1(1.2 * s)}" ry="${r1(3 * s)}" transform="rotate(${r} ${x} ${y})" fill="#4f8a3a"/>`).join('') +
  `<path d="M${x} ${y}v${r1(-3 * s)}" stroke="#3f6f2e" stroke-width="${r1(1.4 * s)}" stroke-linecap="round"/>`;
const label = (x: number, y: number, w: number, ink: string) => `<path d="M${x} ${y}h${w}M${x} ${y + 6}h${Math.round(w * 0.62)}" stroke="${ink}" stroke-width="1.8" stroke-linecap="round"/>`;

/* ---------- layouts ---------- */

/** Up to six of a small thing, three behind and three in front, as produce sits in a drawer. */
function loose(a: ArtSpec, one: One): Drawn {
  const k = new Kit();
  const n = Math.min(6, a.n);
  let back = '', front = '';
  for (let i = 0; i < 6; i++) {
    const row = i >= 3 ? 1 : 0, col = i % 3;
    const g = `<g ${gone(i, n)}>${one(k, 20 + col * 32 + (row ? 16 : 0), row ? 22 : 34, a, i)}</g>`;
    if (row) back += g; else front += g;
  }
  return k.out(104, 50, `${k.shadow(52, 47, 48, 3.5)}${back}${front}`);
}

/** Up to five long things, piled. */
function piled(a: ArtSpec, one: One): Drawn {
  const k = new Kit();
  const n = Math.min(5, a.n);
  let s = k.shadow(52, 46, 48, 3.5);
  for (let i = 0; i < 5; i++) s += `<g ${gone(i, n)}>${one(k, 8 + (i % 2) * 6, 38 - i * 6, a, i)}</g>`;
  return k.out(104, 50, s);
}

/** The butcher's clear-lidded tray, set lower than art.ts's so what is in it shows. */
function onTray(a: ArtSpec, slots: number, piece: (k: Kit, i: number) => string): Drawn {
  const k = new Kit();
  const n = Math.min(slots, a.n);
  let p = '';
  for (let i = 0; i < slots; i++) p += `<g ${gone(i, n)}>${piece(k, i)}</g>`;
  return k.out(126, 44, `${k.shadow(63, 41, 58, 3.5)}${p}
    <path d="M2 25H124L119 40H7Z" fill="${k.grad([[0, '#f6f8f9'], [1, '#c5ced2']])}" ${EDGE}/>
    <path d="M5 25.6H121" stroke="#fff" stroke-width="1.4"/>
    <path d="M8 8Q60 1 118 9" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1.2"/>`);
}

/** The deli pack sliced things come in. */
function pack(a: ArtSpec, inner: (k: Kit) => string): Drawn {
  const k = new Kit();
  return k.out(98, 62, `${k.shadow(49, 59, 44, 3.5)}
    <rect x="3" y="3" width="92" height="55" rx="5" fill="${k.grad([[0, '#fff'], [1, '#dce3e6']])}" ${EDGE}/>
    <rect x="3" y="3" width="92" height="11" rx="5" fill="${k.grad([[0, light(a.accent, 0.1)], [1, dark(a.accent, 0.2)]])}"/>
    <rect x="8" y="16" width="82" height="38" rx="3" fill="#f8ece6"/>${inner(k)}
    <rect x="8" y="16" width="82" height="38" rx="3" fill="none" stroke="#fff" stroke-opacity=".6"/>${hl(11, 18, 30, 3, 0.6)}`);
}

/** A glass jar that shows what is in it, filled to the level left. */
function glassJar(a: ArtSpec, contents: (k: Kit) => string, lid = a.accent, bg = 'rgba(255,255,255,.18)'): Drawn {
  const k = new Kit();
  const body = 'M9 16Q9 12 13 12H43Q47 12 47 16V58Q47 64 41 64H15Q9 64 9 58Z';
  const cp = k.clip(`<path d="${body}"/>`);
  return k.out(56, 68, `${k.shadow(28, 65, 24, 3)}<path d="${body}" fill="${bg}"/>
    <g clip-path="${cp}">${lvl(a.level, contents(k))}</g>
    <path d="${body}" fill="rgba(255,255,255,.1)" ${EDGE}/>
    <rect x="10" y="4" width="36" height="10" rx="3" fill="${k.cyl(lid)}" ${EDGE}/>${hl(13, 18, 3.5, 40, 0.5)}`);
}
/** a jar's worth of small pieces, packed in rows */
const packed = (piece: (x: number, y: number, j: number) => string, cols = 5, rows = 7, x0 = 13, y0 = 18, dx = 7.2, dy = 6.6) => {
  let s = '';
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) s += piece(r1(x0 + c * dx + (r % 2 ? dx / 2 : 0)), r1(y0 + r * dy), r * cols + c);
  return s;
};

/** A packet with a window, for pasta shapes, dried fruit and the like. */
function windowBag(a: ArtSpec, piece: (x: number, y: number, j: number) => string, fill = light(a.color, 0.35)): Drawn {
  const k = new Kit();
  const bag = 'M11 10H57L60 78Q60 82 56 82H12Q8 82 8 78Z';
  const cp = k.clip('<rect x="14" y="38" width="40" height="38" rx="5"/>');
  let crimp = 'M11 10';
  for (let x = 14; x <= 57; x += 3) crimp += `L${x} ${x % 6 === 2 ? 5 : 10}`;
  return k.out(68, 86, `${k.shadow(34, 83, 28, 3)}
    <path d="${bag}" fill="${face(k, a.accent)}" ${EDGE}/>
    <g clip-path="${cp}"><rect x="14" y="38" width="40" height="38" fill="${fill}"/>${packed(piece, 5, 6, 17, 42, 8.4, 6.6)}</g>
    <rect x="14" y="38" width="40" height="38" rx="5" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.4"/>
    <path d="${crimp}" fill="none" stroke="${dark(a.accent, 0.25)}" stroke-width="1"/>
    <rect x="16" y="16" width="36" height="14" rx="3" fill="#fff" opacity=".88"/>${label(20, 21, 24, dark(a.accent, 0.35))}
    ${hl(12, 14, 2.5, 60, 0.35)}`);
}

/** A frosted freezer bag with a window. */
function freezerBag(a: ArtSpec, piece: (x: number, y: number, j: number) => string, fill: string): Drawn {
  const k = new Kit();
  const bag = 'M10 11Q34 7 58 11Q61 45 58 79Q34 83 10 79Q7 45 10 11Z';
  const cp = k.clip('<rect x="15" y="34" width="38" height="36" rx="10"/>');
  const frost = dots(scatter(22, 31, 12, 12, 44, 64), 0.8, '#fff', 0.7);
  return k.out(68, 88, `${k.shadow(34, 85, 28, 3)}
    <path d="${bag}" fill="${k.grad([[0, '#eef6fc'], [0.5, '#d4e6f5'], [1, '#aecbe4']], 'h')}" ${EDGE}/>
    <path d="M10 11Q34 7 58 11L58 20Q34 16 10 20Z" fill="${face(k, a.accent)}"/>
    <path d="M34 22v10M29.7 24.5l8.6 5M29.7 29.5l8.6-5" stroke="${dark(a.accent, 0.2)}" stroke-width="1.3" stroke-linecap="round"/>
    <g clip-path="${cp}"><rect x="15" y="34" width="38" height="36" fill="${fill}"/>${packed(piece, 4, 5, 20, 38, 9, 7.2)}</g>
    <rect x="15" y="34" width="38" height="36" rx="10" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="1.4"/>${frost}`);
}

/* ---------- small produce, drawn one at a time ---------- */

const onion = (stripe: string): One => (k, x, y, a) => `<path d="M${x} ${y - 14}c1.5 4 11.5 6.5 11.5 14.5a11.5 11 0 0 1-23 0c0-8 10-10.5 11.5-14.5z" fill="${ball(k, a.color)}"/>
  <path d="M${x - 5} ${y - 7}q-2.5 9 1 17M${x + 5} ${y - 7}q2.5 9-1 17M${x} ${y - 8}v18" stroke="${stripe}" stroke-width=".8" fill="none" opacity=".55"/>
  <path d="M${x} ${y - 14}q-.5-3 1.5-5" stroke="${dark(a.color, 0.15)}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
  <path d="M${x - 2.5} ${y + 11}l-1 2M${x} ${y + 11}v2.5M${x + 2.5} ${y + 11}l1 2" stroke="#8a6a3a" stroke-width=".8"/>${shine(x - 5, y - 1, 2.6, 3.6, 0.3)}`;

const citrus: One = (k, x, y, a, i) => `<g transform="rotate(${[-14, 10, -4, 16, -10, 6][i]} ${x} ${y})">
  <path d="M${x - 12} ${y + 1}q1-10 12-10q10.5 0 12 9q-1 10-12 10q-11 0-12-9z" fill="${ball(k, a.color)}"/>
  <path d="M${x - 12} ${y + 1}l-1.4.2M${x + 12} ${y}l1.4-.3" stroke="${dark(a.color, 0.08)}" stroke-width="2.4" stroke-linecap="round"/>
  ${dots(scatter(8, 3, x - 9, y - 5, 18, 10), 0.6, dark(a.color, 0.22), 0.45)}${shine(x - 5, y - 4, 4, 2.2)}</g>`;

const SMALL: Record<string, One> = {
  apple: (k, x, y, a) => `<path d="M${x} ${y - 8}c-3-3.5-12.5-3-12.5 5.5 0 7.5 5.5 13.5 12.5 13.5s12.5-6 12.5-13.5c0-8.5-9.5-9-12.5-5.5z" fill="${ball(k, a.color)}"/>
    <path d="M${x} ${y - 7.5}q-.3-4 1.8-6.5" stroke="#6b4a2a" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <path d="M${x + 1.5} ${y - 11}q5-5 9-1.5q-4.5 3.5-9 1.5z" fill="#5d9a45"/>${shine(x - 5, y - 1, 3, 4.5, 0.3)}`,
  orange: (k, x, y, a) => `<circle cx="${x}" cy="${y}" r="12" fill="${ball(k, a.color)}"/>${dots(disc(10, 7, x, y, 10), 0.6, dark(a.color, 0.2), 0.45)}
    <circle cx="${x + 1}" cy="${y - 9.5}" r="1.3" fill="#6f7d2a"/>${shine(x - 4, y - 5, 3.5, 2.4)}`,
  grapefruit: (k, x, y, a) => `<circle cx="${x}" cy="${y - 1}" r="13.5" fill="${ball(k, a.color)}"/><circle cx="${x + 4}" cy="${y + 2}" r="9" fill="#d9504a" opacity=".2"/>
    ${dots(disc(12, 5, x, y - 1, 11), 0.6, dark(a.color, 0.2), 0.45)}${shine(x - 5, y - 6, 4, 2.6)}`,
  lemon: citrus,
  pear: (k, x, y, a) => `<path d="M${x} ${y - 13}c3 0 4.5 3.5 4.5 7 0 3 6.5 5.5 6.5 12.5 0 6-5 9.5-11 9.5s-11-3.5-11-9.5c0-7 6.5-9.5 6.5-12.5 0-3.5 1.5-7 4.5-7z" fill="${ball(k, a.color)}"/>
    <ellipse cx="${x + 4}" cy="${y + 8}" rx="5" ry="4" fill="#d9703a" opacity=".22"/>
    <path d="M${x} ${y - 13}q.3-3.5 2.6-5" stroke="#6b4a2a" stroke-width="1.5" fill="none" stroke-linecap="round"/>${shine(x - 4, y + 2, 2.5, 4, 0.3)}`,
  peach: (k, x, y, a) => `<circle cx="${x}" cy="${y}" r="12" fill="${ball(k, a.color)}"/><circle cx="${x + 4}" cy="${y - 3}" r="8" fill="#e0583a" opacity=".35"/>
    <path d="M${x - 1} ${y - 11}q-4.5 9 .5 21" stroke="${dark(a.color, 0.25)}" stroke-width="1" fill="none" opacity=".55"/>
    <path d="M${x} ${y - 12}q3-5 8-4q-3 4.5-8 4z" fill="#5d9a45"/>${shine(x - 5, y - 4, 3, 2.2, 0.3)}`,
  plum: (k, x, y, a) => `<ellipse cx="${x}" cy="${y}" rx="11" ry="12" fill="${ball(k, a.color)}"/><ellipse cx="${x - 3}" cy="${y - 2}" rx="6" ry="7" fill="#fff" opacity=".1"/>
    <path d="M${x + 1} ${y - 11}q4 9 0 22" stroke="${dark(a.color, 0.3)}" stroke-width="1" fill="none" opacity=".5"/>
    <path d="M${x} ${y - 12}v-3" stroke="#6b4a2a" stroke-width="1.4" stroke-linecap="round"/>${shine(x - 4, y - 5, 2.5, 2, 0.35)}`,
  mango: (k, x, y) => `<path d="M${x - 14} ${y + 3}c-1-8 7-13 15-12 7 1 12 6 11 12-1 6-8 9-14 8-6-1-11-3-12-8z" fill="${k.grad([[0, '#d9432f'], [0.45, '#f0a03a'], [1, '#8fb04a']], 'd')}"/>
    <circle cx="${x + 9}" cy="${y - 7}" r="1.4" fill="#6b4a2a"/>${shine(x - 6, y - 3, 3.5, 2.2, 0.3)}`,
  kiwi: (k, x, y, a, i) => i === 0
    ? `<ellipse cx="${x}" cy="${y}" rx="12" ry="10" fill="#7a5a33"/><ellipse cx="${x}" cy="${y}" rx="10.4" ry="8.6" fill="${k.grad([[0, '#c9e07a'], [0.6, '#8fbf3e'], [1, '#6a9a2a']], 'r')}"/>
       <ellipse cx="${x}" cy="${y}" rx="3.6" ry="2.6" fill="#f1f4d2"/>${dots(Array.from({ length: 12 }, (_, j) => [r1(x + 6 * Math.cos((j / 12) * 6.283)), r1(y + 4.8 * Math.sin((j / 12) * 6.283))] as [number, number]), 0.7, '#1d1a14')}`
    : `<ellipse cx="${x}" cy="${y}" rx="12.5" ry="10" fill="${ball(k, a.color)}"/>${dots(scatter(10, 9, x - 9, y - 6, 18, 12), 0.5, light(a.color, 0.3), 0.6)}${shine(x - 4, y - 4, 3, 1.8, 0.2)}`,
  avocado: (k, x, y, a, i) => {
    const body = `M${x} ${y - 12}c4 0 6 4 6.5 7 .5 3 5.5 5 5.5 11 0 6-5 9-12 9s-12-3-12-9c0-6 5-8 5.5-11 .5-3 2.5-7 6.5-7z`;
    return i === 0
      ? `<path d="${body}" fill="#2f4a22"/><path d="${body}" transform="translate(${x} ${y + 3}) scale(.84) translate(${-x} ${-y - 3})" fill="${k.grad([[0, '#eef0a0'], [0.55, '#d6e27a'], [1, '#9cc45a']], 'r')}"/>
         <circle cx="${x}" cy="${y + 6}" r="5.2" fill="${k.grad([[0, '#b07a4a'], [1, '#6e4424']], 'r')}"/>${shine(x - 1.8, y + 4, 1.6, 1.2, 0.5)}`
      : `<path d="${body}" fill="${ball(k, a.color)}"/>${dots(scatter(9, 4, x - 8, y - 4, 16, 14), 0.7, light(a.color, 0.25), 0.6)}${shine(x - 4, y, 2.5, 3.5, 0.2)}`;
  },
  tomato: (k, x, y, a) => `<ellipse cx="${x}" cy="${y}" rx="12.5" ry="11" fill="${ball(k, a.color)}"/>
    <path d="M${x - 6} ${y - 9}q-3.5 9 0 18M${x + 6} ${y - 9}q3.5 9 0 18" stroke="${dark(a.color, 0.22)}" stroke-width=".8" fill="none" opacity=".4"/>
    ${calyx(x, y - 10)}${shine(x - 5, y - 4, 3.2, 2.2)}`,
  onion: onion('#f3dcae'),
  redonion: onion('#dca9c2'),
  shallot: (k, x, y, a) => `<path d="M${x} ${y - 12}c1 3.5 8 5.5 8 13a8 9.5 0 0 1-16 0c0-7.5 7-9.5 8-13z" fill="${ball(k, a.color)}"/>
    <path d="M${x - 3} ${y - 5}q-2 8 1 14M${x + 3} ${y - 5}q2 8-1 14" stroke="#f0c9b0" stroke-width=".7" fill="none" opacity=".6"/>
    <path d="M${x} ${y - 12}q-.5-3 1.2-4.5" stroke="${dark(a.color, 0.2)}" stroke-width="1.4" fill="none" stroke-linecap="round"/>${shine(x - 3, y, 1.8, 3, 0.3)}`,
  garlic: (k, x, y, a) => `<path d="M${x} ${y - 14}c2 4 11.5 6 11.5 14a11.5 10.5 0 0 1-23 0c0-8 9.5-10 11.5-14z" fill="${ball(k, a.color)}"/>
    <path d="M${x} ${y - 6}v16.5M${x - 6} ${y - 3}c-1.5 6 .5 10.5 6 13M${x + 6} ${y - 3}c1.5 6-.5 10.5-6 13" stroke="#cdbfa5" stroke-width=".9" fill="none"/>
    <path d="M${x - 8.5} ${y + 1}q1.5 5 6 7.5" stroke="#b98aa8" stroke-width="1.1" fill="none" opacity=".45"/>
    <path d="M${x} ${y - 14}q-1-3.5 1.2-6" stroke="#dcd0b8" stroke-width="2" fill="none" stroke-linecap="round"/>${shine(x - 5, y - 1, 2.5, 3.5, 0.4)}`,
  potato: (k, x, y, a) => `<path d="M${x - 13} ${y - 1}c0-6 5-9.5 12-9 8 .5 14 3 14 9.5 0 6-6 9-13 8.5-7-.5-13-2.5-13-9z" fill="${ball(k, a.color)}"/>
    <path d="M${x - 6} ${y - 3}q1.5-1.2 3 0M${x + 4} ${y + 3}q1.5-1.2 3 0M${x + 6} ${y - 4}q1-1 2 0M${x - 2} ${y + 4}q1-1 2 0" stroke="${dark(a.color, 0.4)}" stroke-width=".9" fill="none" stroke-linecap="round"/>
    ${dots(scatter(7, 12, x - 10, y - 6, 22, 12), 0.5, dark(a.color, 0.3), 0.4)}${shine(x - 5, y - 4, 3.5, 2, 0.25)}`,
  sweetpotato: (k, x, y, a) => `<path d="M${x - 16} ${y + 1}q4-9 16-9q10 0 15 5q-2 7-15 8q-12 1-16-4z" fill="${ball(k, a.color)}"/>
    <path d="M${x + 14.5} ${y - 3}l4-1.8M${x - 16} ${y + 1}l-2.5 1" stroke="${dark(a.color, 0.25)}" stroke-width="1.3" stroke-linecap="round"/>
    <path d="M${x - 8} ${y - 5}q-1 5 1 9M${x + 2} ${y - 7}q-1 6 1 11" stroke="${dark(a.color, 0.28)}" stroke-width=".8" fill="none" opacity=".5"/>${shine(x - 6, y - 3, 4, 1.8, 0.25)}`,
  ginger: (k, x, y, a) => `<path d="M${x - 13} ${y + 5}c-3-5 1-9 5-7 0-5 6-8 9-4 2-4 8-3 8 2 4 0 6 5 2 8-3 2-8 2-12 2-5 0-10 1-12-1z" fill="${ball(k, a.color)}"/>
    <path d="M${x - 7} ${y - 1}q2 2 0 5M${x + 1} ${y - 5}q2 3 0 7M${x + 8} ${y - 2}q2 2 0 5" stroke="${dark(a.color, 0.28)}" stroke-width=".8" fill="none" opacity=".55"/>${shine(x - 6, y + 1, 2.5, 1.5, 0.3)}`,
  beetroot: (k, x, y, a) => `<path d="M${x} ${y - 9}q-3-6-7-9M${x} ${y - 9}q0-7 1-11M${x} ${y - 9}q4-5 8-7" stroke="#c0415f" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    <ellipse cx="${x - 8}" cy="${y - 19}" rx="3.4" ry="2" transform="rotate(-35 ${x - 8} ${y - 19})" fill="#4f8a3a"/><ellipse cx="${x + 1}" cy="${y - 21}" rx="2" ry="3.4" fill="#4f8a3a"/>
    <ellipse cx="${x + 9}" cy="${y - 17}" rx="3.4" ry="2" transform="rotate(25 ${x + 9} ${y - 17})" fill="#4f8a3a"/>
    <path d="M${x} ${y - 10}c7 0 11 4 11 9.5 0 6-5 9.5-11 10.5-6-1-11-4.5-11-10.5 0-5.5 4-9.5 11-9.5z" fill="${ball(k, a.color)}"/>
    <path d="M${x} ${y + 10}q1.2 4-.8 7" stroke="${dark(a.color, 0.1)}" stroke-width="1.2" fill="none"/>${shine(x - 4, y - 3, 2.6, 3, 0.25)}`,
  radish: (k, x, y) => `<path d="M${x} ${y - 8}q-4-7-9-6.5q2.5 5.5 9 6.5zM${x} ${y - 8}q3.5-7.5 9-7q-2.5 6-9 7z" fill="#5d9a45"/>
    <circle cx="${x}" cy="${y}" r="8.5" fill="${k.grad([[0, '#e8566a'], [0.55, '#d0304a'], [0.82, '#f1c9d0'], [1, '#fbeef0']])}"/>
    <path d="M${x} ${y + 8.5}q.6 3.5-.6 6.5" stroke="#e7d2d6" stroke-width="1" fill="none"/>${shine(x - 3, y - 3, 2, 1.6, 0.4)}`,
  sprouts: (k, x, y, a) => `<circle cx="${x}" cy="${y}" r="9" fill="${ball(k, a.color)}"/>
    <path d="M${x - 8} ${y - 2}q4-6 9-7M${x - 7} ${y + 4}q6-2 9-10M${x + 2} ${y + 8}q4-4 5-12" stroke="${dark(a.color, 0.28)}" stroke-width=".9" fill="none" opacity=".6"/>
    <circle cx="${x}" cy="${y + 8}" r="1.6" fill="${light(a.color, 0.5)}"/>${shine(x - 3, y - 4, 2.2, 1.6, 0.35)}`,
  fig: (k, x, y, a) => `<path d="M${x} ${y - 13}c1 4 11 6 11 13a11 10.5 0 0 1-22 0c0-7 10-9 11-13z" fill="${ball(k, a.color)}"/>
    <path d="M${x} ${y - 13}q.5-3 2.5-4" stroke="#6b5a2a" stroke-width="1.5" fill="none" stroke-linecap="round"/>${shine(x - 4, y - 1, 2.5, 3.5, 0.25)}`,
  pomegranate: (k, x, y, a) => `<circle cx="${x}" cy="${y + 1}" r="12" fill="${ball(k, a.color)}"/>
    <path d="M${x - 4} ${y - 10}l1.5-4 1.5 2.5 1-3.5 1 3.5 1.5-2.5 1.5 4z" fill="${dark(a.color, 0.2)}"/>${shine(x - 4, y - 3, 3, 2.2, 0.3)}`,
  falafel: (k, x, y, a) => `<circle cx="${x}" cy="${y + 2}" r="9" fill="${ball(k, a.color)}"/>${dots(disc(8, x, x, y + 2, 7), 0.8, '#6f8a3a', 0.6)}${dots(disc(6, y, x, y + 2, 7), 0.6, light(a.color, 0.4), 0.7)}`,
  // bakery, sold by the piece
  bagel: (k, x, y, a) => `<path d="M${x - 14} ${y}a14 9 0 1 0 28 0a14 9 0 1 0-28 0zM${x - 5} ${y - 1}a5 2.6 0 1 0 10 0a5 2.6 0 1 0-10 0z" fill-rule="evenodd" fill="${ball(k, a.color)}"/>
    ${scatter(9, 2, x - 12, y - 7, 24, 12).filter(([px, py]) => ((px - x) / 14) ** 2 + ((py - y) / 9) ** 2 < 1 && ((px - x) / 6) ** 2 + ((py - y + 1) / 3.4) ** 2 > 1).map(([px, py], j) => `<ellipse cx="${px}" cy="${py}" rx=".9" ry=".5" transform="rotate(${j * 40} ${px} ${py})" fill="#f7ecd0"/>`).join('')}${shine(x - 7, y - 4, 3.5, 1.6, 0.3)}`,
  bun: (k, x, y, a) => `<path d="M${x - 14} ${y + 5}h28v3q0 3-3 3h-22q-3 0-3-3z" fill="${dark(a.color, 0.05)}"/>
    <path d="M${x - 14} ${y + 4}c0-9 6-14 14-14s14 5 14 14z" fill="${ball(k, a.color)}"/>
    ${[[-7, -2], [-2, -6], [4, -4], [8, 0], [0, 0], [-5, 2]].map(([dx, dy], j) => `<ellipse cx="${x + dx}" cy="${y + dy}" rx="1.1" ry=".55" transform="rotate(${j * 50} ${x + dx} ${y + dy})" fill="#f8eed4"/>`).join('')}${shine(x - 5, y - 5, 4, 2, 0.3)}`,
  muffin: (k, x, y, a) => `<path d="M${x - 13} ${y - 2}v6q0 5 13 5t13-5v-6" fill="${dark(a.color, 0.1)}"/><ellipse cx="${x}" cy="${y - 2}" rx="13" ry="5.5" fill="${ball(k, a.color)}"/>
    ${dots(scatter(10, 6, x - 10, y - 5, 20, 6), 0.6, '#f7ecd0', 0.9)}`,
  crumpet: (_k, x, y, a) => `<path d="M${x - 13} ${y - 2}v6q0 5 13 5t13-5v-6" fill="${dark(a.color, 0.12)}"/><ellipse cx="${x}" cy="${y - 2}" rx="13" ry="5.5" fill="${light(a.color, 0.2)}"/>
    ${dots(scatter(12, 8, x - 10, y - 5, 20, 6), 0.8, dark(a.color, 0.35), 0.8)}`,
};

/* ---------- long produce ---------- */

const LONG: Record<string, One> = {
  carrot: (k, x, y, a) => `<path d="M${x + 4} ${y}l-6-5M${x + 4} ${y}l-7-1M${x + 4} ${y}l-6 4" stroke="#5c8f3a" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M${x + 8} ${y - 5.5}Q${x + 60} ${y - 4} ${x + 88} ${y}Q${x + 60} ${y + 4} ${x + 8} ${y + 5.5}Q${x + 4} ${y + 5.5} ${x + 4} ${y}Q${x + 4} ${y - 5.5} ${x + 8} ${y - 5.5}Z" fill="${lying(k, a.color)}"/>
    <path d="M${x + 22} ${y - 4}v2.6M${x + 36} ${y - 3.4}v2.4M${x + 48} ${y + 1}v2.2M${x + 62} ${y - 2.4}v2" stroke="${dark(a.color, 0.25)}" stroke-width=".8" opacity=".6"/>`,
  parsnip: (k, x, y, a) => `<path d="M${x + 8} ${y - 6}Q${x + 60} ${y - 4} ${x + 88} ${y}Q${x + 60} ${y + 4} ${x + 8} ${y + 6}Q${x + 4} ${y + 6} ${x + 4} ${y}Q${x + 4} ${y - 6} ${x + 8} ${y - 6}Z" fill="${lying(k, a.color)}"/>
    <ellipse cx="${x + 5}" cy="${y}" rx="1.8" ry="4.6" fill="#b8a27a"/>
    <path d="M${x + 24} ${y - 4}v2.6M${x + 40} ${y + 1}v2.4M${x + 56} ${y - 3}v2.2" stroke="${dark(a.color, 0.3)}" stroke-width=".8" opacity=".6"/>`,
  cucumber: (k, x, y, a) => `<rect x="${x}" y="${y - 6}" width="86" height="12" rx="6" fill="${lying(k, a.color)}"/>
    ${[0, 1, 2, 3, 4, 5, 6].map((j) => `<circle cx="${x + 10 + j * 11}" cy="${y - 2 + (j % 2) * 3.5}" r=".9" fill="${light(a.color, 0.5)}" opacity=".75"/>`).join('')}
    <path d="M${x + 6} ${y - 3}H${x + 78}" stroke="${light(a.color, 0.45)}" stroke-width="1.4" opacity=".45" stroke-linecap="round"/>`,
  courgette: (k, x, y, a) => `<path d="M${x + 6} ${y - 5}Q${x + 50} ${y - 7} ${x + 84} ${y - 6.5}Q${x + 90} ${y} ${x + 84} ${y + 6.5}Q${x + 50} ${y + 7} ${x + 6} ${y + 5}Q${x + 2} ${y} ${x + 6} ${y - 5}Z" fill="${lying(k, a.color)}"/>
    <path d="M${x + 10} ${y - 2}H${x + 80}M${x + 10} ${y + 2}H${x + 80}" stroke="${light(a.color, 0.4)}" stroke-width=".9" stroke-dasharray="3 5" opacity=".6"/>
    <path d="M${x + 4} ${y}h-4" stroke="#7a8a3a" stroke-width="3" stroke-linecap="round"/>`,
  aubergine: (k, x, y, a) => `<path d="M${x + 14} ${y - 5}Q${x + 40} ${y - 9} ${x + 64} ${y - 8}Q${x + 86} ${y - 6} ${x + 86} ${y + 1}Q${x + 86} ${y + 9} ${x + 64} ${y + 9}Q${x + 40} ${y + 9} ${x + 14} ${y + 5}Q${x + 9} ${y + 3} ${x + 9} ${y}Q${x + 9} ${y - 3} ${x + 14} ${y - 5}Z" fill="${lying(k, a.color)}"/>
    <path d="M${x + 7} ${y - 5}q5-2 11 1l-3 2 4 2-4 2 3 2q-6 3-11 1z" fill="#5c8f3a"/><path d="M${x + 7} ${y}h-6" stroke="#5c8f3a" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M${x + 30} ${y - 5}Q${x + 55} ${y - 7} ${x + 78} ${y - 4}" stroke="#fff" stroke-opacity=".35" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
  banana: (k, x, y, a) => `<path d="M${x + 4} ${y - 6}q38 18 80-8q2 1 1 4q-6 10-24 14q-30 7-56-5q-3-2-1-5z" fill="${lying(k, a.color)}"/>
    <path d="M${x + 10} ${y - 2}q30 12 70-8" stroke="${dark(a.color, 0.14)}" stroke-width=".8" fill="none" opacity=".6"/>
    <path d="M${x + 84} ${y - 14}l3.5-4" stroke="#6b5a2a" stroke-width="2.6" stroke-linecap="round"/><circle cx="${x + 4.5}" cy="${y - 5}" r="1.5" fill="#4a3a1a"/>`,
  celery: (k, x, y, a) => `<rect x="${x}" y="${y - 4.5}" width="74" height="9" rx="3" fill="${lying(k, a.color)}"/>
    <path d="M${x + 3} ${y - 1.5}H${x + 72}M${x + 3} ${y + 1.5}H${x + 72}" stroke="${dark(a.color, 0.14)}" stroke-width=".8" opacity=".6"/>
    <path d="M${x + 73} ${y}l5-6 3 3 3-4 3 5-4 2 4 4-6 1-2 4-4-4z" fill="#5d9a45"/>`,
  leek: (k, x, y) => `<rect x="${x}" y="${y - 5.5}" width="76" height="11" rx="5.5" fill="${k.grad([[0, '#f4f2e6'], [0.42, '#e7efcf'], [0.6, '#9cc46a'], [1, '#3f7a3a']], 'h')}"/>
    <rect x="${x}" y="${y - 5.5}" width="76" height="11" rx="5.5" fill="${k.grad([[0, '#fff', 0.35], [0.5, '#fff', 0], [1, '#000', 0.15]])}"/>
    <path d="M${x + 74} ${y - 3.5}l12-6M${x + 74} ${y}h13M${x + 74} ${y + 3.5}l12 5" stroke="#3f7a3a" stroke-width="3" stroke-linecap="round"/>
    <path d="M${x} ${y - 2}l-3-1M${x} ${y}h-3.5M${x} ${y + 2}l-3 1" stroke="#cfc3a8" stroke-width=".8"/>`,
  springonion: (k, x, y) => `<rect x="${x + 22}" y="${y - 2.2}" width="66" height="4.4" rx="2.2" fill="${lying(k, '#5d9a45')}"/>
    <path d="M${x + 2} ${y - 3}q12-1 24 .8v4.4q-12 1.8-24 .8q-3-3 0-6z" fill="${lying(k, '#f1efe2')}"/>
    <path d="M${x + 1} ${y - 1}l-3-1M${x + 1} ${y + 1}l-3 1" stroke="#cfc3a8" stroke-width=".7"/>`,
  asparagus: (k, x, y, a) => `<rect x="${x}" y="${y - 2.8}" width="80" height="5.6" rx="2.8" fill="${lying(k, a.color)}"/>
    <path d="M${x + 78} ${y - 3.4}q9 .4 10 3.4q-1 3-10 3.4z" fill="${dark(a.color, 0.12)}"/>
    <path d="M${x + 60} ${y - 2}l2 1.6M${x + 68} ${y + 2}l2-1.6M${x + 50} ${y + 2}l2-1.6" stroke="${dark(a.color, 0.28)}" stroke-width=".8"/>
    <rect x="${x}" y="${y - 2.8}" width="6" height="5.6" rx="2" fill="${light(a.color, 0.35)}"/>`,
  greenbean: (_k, x, y, a) => `<path d="M${x} ${y + 1}Q${x + 42} ${y - 5} ${x + 86} ${y + 1}" stroke="${a.color}" stroke-width="4.2" fill="none" stroke-linecap="round"/>
    <path d="M${x} ${y}Q${x + 42} ${y - 6} ${x + 86} ${y}" stroke="${light(a.color, 0.35)}" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".7"/>`,
  corn: (k, x, y, a) => {
    let kernels = '';
    for (let c = 0; c < 10; c++) for (let r = 0; r < 3; r++) kernels += `<rect x="${r1(x + 20 + c * 5.8)}" y="${r1(y - 5.2 + r * 3.6)}" width="4.8" height="3.1" rx="1.3" fill="${light(a.color, 0.18)}" stroke="${dark(a.color, 0.18)}" stroke-width=".4"/>`;
    return `<rect x="${x + 16}" y="${y - 6}" width="64" height="12" rx="6" fill="${lying(k, a.color)}"/>${kernels}
      <path d="M${x + 20} ${y - 6}q-11-3-18 2q7 1.5 18 2zM${x + 20} ${y + 6}q-11 3-18-2q7-1.5 18-2z" fill="#b8cf8a"/><rect x="${x}" y="${y - 2}" width="8" height="4" rx="1" fill="#a8bf7a"/>`;
  },
  chilli: (k, x, y, a) => `<path d="M${x + 20} ${y - 4}q30-3 56 2q6 2 9 5.5q-4 .5-9-1q-26-3-56 2q-3-4 0-8.5z" fill="${lying(k, a.color)}"/>
    <path d="M${x + 14} ${y - 4.5}q3-1 6.5 0v8.5q-3.5 1-6.5 0z" fill="#4f7d3b"/><path d="M${x + 14} ${y}q-6-1-9-5" stroke="#4f7d3b" stroke-width="1.8" fill="none" stroke-linecap="round"/>`,
  jalapeno: (k, x, y, a) => `<path d="M${x + 22} ${y - 5.5}q22-2 34 2q7 3 6 5q-2 3-8 3q-14 2-32-1q-3-4 0-9z" fill="${lying(k, a.color)}"/>
    <path d="M${x + 16} ${y - 5.5}q3-1 7 0v9.5q-3.5 1-7 0z" fill="#3f6f2e"/><path d="M${x + 16} ${y - 1}q-6-1-9-5" stroke="#3f6f2e" stroke-width="1.8" fill="none" stroke-linecap="round"/>`,
  peapod: (k, x, y, a) => `<path d="M${x + 6} ${y + 1}Q${x + 46} ${y - 12} ${x + 86} ${y - 1}Q${x + 46} ${y + 10} ${x + 6} ${y + 1}Z" fill="${lying(k, a.color)}"/>
    ${[0, 1, 2, 3, 4].map((j) => `<circle cx="${x + 26 + j * 10}" cy="${y - 2.5}" r="3" fill="${light(a.color, 0.2)}" opacity=".8"/>`).join('')}
    <path d="M${x + 6} ${y + 1}l-4 1" stroke="#6b8a3a" stroke-width="1.5" stroke-linecap="round"/>`,
};

/* ---------- whole things, one at a time ---------- */

const WHOLE: Record<string, (a: ArtSpec) => Drawn> = {
  broccoli(a) {
    const k = new Kit();
    const floret = ball(k, a.color);
    const heads: Array<[number, number, number]> = [[18, 26, 9], [28, 17, 10], [41, 15, 10.5], [53, 23, 9.5], [36, 27, 9], [25, 31, 7], [47, 31, 7.5]];
    return k.out(70, 52, `${k.shadow(35, 49, 20, 3)}
      <path d="M30 33h11l3 15q-8.5 3-17 0z" fill="${k.grad([[0, '#c6dc9a'], [1, '#8fb85e']], 'h')}"/><path d="M33 36l-7-5M38 36l7-5" stroke="#a9cc78" stroke-width="3" stroke-linecap="round"/>
      ${heads.map(([x, y, r], j) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${floret}"/>${dots(disc(5, j + 1, x, y, r * 0.7), 0.9, dark(a.color, 0.35), 0.55)}`).join('')}${shine(30, 12, 5, 3, 0.2)}`);
  },
  cauliflower(a) {
    const k = new Kit();
    const leaf = k.grad([[0, '#8fbf5e'], [1, '#4f7d3b']], 'd');
    const curd = k.grad([[0, '#fffdf4'], [0.6, a.color], [1, dark(a.color, 0.14)]], 'r');
    const heads: Array<[number, number, number]> = [[20, 24, 9], [31, 17, 10], [44, 17, 10], [53, 26, 8.5], [37, 27, 10], [25, 32, 8], [48, 33, 8]];
    return k.out(70, 52, `${k.shadow(35, 49, 26, 3)}
      <path d="M6 44q4-20 20-18q-6 10-4 22z" fill="${leaf}"/><path d="M64 44q-4-20-20-18q6 10 4 22z" fill="${leaf}"/>
      ${heads.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${curd}"/><path d="M${x - r * 0.5} ${y}q${r * 0.5}-${r * 0.5} ${r} 0" stroke="${dark(a.color, 0.12)}" stroke-width=".8" fill="none"/>`).join('')}
      <path d="M18 48q17-12 34 0z" fill="${leaf}"/>`);
  },
  cabbage(a) {
    const k = new Kit();
    return k.out(70, 52, `${k.shadow(35, 49, 24, 3)}<circle cx="35" cy="27" r="21" fill="${ball(k, a.color)}"/>
      <path d="M15 34q-4-18 12-26q-5 10-4 30z" fill="${light(a.color, 0.12)}" opacity=".85"/><path d="M55 34q4-18-12-26q5 10 4 30z" fill="${dark(a.color, 0.05)}" opacity=".85"/>
      <path d="M35 47q-2-14 6-31M35 47q-8-10-13-27M35 47q8-8 15-19" stroke="${light(a.color, 0.5)}" stroke-width="1.2" fill="none" opacity=".75"/>${shine(27, 16, 5, 3, 0.25)}`);
  },
  lettuce(a) {
    const k = new Kit();
    const outer = k.grad([[0, light(a.color, 0.15)], [1, dark(a.color, 0.2)]], 'd');
    const inner = k.grad([[0, '#e2f2b0'], [1, light(a.color, 0.2)]], 'd');
    return k.out(70, 54, `${k.shadow(35, 51, 22, 3)}
      <path d="M35 50c-12-3-20-16-18-32 1-9 7-15 12-15q-2 26 6 47z" fill="${outer}"/><path d="M35 50c12-3 20-16 18-32-1-9-7-15-12-15q2 26-6 47z" fill="${outer}"/>
      <path d="M35 50c-7-4-11-16-9-30 1-8 5-13 9-14 4 1 8 6 9 14 2 14-2 26-9 30z" fill="${inner}"/>
      <path d="M35 48V10M35 30l-6-6M35 38l6-7M35 22l5-5" stroke="#f4f9e0" stroke-width="1" fill="none" opacity=".8"/>`);
  },
  pineapple(a) {
    const k = new Kit();
    const leaf = k.grad([[0, '#8fbf5e'], [1, '#3f6f2e']]);
    const cp = k.clip('<ellipse cx="25" cy="37" rx="15" ry="16.5"/>');
    let hatch = '';
    for (let i = -3; i <= 6; i++) hatch += `<path d="M${i * 7} 20l30 34M${i * 7 + 30} 20l-30 34" stroke="${dark(a.color, 0.35)}" stroke-width=".9" opacity=".6"/>`;
    const leaves = [[-11, -14], [-6, -19], [0, -22], [6, -19], [11, -14], [-8, -8], [8, -8]].map(([dx, dy]) => `<path d="M25 22Q${25 + dx * 0.4 - 2} ${22 + dy * 0.5} ${25 + dx} ${22 + dy}Q${25 + dx * 0.4 + 2} ${22 + dy * 0.5} 25 22z" fill="${leaf}"/>`).join('');
    return k.out(50, 56, `${k.shadow(25, 53, 16, 2.5)}${leaves}<ellipse cx="25" cy="37" rx="15" ry="16.5" fill="${ball(k, a.color)}"/><g clip-path="${cp}">${hatch}</g>${shine(19, 30, 3, 5, 0.25)}`);
  },
  watermelon(a) {
    const k = new Kit();
    const cp = k.clip('<ellipse cx="32" cy="26" rx="28" ry="19"/>');
    let stripes = '';
    for (let i = 0; i < 6; i++) stripes += `<path d="M${8 + i * 10} 6q4 10 0 20t0 20" stroke="${dark(a.color, 0.4)}" stroke-width="3.2" fill="none" opacity=".7"/>`;
    return k.out(72, 52, `${k.shadow(36, 49, 32, 3)}<ellipse cx="32" cy="26" rx="28" ry="19" fill="${ball(k, a.color)}"/><g clip-path="${cp}">${stripes}</g>
      <path d="M40 48a14 14 0 0 1 28 0z" fill="${dark(a.color, 0.1)}"/><path d="M42 48a12 12 0 0 1 24 0z" fill="#eef0d6"/><path d="M43.8 48a10.2 10.2 0 0 1 20.4 0z" fill="${k.grad([[0, '#f25a5f'], [1, '#d8343f']])}"/>
      ${[[49, 43], [54, 41], [59, 43], [54, 45.5]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx=".9" ry="1.4" fill="#1d1a14"/>`).join('')}${shine(22, 16, 6, 3, 0.2)}`);
  },
  melon(a) {
    const k = new Kit();
    const cp = k.clip('<circle cx="30" cy="26" r="20"/>');
    let net = '';
    for (let i = 0; i < 8; i++) net += `<path d="M${6 + i * 6} 4q-6 22 4 44M${6 + i * 6} 48q6-22-4-44" stroke="#f3ead0" stroke-width=".9" fill="none" opacity=".6"/>`;
    return k.out(70, 52, `${k.shadow(35, 49, 30, 3)}<circle cx="30" cy="26" r="20" fill="${ball(k, a.color)}"/><g clip-path="${cp}">${net}</g>
      <path d="M40 46q8-14 26-12q-2 12-26 12z" fill="#9cbf6a"/><path d="M42 45q8-11 22-10q-3 9-22 10z" fill="${k.grad([[0, '#f8b36a'], [1, '#ee8a3a']])}"/>${shine(22, 16, 5, 3, 0.25)}`);
  },
  pumpkin(a) {
    const k = new Kit();
    const side = k.grad([[0, light(a.color, 0.2)], [0.6, a.color], [1, dark(a.color, 0.38)]], 'r');
    return k.out(70, 52, `${k.shadow(35, 49, 28, 3)}
      <ellipse cx="22" cy="30" rx="14" ry="17" fill="${side}"/><ellipse cx="48" cy="30" rx="14" ry="17" fill="${side}"/><ellipse cx="35" cy="30" rx="12" ry="18" fill="${ball(k, a.color)}"/>
      <path d="M33 13q0-6 4-9l2.5 1.5q-3 3-3 7.5z" fill="#6b5a2a"/><path d="M38 7q6-4 8 .5-1 4-5 2" stroke="#6b8a3a" stroke-width="1" fill="none"/>${shine(30, 20, 3, 6, 0.25)}`);
  },
  butternut(a) {
    const k = new Kit();
    return k.out(72, 50, `${k.shadow(36, 47, 32, 3)}
      <path d="M20 17C28 17 30 23 36 23H56Q64 23 64 30.5Q64 38 56 38H36C30 38 28 44 20 44C12 44 6 38 6 30.5C6 23 12 17 20 17Z" fill="${lying(k, a.color)}"/>
      <path d="M64 30.5h5" stroke="#7a5a2a" stroke-width="3" stroke-linecap="round"/><ellipse cx="11" cy="30.5" rx="1.5" ry="2.5" fill="${dark(a.color, 0.3)}"/>${shine(18, 23, 6, 2, 0.3)}`);
  },
  celeriac(a) {
    const k = new Kit();
    return k.out(70, 52, `${k.shadow(35, 49, 22, 3)}
      <path d="M24 38q-4 5-9 6M30 41q-2 5-5 8M40 41q2 5 6 7M46 37q5 4 9 4" stroke="${dark(a.color, 0.2)}" stroke-width="1.2" fill="none"/>
      <path d="M32 11v-6M36 10v-7M40 11l2.5-5.5" stroke="#7fa65a" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M35 9c10 0 18 7 18 17 0 9-7 15-18 15s-18-6-18-15c0-10 8-17 18-17z" fill="${ball(k, a.color)}"/>
      ${dots(scatter(10, 14, 22, 14, 26, 22), 1.2, dark(a.color, 0.15), 0.5)}${shine(28, 18, 4, 3, 0.25)}`);
  },

  /* clusters and punnets */
  strawberries(a) {
    const k = new Kit();
    const berry = ball(k, a.color);
    const pos: Array<[number, number]> = [[14, 16], [30, 13], [46, 16], [62, 13], [78, 16], [22, 22], [38, 21], [54, 22], [70, 21], [86, 22]];
    const count = Math.max(4, Math.round(pos.length * Math.min(1, a.level + 0.1)));
    const one = (x: number, y: number) => `<path d="M${x} ${y + 8}c-5-3-7.5-7-7.5-10.5 0-3 3-4.5 7.5-4.5s7.5 1.5 7.5 4.5c0 3.5-2.5 7.5-7.5 10.5z" fill="${berry}"/>
      ${[[-3, -2], [2, -1], [-1, 2], [3, 3], [-3.5, 3]].map(([dx, dy]) => `<ellipse cx="${x + dx}" cy="${y + dy}" rx=".5" ry=".8" fill="#f7e27a"/>`).join('')}
      <path d="M${x - 5.5} ${y - 6}l2.5 1.5 3-3 3 3 2.5-1.5-1.5 3h-8z" fill="#4f8a3a"/>`;
    return k.out(98, 50, `${k.shadow(49, 47, 44, 3)}${pos.map(([x, y], i) => `<g ${gone(i, count)}>${one(x, y)}</g>`).join('')}
      <path d="M3 26H95L89 46H9Z" fill="${k.grad([[0, 'rgba(255,255,255,.5)'], [1, 'rgba(220,228,232,.42)']])}" ${EDGE}/>
      <path d="M6 32H92M8 38H90M9 43H89" stroke="#fff" stroke-opacity=".35"/>`);
  },
  grapes(a) {
    const k = new Kit();
    const g = ball(k, a.color);
    const bunch = (cx: number, top: number) => {
      let s = `<path d="M${cx} ${top - 3}v-6q4-3 8-1" stroke="#6b5a2a" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M${cx + 2} ${top - 8}q7-5 12 0q-6 4-12 0z" fill="#5d9a45"/>`;
      [5, 4, 3, 2, 1].forEach((count, row) => {
        for (let j = 0; j < count; j++) s += `<circle cx="${r1(cx + (j - (count - 1) / 2) * 8.4)}" cy="${r1(top + row * 7.4)}" r="5.2" fill="${g}"/>`;
      });
      return s;
    };
    return k.out(98, 52, `${k.shadow(49, 49, 40, 3)}${bunch(28, 14)}${bunch(68, 16)}`);
  },
  cherries(a) {
    const k = new Kit();
    const c = ball(k, a.color);
    const pair = (x: number, y: number) => `<path d="M${x - 4} ${y - 4}q2-9 7-13M${x + 6} ${y - 2}q-1-10-3-15" stroke="#5a6a2a" stroke-width="1.2" fill="none"/>
      <circle cx="${x - 4}" cy="${y}" r="6" fill="${c}"/><circle cx="${x + 6}" cy="${y + 2}" r="6" fill="${c}"/>${shine(x - 6, y - 2, 1.6, 1.2, 0.45)}${shine(x + 4, y, 1.6, 1.2, 0.45)}
      <path d="M${x + 3} ${y - 17}q5-3 9 0q-5 3-9 0z" fill="#5d9a45"/>`;
    return k.out(98, 50, `${k.shadow(49, 47, 42, 3)}${pair(20, 30)}${pair(48, 34)}${pair(76, 30)}`);
  },
  vinetomatoes(a) {
    const k = new Kit();
    const t = ball(k, a.color);
    const hang: Array<[number, number]> = [[16, 30], [30, 34], [44, 29], [58, 34], [72, 30], [86, 34]];
    return k.out(100, 50, `${k.shadow(50, 47, 44, 3)}<path d="M6 14Q50 4 94 16" stroke="#4f7d3b" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      ${hang.map(([x, y]) => `<path d="M${x} ${y - 7}q0-6 ${x < 50 ? 2 : -2}-12" stroke="#4f7d3b" stroke-width="1.2" fill="none"/><circle cx="${x}" cy="${y}" r="7" fill="${t}"/>${calyx(x, y - 6, 0.7)}${shine(x - 2.5, y - 2.5, 1.8, 1.3, 0.4)}`).join('')}`);
  },

  /* meat and fish */
  steak(a) {
    return onTray(a, 2, (k, i) => {
      const x = 8 + i * 58;
      return `<path d="M${x} 17q0-10 16-11q22-1 32 3q8 3 6 10q-2 7-20 8q-26 2-34-10z" fill="${k.grad([[0, light(a.color, 0.25)], [0.6, a.color], [1, dark(a.color, 0.2)]], 'r')}"/>
        <path d="M${x + 5} 8q18-5 34-1q8 2 11 7" stroke="#f5e8d8" stroke-width="3.4" fill="none" stroke-linecap="round"/>
        <path d="M${x + 12} 15q8-2 14 3M${x + 30} 13q6 3 12 1M${x + 20} 21q8 1 14-2" stroke="#f0c8bc" stroke-width=".9" fill="none" opacity=".7"/>`;
    });
  },
  breast(a) {
    return onTray(a, 2, (k, i) => {
      const x = 10 + i * 56;
      return `<path d="M${x} 18q0-12 18-13q22-1 30 6q4 6-4 11q-8 5-24 6q-18 1-20-10z" fill="${k.grad([[0, light(a.color, 0.4)], [0.6, a.color], [1, dark(a.color, 0.12)]], 'r')}"/>
        <path d="M${x + 12} 10q10 4 16 12M${x + 24} 8q10 4 16 11M${x + 36} 8q6 3 10 8" stroke="#fff" stroke-opacity=".35" stroke-width="1" fill="none"/>`;
    });
  },
  drumstick(a) {
    return onTray(a, 4, (k, i) => {
      const x = 6 + i * 29;
      return `<path d="M${x + 16} 12l7-3" stroke="#f4efe4" stroke-width="3.6" stroke-linecap="round"/><circle cx="${x + 24.5}" cy="7.5" r="2.5" fill="#f4efe4"/><circle cx="${x + 25.5}" cy="10.5" r="2.3" fill="#f4efe4"/>
        <path d="M${x} 18q0-10 11-10q8 0 10 5q-1 8-11 9q-10 1-10-4z" fill="${k.grad([[0, light(a.color, 0.3)], [0.6, a.color], [1, dark(a.color, 0.18)]], 'r')}"/>`;
    });
  },
  wings(a) {
    return onTray(a, 4, (k, i) => {
      const x = 8 + i * 29;
      const fill = k.grad([[0, light(a.color, 0.3)], [0.6, a.color], [1, dark(a.color, 0.18)]], 'r');
      return `<path d="M${x} 20q2-10 10-11l6 4q-4 3-5 8q-6 4-11-1z" fill="${fill}"/><path d="M${x + 15} 12q6-6 12-3q-1 7-8 9z" fill="${fill}"/>`;
    });
  },
  mince(a) {
    return onTray(a, 1, (k) => {
      const mound = 'M10 27q2-18 26-20q26-3 54 0q24 3 26 20z';
      const cp = k.clip(`<path d="${mound}"/>`);
      const crumbs = scatter(70, 5, 12, 6, 102, 20).map(([x, y], j) => `<path d="M${x} ${y}q1.4-1.6 2.8 0" stroke="${j % 3 ? light(a.color, 0.35) : dark(a.color, 0.3)}" stroke-width="1" fill="none" stroke-linecap="round"/>`).join('');
      return `<path d="${mound}" fill="${k.grad([[0, light(a.color, 0.28)], [0.7, a.color], [1, dark(a.color, 0.15)]])}"/><g clip-path="${cp}">${crumbs}</g>`;
    });
  },
  chop(a) {
    return onTray(a, 2, (k, i) => {
      const x = 8 + i * 58;
      return `<path d="M${x} 17q0-11 18-12q24-1 30 7q3 8-8 11q-10 3-22 3q-17 1-18-9z" fill="${k.grad([[0, light(a.color, 0.3)], [0.6, a.color], [1, dark(a.color, 0.15)]], 'r')}"/>
        <path d="M${x + 3} 10q20-8 44-3" stroke="#f7ece0" stroke-width="3.4" fill="none" stroke-linecap="round"/>
        <path d="M${x + 42} 10q7 5 4 12" stroke="#f4efe4" stroke-width="3.2" fill="none" stroke-linecap="round"/>`;
    });
  },
  diced(a) {
    return onTray(a, 1, (k) => {
      const cube = k.grad([[0, light(a.color, 0.3)], [1, dark(a.color, 0.15)]], 'd');
      const pos: Array<[number, number]> = [[14, 12], [30, 9], [46, 12], [62, 9], [78, 12], [94, 9], [22, 18], [38, 17], [54, 18], [70, 17], [86, 18], [102, 17]];
      return pos.map(([x, y]) => `<rect x="${x}" y="${y}" width="13" height="11" rx="3" fill="${cube}"/><path d="M${x + 3} ${y + 3}h5" stroke="#f3d3c8" stroke-width=".9" opacity=".6"/>`).join('');
    });
  },
  salmon(a) {
    return onTray(a, 2, (k, i) => {
      const x = 8 + i * 58;
      return `<path d="M${x} 18q4-12 24-12q24 0 28 8q-2 10-28 11q-20 1-24-7z" fill="${k.grad([[0, light(a.color, 0.3)], [0.6, a.color], [1, dark(a.color, 0.12)]], 'r')}"/>
        <path d="M${x + 12} 8q-3.5 7 0 14M${x + 22} 7q-3.5 8 0 16M${x + 32} 7q-3.5 8 0 16M${x + 42} 8q-3 7 0 14" stroke="#fde6d8" stroke-width="1.4" fill="none" opacity=".85"/>`;
    });
  },
  wholefish(a) {
    return onTray(a, 2, (k, i) => {
      const x = 6 + i * 58;
      return `<path d="M${x} 16q12-10 32-9q10 1 16 6l8-6v15l-8-6q-6 6-16 7q-20 2-32-7z" fill="${k.grad([[0, light(a.color, 0.45)], [0.5, a.color], [1, dark(a.color, 0.2)]])}"/>
        <path d="M${x + 16} 9q4 3 0 6M${x + 24} 8q4 3 0 6M${x + 32} 8q4 3 0 6M${x + 40} 9q3 3 0 5" stroke="${dark(a.color, 0.45)}" stroke-width="1" fill="none" opacity=".7"/>
        <path d="M${x + 11} 10q-2 5 0 11" stroke="${dark(a.color, 0.3)}" stroke-width=".8" fill="none"/><circle cx="${x + 6}" cy="14" r="1.7" fill="#1a1d20"/><circle cx="${x + 6.5}" cy="13.5" r=".55" fill="#fff"/>`;
    });
  },
  prawns(a) {
    return onTray(a, 6, (_k, i) => {
      const x = 18 + (i % 3) * 36 + (i >= 3 ? 18 : 0), y = i >= 3 ? 11 : 16;
      return `<path d="M${x - 6} ${y + 2}a7 7 0 1 1 7 6" stroke="${a.color}" stroke-width="5" fill="none" stroke-linecap="round"/>
        <path d="M${x - 4} ${y - 3}l2 2M${x} ${y - 5}v2.5M${x + 4} ${y - 3}l-2 2M${x + 6} ${y + 1}h-2.6" stroke="${light(a.color, 0.45)}" stroke-width=".9"/>
        <path d="M${x + 1} ${y + 8}l4 3-5 1z" fill="${dark(a.color, 0.2)}"/>`;
    });
  },
  mussels(a) {
    return onTray(a, 1, (k) => {
      const shell = k.grad([[0, '#4a5a7a'], [0.5, '#1f2733'], [1, '#12161d']], 'd');
      const pos: Array<[number, number, number]> = [[16, 14, -20], [34, 10, 15], [52, 14, -10], [70, 10, 20], [88, 14, -15], [106, 11, 10], [26, 19, 5], [62, 20, -5], [96, 19, 12]];
      return pos.map(([x, y, r]) => `<g transform="rotate(${r} ${x} ${y})"><ellipse cx="${x}" cy="${y}" rx="10" ry="5.5" fill="${shell}"/><path d="M${x - 8} ${y}q8-3 16 0" stroke="#8fa0b8" stroke-width=".8" fill="none" opacity=".6"/></g>`).join('');
    });
  },
  nuggets(a) {
    return onTray(a, 1, (k) => {
      const crumb = k.grad([[0, '#f3c46a'], [0.6, a.color], [1, dark(a.color, 0.2)]], 'r');
      const pos: Array<[number, number]> = [[16, 13], [34, 10], [52, 13], [70, 10], [88, 13], [106, 10], [25, 18], [61, 18], [97, 18]];
      return pos.map(([x, y], j) => `<path d="M${x - 8} ${y + 2}q-1-7 7-8q9-1 10 6q0 6-8 7q-8 1-9-5z" fill="${crumb}"/>${dots(scatter(5, j + 3, x - 6, y - 4, 12, 8), 0.7, dark(a.color, 0.3), 0.5)}`).join('');
    });
  },
  duck(a) {
    return onTray(a, 2, (k, i) => {
      const x = 10 + i * 56;
      const shape = `M${x} 18q0-12 18-13q22-1 30 6q4 6-4 11q-8 5-24 6q-18 1-20-10z`;
      const cp = k.clip(`<path d="${shape}"/>`);
      let score = '';
      for (let j = 0; j < 8; j++) score += `<path d="M${x + j * 7} 4l12 22M${x + j * 7 + 12} 4l-12 22" stroke="${dark(a.color, 0.2)}" stroke-width=".8" opacity=".5"/>`;
      return `<path d="${shape}" fill="${k.grad([[0, light(a.color, 0.3)], [1, dark(a.color, 0.1)]], 'r')}"/><g clip-path="${cp}">${score}</g>`;
    });
  },
  bacon(a) {
    return pack(a, () => {
      let s = '';
      for (let i = 0; i < 5; i++) {
        const y = 21 + i * 6.4;
        s += `<path d="M10 ${y}q10-3 20 0t20 0t20 0t18 0v4.4q-9-3-18 0t-20 0t-20 0t-20 0z" fill="${a.color}"/><path d="M10 ${y + 1.6}q10-3 20 0t20 0t20 0t18 0" stroke="#fbe7dc" stroke-width="1.3" fill="none"/>`;
      }
      return s;
    });
  },
  ham(a) {
    return pack(a, (k) => {
      const slice = k.grad([[0, light(a.color, 0.2)], [1, a.color]], 'r');
      return [18, 34, 50, 66, 82].map((x, j) => `<ellipse cx="${x}" cy="${35 + (j % 2) * 2}" rx="13" ry="14" fill="${slice}" stroke="#fbe4d9" stroke-width="2"/>`).join('');
    });
  },
  salami(a) {
    return pack(a, (k) => {
      const slice = k.grad([[0, light(a.color, 0.15)], [1, dark(a.color, 0.1)]], 'r');
      return [20, 36, 52, 68, 84].map((x, j) => {
        const y = 35 + (j % 2) * 3;
        return `<circle cx="${x}" cy="${y}" r="11" fill="${slice}" stroke="${dark(a.color, 0.35)}" stroke-width="1.2"/>${dots(disc(8, j + 1, x, y, 8.5), 0.9, '#f6e3d6')}`;
      }).join('');
    });
  },

  /* dairy */
  wheel(a) {
    const k = new Kit();
    const paste = light(mix(a.color, '#f3d98a', 0.55), 0.1);
    return k.out(80, 48, `${k.shadow(40, 45, 36, 3)}
      <path d="M6 18v12q0 9 28 9t28-9V18" fill="${k.grad([[0, light(a.color, 0.2)], [1, dark(a.color, 0.14)]])}" ${EDGE}/>
      <ellipse cx="34" cy="18" rx="28" ry="8.5" fill="${light(a.color, 0.22)}" ${EDGE}/>
      <path d="M46 37L72 28L76 34Z" fill="${light(paste, 0.2)}" ${EDGE}/><path d="M46 37L76 34V40L46 43Z" fill="${paste}" ${EDGE}/><path d="M72 28L76 34V40L72 34Z" fill="${dark(a.color, 0.05)}" ${EDGE}/>`);
  },
  babybel(a) {
    const k = new Kit();
    const wax = k.grad([[0, light(a.color, 0.3)], [0.6, a.color], [1, dark(a.color, 0.3)]], 'r');
    const one = (x: number, y: number) => `<ellipse cx="${x}" cy="${y}" rx="13" ry="10" fill="${wax}"/><path d="M${x + 9} ${y - 7}l5-3 2 3-5 2z" fill="#f3e2b0"/>${shine(x - 5, y - 4, 3.5, 2, 0.35)}`;
    return k.out(88, 44, `${k.shadow(44, 41, 38, 3)}${one(43, 18)}${one(24, 28)}${one(62, 28)}`);
  },
  swiss(a) {
    const k = new Kit();
    const cp = k.clip('<path d="M3 40H63V24Q39 8 7 4Q3 4 3 9Z"/>');
    const holes = ([[14, 26, 2.6], [28, 32, 3.2], [42, 30, 2.4], [22, 36, 1.8], [52, 35, 2.2], [34, 22, 1.6], [10, 16, 1.6]] as Array<[number, number, number]>).map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r1(r * 0.8)}" fill="${dark(a.color, 0.2)}"/>`).join('');
    return k.out(66, 44, `${k.shadow(33, 41, 30, 3)}<path d="M3 40H63V24Q39 8 7 4Q3 4 3 9Z" fill="${k.grad([[0, light(a.color, 0.25)], [1, dark(a.color, 0.06)]])}" ${EDGE}/><g clip-path="${cp}">${holes}</g>`);
  },
  bluecheese(a) {
    const k = new Kit();
    const cp = k.clip('<path d="M3 40H63V24Q39 8 7 4Q3 4 3 9Z"/>');
    const veins = scatter(12, 4, 4, 10, 56, 28).map(([x, y]) => `<path d="M${x} ${y}q2-2 4 0t4 0" stroke="#5a7a9a" stroke-width="1.3" fill="none" opacity=".75"/>`).join('');
    return k.out(66, 44, `${k.shadow(33, 41, 30, 3)}<path d="M3 40H63V24Q39 8 7 4Q3 4 3 9Z" fill="${k.grad([[0, light(a.color, 0.2)], [1, dark(a.color, 0.08)]])}" ${EDGE}/><g clip-path="${cp}">${veins}</g>`);
  },
  mozzarella(a) {
    const k = new Kit();
    const b = k.grad([[0, '#ffffff'], [0.6, a.color], [1, dark(a.color, 0.18)]], 'r');
    const one = (x: number, y: number, r: number) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${b}"/><path d="M${x - 2} ${y - r + 1}q2-3 4 0" stroke="${dark(a.color, 0.1)}" stroke-width="1.2" fill="none"/>${shine(r1(x - r * 0.35), r1(y - r * 0.35), r1(r * 0.25), r1(r * 0.18), 0.8)}`;
    return k.out(66, 46, `${k.shadow(33, 43, 28, 3)}${one(44, 24, 13)}${one(24, 28, 14)}`);
  },
  icecream(a) {
    const k = new Kit();
    return k.out(62, 68, `${k.shadow(31, 65, 24, 3)}
      <path d="M14 22q-2-14 10-15q4-6 12-3q10-2 12 8q4 4 2 10z" fill="${k.grad([[0, light(a.color, 0.35)], [0.7, a.color], [1, dark(a.color, 0.15)]], 'r')}"/>
      <path d="M8 22L12 60Q12 64 16 64H46Q50 64 50 60L54 22Z" fill="${face(k, a.accent)}" ${EDGE}/>
      <rect x="6" y="18" width="50" height="6" rx="2" fill="${light(a.accent, 0.2)}" ${EDGE}/>${label(16, 36, 26, '#fff')}`);
  },

  /* bakery */
  baguette(a) {
    const k = new Kit();
    return k.out(106, 34, `${k.shadow(53, 31, 48, 2.6)}
      <path d="M6 22q0-9 12-10l72-5q12 0 12 8t-12 9l-72 5q-12 1-12-7z" fill="${lying(k, a.color)}"/>
      ${[20, 36, 52, 68, 84].map((x) => `<path d="M${x} ${r1(12 - (x - 20) * 0.06)}q6-.5 10 3" stroke="${light(a.color, 0.55)}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`).join('')}
      ${dots(scatter(12, 3, 16, 12, 76, 10), 0.6, '#fff', 0.5)}`);
  },
  croissant(a) {
    const k = new Kit();
    const g = ball(k, a.color);
    return k.out(78, 46, `${k.shadow(39, 43, 34, 3)}
      <path d="M6 34q2-10 12-12q-2 8 2 14q-8 3-14-2z" fill="${g}"/><path d="M72 34q-2-10-12-12q2 8-2 14q8 3 14-2z" fill="${g}"/>
      <path d="M17 24q4-8 12-8q-1 11 2 20q-10 2-14-12z" fill="${g}"/><path d="M61 24q-4-8-12-8q1 11-2 20q10 2 14-12z" fill="${g}"/>
      <path d="M28 17q11-8 22 0q-1 12-2 21q-9 3-18 0q-1-9-2-21z" fill="${g}"/>${shine(36, 21, 5, 2.5, 0.3)}`);
  },
  boule(a) {
    const k = new Kit();
    return k.out(70, 50, `${k.shadow(35, 47, 30, 3)}
      <path d="M6 42q0-32 29-32t29 32q-2 4-29 4t-29-4z" fill="${ball(k, a.color)}"/>
      <path d="M20 22q15-10 30 2" stroke="${light(a.color, 0.55)}" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M22 23q13-7 26 1" stroke="${dark(a.color, 0.25)}" stroke-width="1" fill="none"/>${dots(scatter(18, 9, 14, 12, 42, 16), 0.8, '#fff', 0.55)}`);
  },
  pitta(a) {
    const k = new Kit();
    let s = k.shadow(46, 34, 42, 3);
    for (let i = 0; i < 3; i++) s += `<ellipse cx="${44 + i * 2}" cy="${28 - i * 5}" rx="36" ry="7.5" fill="${k.grad([[0, light(a.color, 0.3)], [1, dark(a.color, 0.12)]])}" ${EDGE}/>`;
    return k.out(92, 38, s);
  },
  naan(a) {
    const k = new Kit();
    let s = k.shadow(46, 34, 42, 3);
    for (let i = 0; i < 2; i++) s += `<path d="M${10 + i * 4} ${28 - i * 7}q10-9 34-8q30 1 36 7q-6 7-36 8q-26 1-34-7z" fill="${k.grad([[0, light(a.color, 0.3)], [1, dark(a.color, 0.12)]])}" ${EDGE}/>`;
    return k.out(92, 38, `${s}${dots(scatter(10, 5, 20, 16, 50, 6), 1.3, dark(a.color, 0.55), 0.6)}${dots(scatter(8, 7, 18, 16, 54, 6), 1.8, light(a.color, 0.4), 0.8)}`);
  },
  quiche(a) {
    const k = new Kit();
    const crust = '#d9a45a';
    let flutes = '';
    for (let i = 0; i < 20; i++) {
      const t = (i / 20) * Math.PI * 2;
      flutes += `<circle cx="${r1(38 + Math.cos(t) * 32)}" cy="${r1(22 + Math.sin(t) * 11)}" r="3" fill="${crust}"/>`;
    }
    return k.out(76, 44, `${k.shadow(38, 41, 34, 3)}
      <path d="M6 22v8q0 10 32 10t32-10v-8" fill="${dark(crust, 0.12)}" ${EDGE}/>${flutes}
      <ellipse cx="38" cy="22" rx="32" ry="11" fill="${crust}"/><ellipse cx="38" cy="22" rx="28" ry="9" fill="${k.grad([[0, light(a.color, 0.3)], [1, a.color]], 'r')}"/>
      ${dots(scatter(9, 4, 20, 16, 36, 10), 1.1, '#5d9a45', 0.8)}${dots(scatter(6, 8, 22, 17, 32, 8), 1, '#c8553d', 0.7)}`);
  },
  sausageroll(a) {
    const k = new Kit();
    const one = (x: number, y: number) => `<rect x="${x}" y="${y - 7}" width="40" height="14" rx="6" fill="${lying(k, a.color)}"/>
      ${[8, 16, 24, 32].map((d) => `<path d="M${x + d} ${y - 6}l-3 5" stroke="${light(a.color, 0.5)}" stroke-width="1.4" stroke-linecap="round"/>`).join('')}
      <ellipse cx="${x + 40}" cy="${y}" rx="4" ry="7" fill="${light(a.color, 0.25)}"/><ellipse cx="${x + 40}" cy="${y}" rx="2.6" ry="4.6" fill="#b86a5a"/>`;
    return k.out(96, 40, `${k.shadow(48, 37, 42, 3)}${one(8, 18)}${one(46, 26)}`);
  },
  pastry(a) {
    const k = new Kit();
    return k.out(96, 40, `${k.shadow(48, 37, 42, 3)}
      <rect x="8" y="10" width="76" height="24" rx="12" fill="${lying(k, a.color)}" ${EDGE}/>
      <ellipse cx="84" cy="22" rx="6" ry="12" fill="${light(a.color, 0.3)}" ${EDGE}/><ellipse cx="84" cy="22" rx="3" ry="6" fill="none" stroke="${dark(a.color, 0.1)}" stroke-width="1"/>
      <rect x="24" y="10" width="30" height="24" fill="${face(k, a.accent)}"/>${label(29, 19, 18, '#fff')}`);
  },

  /* cupboard: packets */
  spaghetti(a) {
    const k = new Kit();
    let strands = '';
    for (let i = 0; i < 9; i++) strands += `<path d="M${r1(15 + i * 2.6)} 30V72" stroke="${i % 2 ? light(a.color, 0.1) : dark(a.color, 0.08)}" stroke-width="1.3"/>`;
    return k.out(52, 96, `${k.shadow(26, 93, 22, 3)}
      <path d="M8 12L14 7H44L38 12Z" fill="${light(a.accent, 0.3)}" ${EDGE}/>
      <rect x="8" y="12" width="30" height="80" fill="${face(k, a.accent)}" ${EDGE}/>
      <path d="M38 12L44 7V87L38 92Z" fill="${dark(a.accent, 0.3)}" ${EDGE}/>
      <rect x="12" y="28" width="22" height="46" rx="3" fill="rgba(255,255,255,.92)"/>${strands}${label(13, 80, 20, '#fff')}`);
  },
  nests(a) {
    const k = new Kit();
    const nest = (x: number, y: number) => `<ellipse cx="${x}" cy="${y}" rx="14" ry="10" fill="${dark(a.color, 0.08)}"/>
      ${[[-12, -1, 11, -5], [-11, 4, 12, -2], [-8, -6, 13, 3], [-13, 2, 7, 8], [-5, -8, 12, 5], [-10, 6, 10, 6]].map(([x1, y1, x2, y2], j) => `<path d="M${x + x1} ${y + y1}Q${x + (j % 2 ? 4 : -4)} ${y + (y1 + y2) / 2 - 7} ${x + x2} ${y + y2}" stroke="${j % 2 ? light(a.color, 0.2) : a.color}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`).join('')}`;
    return k.out(96, 48, `${k.shadow(48, 45, 42, 3)}${nest(30, 22)}${nest(62, 22)}${nest(46, 32)}`);
  },
  cupnoodle(a) {
    const k = new Kit();
    return k.out(56, 66, `${k.shadow(28, 63, 22, 3)}
      <path d="M8 14L13 60Q13 63 16 63H40Q43 63 43 60L48 14Z" fill="${face(k, '#f6f1e6')}" ${EDGE}/>
      <rect x="10" y="28" width="36" height="16" fill="${face(k, a.accent)}"/>${label(15, 33, 20, '#fff')}
      <ellipse cx="28" cy="14" rx="21" ry="4" fill="#dfe4e6" ${EDGE}/><path d="M36 12q10-8 14-4l-6 6z" fill="#e9eef0" ${EDGE}/>`);
  },
  rice(a) {
    const k = new Kit();
    const bag = 'M12 8H56L60 76Q60 80 56 80H12Q8 80 8 76Z';
    const cp = k.clip(`<path d="${bag}"/>`);
    const grains = scatter(95, 21, 10, 32, 48, 46).map(([x, y], j) => `<ellipse cx="${x}" cy="${y}" rx="1.9" ry=".9" transform="rotate(${(j * 37) % 180} ${x} ${y})" fill="${j % 4 ? a.color : dark(a.color, 0.14)}" stroke="${dark(a.color, 0.28)}" stroke-width=".3"/>`).join('');
    return k.out(68, 84, `${k.shadow(34, 81, 28, 3)}
      <path d="${bag}" fill="${light(a.color, 0.2)}"/><g clip-path="${cp}">${grains}</g>
      <path d="${bag}" fill="rgba(255,255,255,.14)" ${EDGE}/>
      <rect x="10" y="8" width="48" height="22" fill="${face(k, a.accent)}"/>${label(16, 15, 24, '#fff')}
      <path d="M12 8Q34 12 56 8" stroke="${dark(a.accent, 0.25)}" stroke-width="1.4" fill="none"/>${hl(13, 34, 2.5, 40, 0.4)}`);
  },
  flour(a) {
    const k = new Kit();
    const ear = [0, 1, 2, 3].map((j) => `<ellipse cx="26" cy="${46 + j * 5}" rx="2.2" ry="3.4" transform="rotate(-30 26 ${46 + j * 5})" fill="#d9a441"/><ellipse cx="32" cy="${46 + j * 5}" rx="2.2" ry="3.4" transform="rotate(30 32 ${46 + j * 5})" fill="#d9a441"/>`).join('');
    return k.out(60, 86, `${k.shadow(30, 83, 26, 3)}
      <path d="M8 18H52V78Q52 82 48 82H12Q8 82 8 78Z" fill="${k.grad([[0, light(a.color, 0.2)], [0.5, a.color], [1, dark(a.color, 0.12)]], 'h')}" ${EDGE}/>
      <path d="M8 18L12 8H48L52 18Z" fill="${light(a.color, 0.25)}" ${EDGE}/><path d="M12 8L30 14L48 8" fill="none" stroke="${dark(a.color, 0.2)}" stroke-width="1"/>
      <rect x="8" y="26" width="44" height="10" fill="${face(k, a.accent)}"/>
      <path d="M29 42V72" stroke="#b8862a" stroke-width="1.3"/>${ear}`);
  },
  sugar(a) {
    const k = new Kit();
    const top = light(a.color, 0.55);
    const cube = (x: number, y: number) => `<path d="M${x} ${y}l6-3 6 3-6 3z" fill="${top}"/><path d="M${x} ${y}v6l6 3v-6z" fill="${dark(top, 0.08)}"/><path d="M${x + 12} ${y}v6l-6 3v-6z" fill="${dark(top, 0.18)}"/>`;
    return k.out(64, 84, `${k.shadow(32, 81, 26, 3)}
      <path d="M10 10H54L56 78Q56 81 52 81H12Q8 81 8 78Z" fill="${face(k, a.color)}" ${EDGE}/>
      <rect x="10" y="10" width="44" height="12" fill="${face(k, a.accent)}"/>
      ${cube(20, 50)}${cube(32, 50)}${cube(26, 41)}${label(16, 66, 24, dark(a.color, 0.35))}`);
  },
  oats(a) {
    const flakes = scatter(12, 17, 14, 36, 30, 18).map(([x, y], j) => `<ellipse cx="${x}" cy="${y}" rx="2.8" ry="1.9" transform="rotate(${j * 33} ${x} ${y})" fill="#d9c08a" stroke="#b8985a" stroke-width=".4"/>`).join('');
    return canister(a, flakes);
  },
  cocoa(a) {
    return canister(a, `<path d="M20 40h16v10q0 6-8 6t-8-6z" fill="#f6efe0" ${EDGE}/><path d="M36 43q5 0 5 3.5t-5 3.5" stroke="#f6efe0" stroke-width="2" fill="none"/><ellipse cx="28" cy="40" rx="8" ry="2" fill="${a.color}"/>`);
  },
  cereal(a) {
    const k = new Kit();
    const flakes = scatter(10, 13, 20, 38, 26, 8).map(([x, y], j) => `<ellipse cx="${x}" cy="${y}" rx="3" ry="1.8" transform="rotate(${j * 40} ${x} ${y})" fill="${a.color}" stroke="${dark(a.color, 0.2)}" stroke-width=".4"/>`).join('');
    return k.out(66, 88, `${k.shadow(33, 85, 30, 3)}
      <path d="M8 12L16 6H62L54 12Z" fill="${light(a.accent, 0.35)}" ${EDGE}/>
      <rect x="8" y="12" width="46" height="72" fill="${face(k, a.accent)}" ${EDGE}/>
      <path d="M54 12L62 6V78L54 84Z" fill="${dark(a.accent, 0.28)}" ${EDGE}/>
      <rect x="12" y="16" width="38" height="12" rx="3" fill="#fff" opacity=".88"/><path d="M16 22h22" stroke="${dark(a.accent, 0.35)}" stroke-width="2.2" stroke-linecap="round"/>
      ${flakes}<path d="M16 44h32q0 13-16 13t-16-13z" fill="#f4f6f7" ${EDGE}/><path d="M42 36l10-8" stroke="#dfe4e6" stroke-width="2.4" stroke-linecap="round"/>`);
  },
  chocolate(a) {
    const k = new Kit();
    const choc = k.grad([[0, light(a.color, 0.18)], [1, dark(a.color, 0.15)]]);
    let squares = '';
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) squares += `<rect x="${12 + c * 11}" y="${14 + r * 10}" width="9" height="8" rx="1.2" fill="${choc}" stroke="${dark(a.color, 0.3)}" stroke-width=".5"/><path d="M${13 + c * 11} ${15 + r * 10}h6" stroke="${light(a.color, 0.35)}" stroke-width=".8"/>`;
    return k.out(94, 40, `${k.shadow(47, 37, 42, 3)}
      <rect x="8" y="10" width="80" height="24" rx="2" fill="${choc}" ${EDGE}/>${squares}
      <path d="M44 9h10l2 3-2 3 2 3-2 3 2 3-2 3 2 3-2 3H44Z" fill="#d7dde0"/>
      <rect x="52" y="9" width="37" height="26" rx="2" fill="${face(k, a.accent)}" ${EDGE}/>${label(58, 18, 20, '#fff')}`);
  },
  tea(a) {
    const k = new Kit();
    return k.out(72, 64, `${k.shadow(36, 61, 32, 3)}
      <path d="M6 18L14 12H56L48 18Z" fill="${light(a.accent, 0.35)}" ${EDGE}/>
      <rect x="6" y="18" width="42" height="42" fill="${face(k, a.accent)}" ${EDGE}/>
      <path d="M48 18L56 12V54L48 60Z" fill="${dark(a.accent, 0.28)}" ${EDGE}/>${label(12, 28, 26, '#fff')}
      <path d="M58 20v14" stroke="#f4efe4" stroke-width=".8"/><rect x="54" y="14" width="8" height="7" rx="1" fill="${light(a.accent, 0.3)}" ${EDGE}/>
      <rect x="51" y="34" width="14" height="18" rx="2" fill="${k.grad([[0, '#e8d8b0'], [1, '#c9b07a']])}" ${EDGE}/><path d="M54 39h8M54 43h8M54 47h6" stroke="#a88a52" stroke-width=".7" opacity=".7"/>`);
  },
  coffee(a) {
    const k = new Kit();
    return k.out(60, 86, `${k.shadow(30, 83, 26, 3)}
      <path d="M10 14L14 8H46L50 14V78Q50 82 46 82H14Q10 82 10 78Z" fill="${face(k, a.color)}" ${EDGE}/>
      <path d="M14 8Q30 13 46 8" stroke="${light(a.color, 0.25)}" fill="none"/>
      <circle cx="30" cy="25" r="4" fill="${dark(a.color, 0.2)}" stroke="${light(a.color, 0.35)}" stroke-width="1"/>
      <ellipse cx="30" cy="50" rx="8" ry="11" fill="#8a5a3a"/><path d="M30 40q-4 10 0 20" stroke="#3e2416" stroke-width="1.6" fill="none"/>
      <rect x="10" y="67" width="40" height="8" fill="${a.accent}"/>${hl(14, 16, 2.5, 56, 0.25)}`);
  },
  crisps(a) {
    return pillow(a, `<path d="M22 46q12-10 24-2q-2 10-12 12q-10 2-12-10z" fill="#f3c65a"/><path d="M26 47q8-5 16 0M26 51q8-4 14 0" stroke="#d9a43a" stroke-width=".9" fill="none"/>`);
  },
  tortillachips(a) {
    return pillow(a, `<path d="M20 56l9-17 9 17z" fill="#e9b84a"/><path d="M32 54l9-17 9 17z" fill="#f0c65a"/>${dots(scatter(6, 3, 24, 44, 22, 10), 0.6, '#b8862a')}`);
  },
  pretzels(a) {
    return pillow(a, `<path d="M34 54c-9 0-12-9-6-11s8 7 6 11c-2-4 0-13 6-11s3 11-6 11" stroke="#8a4a1a" stroke-width="2.8" fill="none" stroke-linecap="round"/>${dots([[27, 46], [40, 45], [34, 51]], 0.8, '#fff')}`);
  },
  popcorn(a) {
    return pillow(a, dots([[26, 48], [32, 44], [38, 48], [30, 52], [36, 53], [42, 45]], 4.2, '#fbf3dc') + dots([[27, 47], [33, 43], [39, 47]], 1.2, '#e9c86a'));
  },
  driedfruit(a) {
    return windowBag(a, (x, y, j) => `<path d="M${x - 3} ${y}q0-3 3-3q4 0 4 3t-4 3q-3 0-3-3z" fill="${j % 3 ? a.color : dark(a.color, 0.2)}"/><path d="M${x - 1} ${y - 1}q1 1 2 0" stroke="${dark(a.color, 0.35)}" stroke-width=".6" fill="none"/>`);
  },
  penne(a) {
    return windowBag(a, (x, y, j) => `<g transform="rotate(${(j * 47) % 180 - 90} ${x} ${y})"><path d="M${x - 5} ${y - 1.8}h8l2 3.6h-8z" fill="${a.color}" stroke="${dark(a.color, 0.25)}" stroke-width=".5"/></g>`);
  },
  fusilli(a) {
    return windowBag(a, (x, y, j) => `<g transform="rotate(${(j * 53) % 180 - 90} ${x} ${y})"><path d="M${x - 5} ${y}q1.25-2.6 2.5 0t2.5 0t2.5 0t2.5 0" stroke="${a.color}" stroke-width="2.4" fill="none"/></g>`);
  },
  macaroni(a) {
    return windowBag(a, (x, y, j) => `<g transform="rotate(${(j * 61) % 360} ${x} ${y})"><path d="M${x - 3} ${y + 2}a4 4 0 0 1 6-5" stroke="${a.color}" stroke-width="2.6" fill="none" stroke-linecap="round"/></g>`);
  },
  orzo(a) {
    return windowBag(a, (x, y, j) => `<ellipse cx="${x - 2}" cy="${y}" rx="2" ry="1" transform="rotate(${j * 29} ${x - 2} ${y})" fill="${a.color}"/><ellipse cx="${x + 2}" cy="${y + 2}" rx="2" ry="1" transform="rotate(${j * 41} ${x + 2} ${y + 2})" fill="${dark(a.color, 0.08)}"/>`);
  },

  /* cupboard: biscuits and bars */
  digestive(a) {
    return stackOf(a, (k) => `<ellipse cx="35" cy="24" rx="26" ry="9" fill="${ball(k, a.color)}" ${EDGE}/>${dots(scatter(14, 5, 16, 19, 38, 10), 0.8, dark(a.color, 0.3), 0.6)}`);
  },
  cookie(a) {
    return stackOf(a, (k) => `<ellipse cx="35" cy="24" rx="26" ry="9" fill="${ball(k, a.color)}" ${EDGE}/>${scatter(8, 9, 16, 19, 38, 10).map(([x, y]) => `<path d="M${x - 2} ${y}q1-2 2.5-1.5t1.5 2q-1 1.5-3 1z" fill="#4a2a1a"/>`).join('')}`);
  },
  cracker(a) {
    return stackOf(a, (k) => `<path d="M10 26l24-9 26 9-24 10z" fill="${ball(k, a.color)}" ${EDGE}/>${dots([[24, 25], [31, 22], [38, 25], [31, 28], [45, 25], [38, 29], [27, 28], [41, 21]], 0.8, dark(a.color, 0.35), 0.7)}`, true);
  },
  ricecake(a) {
    return stackOf(a, (k) => `<ellipse cx="35" cy="24" rx="26" ry="9" fill="${ball(k, a.color)}" ${EDGE}/>${dots(scatter(18, 7, 14, 18, 42, 12), 1.6, light(a.color, 0.5), 0.8)}`);
  },
  shortbread(a) {
    const k = new Kit();
    const one = (x: number, y: number) => `<rect x="${x}" y="${y}" width="16" height="30" rx="2.5" fill="${ball(k, a.color)}" ${EDGE}/>${dots([[x + 5, y + 8], [x + 11, y + 8], [x + 5, y + 15], [x + 11, y + 15], [x + 5, y + 22], [x + 11, y + 22]], 0.7, dark(a.color, 0.3), 0.7)}`;
    return k.out(70, 48, `${k.shadow(35, 45, 30, 3)}${one(14, 10)}${one(27, 12)}${one(40, 10)}`);
  },

  /* cupboard: jars */
  honey(a) {
    const k = new Kit();
    const body = 'M8 20Q8 14 14 14H42Q48 14 48 20V58Q48 64 42 64H14Q8 64 8 58Z';
    const cp = k.clip(`<path d="${body}"/>`);
    const hex = (x: number, y: number) => `<path d="M${x} ${y - 4}l3.5 2v4l-3.5 2-3.5-2v-4z" fill="none" stroke="#b8741a" stroke-width=".9"/>`;
    return k.out(56, 68, `${k.shadow(28, 65, 24, 3)}<path d="${body}" fill="rgba(255,255,255,.22)"/>
      <g clip-path="${cp}">${lvl(a.level, `<rect x="0" y="16" width="56" height="50" fill="${k.cyl(a.color)}"/>`)}<rect x="8" y="30" width="40" height="20" fill="#f7ebc8"/>${hex(21, 40)}${hex(28, 36)}${hex(35, 40)}${hex(28, 44)}</g>
      <path d="${body}" fill="none" ${EDGE}/>
      <path d="M10 8h36q2 0 2 2v6H8v-6q0-2 2-2z" fill="${k.cyl('#d9962a')}" ${EDGE}/>
      <path d="M14 16q0 5 2 5t2-5M26 16q0 7 2 7t2-7M38 16q0 4 2 4t2-4" fill="${a.color}"/>${hl(12, 22, 3.5, 34, 0.55)}`);
  },
  jam(a) {
    const k = new Kit();
    const body = 'M9 18Q9 14 13 14H43Q47 14 47 18V58Q47 64 41 64H15Q9 64 9 58Z';
    const cp = k.clip(`<path d="${body}"/>`);
    const cloth = 'M4 16Q6 4 28 4T52 16L48 22H8Z';
    const cc = k.clip(`<path d="${cloth}"/>`);
    let checks = '';
    for (let i = 0; i < 9; i++) checks += `<rect x="${4 + i * 6}" y="0" width="3" height="24" fill="#c8323a" opacity=".55"/><rect x="0" y="${2 + i * 6}" width="56" height="3" fill="#c8323a" opacity=".55"/>`;
    return k.out(56, 68, `${k.shadow(28, 65, 24, 3)}<path d="${body}" fill="rgba(255,255,255,.22)"/>
      <g clip-path="${cp}">${lvl(a.level, `<rect x="0" y="16" width="56" height="50" fill="${k.cyl(a.color)}"/>`)}<ellipse cx="28" cy="42" rx="13" ry="9" fill="#fbf4e6"/>
        <path d="M28 46c-3-2-4.5-4-4.5-6 0-2 2-3 4.5-3s4.5 1 4.5 3c0 2-1.5 4-4.5 6z" fill="${a.color}"/><path d="M25 36.5l1.5 1 1.5-1.5 1.5 1.5 1.5-1-1 2h-4z" fill="#4f8a3a"/></g>
      <path d="${body}" fill="none" ${EDGE}/>
      <path d="${cloth}" fill="#fff" ${EDGE}/><g clip-path="${cc}">${checks}</g><path d="M8 20h40" stroke="#b8905a" stroke-width="1.6"/>${hl(12, 24, 3.5, 32, 0.5)}`);
  },
  nutbutter(a) {
    const k = new Kit();
    const body = 'M6 20Q6 16 10 16H54Q58 16 58 20V52Q58 58 52 58H12Q6 58 6 52Z';
    const cp = k.clip(`<path d="${body}"/>`);
    return k.out(64, 62, `${k.shadow(32, 59, 28, 3)}<path d="${body}" fill="rgba(255,255,255,.22)"/>
      <g clip-path="${cp}">${lvl(a.level, `<rect x="0" y="18" width="64" height="42" fill="${k.cyl(a.color)}"/>`)}<rect x="6" y="28" width="52" height="18" fill="#f7efdc"/>
        <path d="M24 37a4 4 0 0 1 7-3a4 4 0 0 1 7 3a4 4 0 0 1-7 3a4 4 0 0 1-7-3z" fill="#c9985a" stroke="#8a6a3a" stroke-width=".6"/></g>
      <path d="${body}" fill="none" ${EDGE}/><rect x="7" y="6" width="50" height="12" rx="3" fill="${k.cyl(a.accent)}" ${EDGE}/>${hl(10, 22, 3.5, 30, 0.5)}`);
  },
  almonds(a) {
    return glassJar(a, (k) => `<rect x="0" y="12" width="56" height="54" fill="${dark(a.color, 0.4)}"/>` + packed((x, y, j) => `<ellipse cx="${x}" cy="${y}" rx="2.6" ry="4" transform="rotate(${(j * 53) % 180 - 90} ${x} ${y})" fill="${ball(k, a.color)}"/>`));
  },
  cashews(a) {
    return glassJar(a, () => `<rect x="0" y="12" width="56" height="54" fill="${dark(a.color, 0.4)}"/>` + packed((x, y, j) => `<g transform="rotate(${(j * 71) % 360} ${x} ${y})"><path d="M${x - 3} ${y - 3}q-2.5 5 1.5 7.5q3.5 1.5 4.5-1.5q-3 0-3-3q0-2.5-3-3z" fill="${a.color}" stroke="${dark(a.color, 0.2)}" stroke-width=".5"/></g>`));
  },
  walnuts(a) {
    return glassJar(a, () => `<rect x="0" y="12" width="56" height="54" fill="${dark(a.color, 0.4)}"/>` + packed((x, y) => `<ellipse cx="${x}" cy="${y}" rx="3.8" ry="3.2" fill="${a.color}" stroke="${dark(a.color, 0.3)}" stroke-width=".5"/><path d="M${x} ${y - 3}v6M${x - 2.5} ${y - 1}q1.2 1 0 2M${x + 2.5} ${y - 1}q-1.2 1 0 2" stroke="${dark(a.color, 0.35)}" stroke-width=".6" fill="none"/>`));
  },
  peanuts(a) {
    return glassJar(a, () => `<rect x="0" y="12" width="56" height="54" fill="${dark(a.color, 0.4)}"/>` + packed((x, y, j) => `<g transform="rotate(${(j * 47) % 180} ${x} ${y})"><circle cx="${x - 2.2}" cy="${y}" r="2.6" fill="${a.color}"/><circle cx="${x + 2.2}" cy="${y}" r="2.4" fill="${dark(a.color, 0.06)}"/></g>`));
  },
  pinenuts(a) {
    return glassJar(a, () => `<rect x="0" y="12" width="56" height="54" fill="${dark(a.color, 0.4)}"/>` + packed((x, y, j) => `<ellipse cx="${x - 1.6}" cy="${y}" rx="1.2" ry="2.2" transform="rotate(${j * 37} ${x - 1.6} ${y})" fill="${a.color}"/><ellipse cx="${x + 1.8}" cy="${y + 1.4}" rx="1.2" ry="2.2" transform="rotate(${j * 53} ${x + 1.8} ${y + 1.4})" fill="${dark(a.color, 0.08)}"/>`, 5, 8, 13, 17, 7.2, 5.8));
  },
  mixednuts(a) {
    return glassJar(a, () => `<rect x="0" y="12" width="56" height="54" fill="${dark(a.color, 0.4)}"/>` + packed((x, y, j) => (j % 3 === 0
      ? `<ellipse cx="${x}" cy="${y}" rx="2.6" ry="4" transform="rotate(${j * 29} ${x} ${y})" fill="#b9803f"/>`
      : j % 3 === 1
        ? `<circle cx="${x}" cy="${y}" r="2.8" fill="#4a2a2a"/>`
        : `<ellipse cx="${x}" cy="${y}" rx="3.6" ry="3" fill="#c9985a"/>`)));
  },
  seeds(a) {
    return glassJar(a, () => `<rect x="0" y="12" width="56" height="54" fill="${dark(a.color, 0.25)}"/>` + dots(scatter(170, 3, 9, 14, 38, 50), 1.1, a.color) + dots(scatter(90, 8, 9, 14, 38, 50), 0.9, dark(a.color, 0.2)));
  },
  sprinkles(a) {
    const colours = ['#e8577a', '#f2c14e', '#4fb0d9', '#7cc36a', '#fff', '#b07ad9'];
    return glassJar(a, () => scatter(120, 5, 9, 14, 38, 50).map(([x, y], j) => `<path d="M${x} ${y}l2.2 ${j % 2 ? 1 : -1}" stroke="${colours[j % colours.length]}" stroke-width="1.3" stroke-linecap="round"/>`).join(''));
  },
  olives(a) {
    return glassJar(a, () => `<rect x="0" y="12" width="56" height="54" fill="#e9e2a8" opacity=".45"/>` + packed((x, y) => `<ellipse cx="${x}" cy="${y}" rx="3.4" ry="2.8" fill="${a.color}"/>${a.color === '#7f8f3a' ? `<circle cx="${x + 1}" cy="${y - 0.5}" r="1" fill="#c8323a"/>` : `<ellipse cx="${x - 1}" cy="${y - 1}" rx="1" ry=".6" fill="#fff" opacity=".4"/>`}`));
  },
  gherkins(a) {
    return glassJar(a, (k) => `<rect x="0" y="12" width="56" height="54" fill="#e9e2a8" opacity=".5"/>${[16, 24, 32, 40].map((x, j) => `<rect x="${x - 3.5}" y="${20 + (j % 2) * 5}" width="7" height="34" rx="3.5" fill="${lying(k, a.color)}"/>${dots(scatter(5, j, x - 2.5, 22 + (j % 2) * 5, 5, 28), 0.7, light(a.color, 0.4))}`).join('')}`);
  },
  pickledonions(a) {
    return glassJar(a, (k) => `<rect x="0" y="12" width="56" height="54" fill="#efe9c2" opacity=".5"/>` + packed((x, y) => `<circle cx="${x}" cy="${y}" r="3.4" fill="${ball(k, a.color)}"/>`, 4, 6, 15, 20, 9, 7.6));
  },
  kraut(a) {
    return glassJar(a, () => `<rect x="0" y="12" width="56" height="54" fill="${light(a.color, 0.1)}" opacity=".6"/>` + scatter(90, 7, 10, 16, 36, 46).map(([x, y], j) => `<path d="M${x} ${y}q2 ${j % 2 ? -1.5 : 1.5} 4.5 0" stroke="${j % 4 ? a.color : dark(a.color, 0.2)}" stroke-width="1.2" fill="none"/>`).join(''));
  },
  dip(a) {
    const k = new Kit();
    return k.out(66, 52, `${k.shadow(33, 49, 28, 3)}
      <path d="M6 20L10 44Q10 48 14 48H52Q56 48 56 44L60 20Z" fill="${face(k, a.accent)}" ${EDGE}/>${label(18, 32, 26, '#fff')}
      <ellipse cx="33" cy="20" rx="27" ry="7" fill="${light(a.accent, 0.2)}" ${EDGE}/><ellipse cx="33" cy="20" rx="24" ry="5.6" fill="${k.grad([[0, light(a.color, 0.2)], [1, dark(a.color, 0.1)]], 'r')}"/>
      <path d="M20 20q6-4 13-1t12 0" stroke="${light(a.color, 0.4)}" stroke-width="1.4" fill="none"/>${dots([[27, 18], [36, 21], [41, 18]], 0.8, '#c8553d', 0.8)}`);
  },

  /* cupboard: bottles and cans */
  squeeze(a) {
    const k = new Kit();
    const body = 'M11 8Q11 4 16 4H40Q45 4 45 8V58Q45 66 38 70L34 74H22L18 70Q11 66 11 58Z';
    return k.out(56, 90, `${k.shadow(28, 87, 16, 2.5)}
      <path d="${body}" fill="${k.cyl(a.color)}" ${EDGE}/>
      <rect x="15" y="22" width="26" height="24" rx="3" fill="#fbf8f0"/>${label(19, 30, 16, dark(a.color, 0.1))}
      <path d="M20 74h16v8q0 4-4 4h-8q-4 0-4-4z" fill="${k.cyl(a.accent)}" ${EDGE}/>${hl(15, 8, 3, 44, 0.4)}`);
  },
  oil(a) {
    return tallBottle(a, `<path d="M13 64h18M13 70h12" stroke="${dark(a.accent, 0.2)}" stroke-width="1.8" stroke-linecap="round"/>`, a.accent);
  },
  oliveoil(a) {
    return tallBottle(a, `<path d="M16 72q6-4 12-10" stroke="#5a6a2a" stroke-width="1" fill="none"/><ellipse cx="18" cy="68" rx="3.4" ry="1.4" transform="rotate(-30 18 68)" fill="#6f8a3a"/><ellipse cx="25" cy="64" rx="3.4" ry="1.4" transform="rotate(-50 25 64)" fill="#6f8a3a"/><ellipse cx="22" cy="74" rx="2.2" ry="2.8" fill="#4a5a1a"/>`, '#2f4a22');
  },
  soy(a) {
    const k = new Kit();
    const body = 'M16 18Q16 14 20 14H28Q32 14 32 18V24Q40 28 40 36V76Q40 82 34 82H14Q8 82 8 76V36Q8 28 16 24Z';
    const cp = k.clip(`<path d="${body}"/>`);
    return k.out(48, 86, `${k.shadow(24, 83, 18, 3)}<path d="${body}" fill="rgba(255,255,255,.2)"/>
      <g clip-path="${cp}">${lvl(a.level, `<rect x="0" y="22" width="48" height="62" fill="${k.cyl(a.color)}"/>`)}<rect x="8" y="46" width="32" height="20" fill="#f7f3ea"/><rect x="8" y="46" width="32" height="5" fill="${a.accent}"/>${label(13, 56, 18, '#3a2418')}</g>
      <path d="${body}" fill="none" ${EDGE}/><path d="M17 5h14v10H17z" fill="${k.cyl(a.accent)}" ${EDGE}/><path d="M26 2h7v5h-7z" fill="${k.cyl(a.accent)}"/>${hl(12, 34, 3, 36, 0.4)}`);
  },
  maple(a) {
    const k = new Kit();
    const body = 'M18 4H28V18Q28 22 32 26Q40 32 40 42V84Q40 90 34 90H14Q8 90 8 84V42Q8 32 14 26Q18 22 18 18Z';
    const cp = k.clip(`<path d="${body}"/>`);
    return k.out(52, 94, `${k.shadow(24, 91, 20, 3)}
      <path d="M28 20q12-2 12 8t-8 10" stroke="${light(a.color, 0.2)}" stroke-width="4" fill="none" opacity=".85"/>
      <path d="${body}" fill="rgba(255,255,255,.2)"/>
      <g clip-path="${cp}">${lvl(a.level, `<rect x="0" y="24" width="52" height="70" fill="${k.cyl(a.color)}"/>`)}<rect x="8" y="52" width="32" height="22" fill="#f7efdc"/>
        <path d="M24 58l2 4 3-1-1 4 3 1-4 2 1 3h-3v3h-2v-3h-3l1-3-4-2 3-1-1-4 3 1z" fill="#c8323a"/></g>
      <path d="${body}" fill="none" ${EDGE}/><rect x="16" y="0" width="14" height="7" rx="2" fill="${k.cyl(a.accent)}"/>${hl(12, 34, 3.5, 46, 0.45)}`);
  },
  wine(a) {
    const k = new Kit();
    const body = 'M14 2H22V26Q22 32 28 38Q32 42 32 50V92Q32 98 26 98H10Q4 98 4 92V50Q4 42 8 38Q14 32 14 26Z';
    return k.out(36, 100, `${k.shadow(18, 97, 14, 2.5)}
      <path d="${body}" fill="${k.cyl(a.color)}" ${EDGE}/>
      <rect x="13" y="0" width="10" height="16" rx="1.5" fill="${k.cyl(a.accent)}"/>
      <rect x="6" y="56" width="24" height="26" rx="1.5" fill="#f4ecdb"/><path d="M18 61l3 4-3 4-3-4z" fill="${a.accent}"/>${label(11, 73, 14, '#6a5a4a')}
      ${hl(8, 46, 2.5, 42, 0.35)}`);
  },
  beer(a) {
    const k = new Kit();
    const body = 'M15 4H23V20Q23 26 28 30Q32 34 32 42V88Q32 94 26 94H12Q6 94 6 88V42Q6 34 10 30Q15 26 15 20Z';
    return k.out(38, 96, `${k.shadow(19, 93, 14, 2.5)}
      <path d="${body}" fill="${k.cyl(a.color)}" ${EDGE}/>
      <rect x="14" y="1" width="10" height="5" rx="1" fill="${k.cyl('#d9b44a')}"/>
      <rect x="14" y="14" width="10" height="8" fill="${a.accent}"/>
      <path d="M6 52H32V76H6Z" fill="${face(k, a.accent)}"/>${label(10, 60, 16, '#fff')}${hl(9, 40, 2.5, 44, 0.35)}`);
  },
  can(a) {
    const k = new Kit();
    return k.out(40, 70, `${k.shadow(20, 67, 16, 2.5)}
      <path d="M6 12Q6 8 10 7H30Q34 8 34 12V60Q34 64 30 65H10Q6 64 6 60Z" fill="${k.cyl(a.color)}" ${EDGE}/>
      <path d="M6 12Q6 8 10 7H30Q34 8 34 12Z" fill="${k.cyl('#d5dadc')}"/><ellipse cx="20" cy="7.5" rx="10" ry="2" fill="#eef1f2" ${EDGE}/><path d="M17 7h5" stroke="#9aa3a8" stroke-width="1.4" stroke-linecap="round"/>
      <path d="M10 30q10 8 20-4" stroke="#fff" stroke-opacity=".85" stroke-width="2.2" fill="none" stroke-linecap="round"/>${hl(9, 14, 2.5, 42, 0.45)}`);
  },
  stock(a) {
    const k = new Kit();
    const cube = (x: number, y: number) => `<path d="M${x} ${y}l8-3 8 3-8 3z" fill="#f7dc8a"/><path d="M${x} ${y}v7l8 3v-7z" fill="#d9b44a"/><path d="M${x + 16} ${y}v7l-8 3v-7z" fill="#b8942a"/>`;
    return k.out(66, 52, `${k.shadow(33, 49, 30, 3)}
      <path d="M8 14L14 9H48L42 14Z" fill="${light(a.accent, 0.35)}" ${EDGE}/>
      <rect x="8" y="14" width="34" height="30" fill="${face(k, a.accent)}" ${EDGE}/>
      <path d="M42 14L48 9V39L42 44Z" fill="${dark(a.accent, 0.28)}" ${EDGE}/>${label(13, 22, 20, '#fff')}
      ${cube(34, 38)}${cube(46, 42)}`);
  },
  tofu(a) {
    const k = new Kit();
    return k.out(72, 50, `${k.shadow(36, 47, 32, 3)}
      <path d="M6 18H66L62 44H10Z" fill="rgba(210,228,240,.55)" ${EDGE}/>
      <path d="M18 22l6-5h28l-6 5z" fill="${light(a.color, 0.4)}"/><rect x="18" y="22" width="28" height="16" fill="${face(k, a.color)}"/><path d="M46 22l6-5v16l-6 5z" fill="${dark(a.color, 0.14)}"/>
      ${dots(scatter(14, 11, 20, 24, 24, 12), 0.9, dark(a.color, 0.2), a.color === '#f6f3ea' ? 0 : 0.7)}
      <rect x="6" y="26" width="60" height="7" fill="${face(k, a.accent)}" opacity=".92"/>${hl(9, 20, 2.5, 20, 0.45)}`);
  },
  frozenpeas(a) {
    return freezerBag(a, (x, y) => `<circle cx="${x}" cy="${y}" r="3.4" fill="#6fae3a"/><circle cx="${x - 1}" cy="${y - 1}" r="1" fill="#c5e59a"/>`, '#8fc25a');
  },
  frozenveg(a) {
    return freezerBag(a, (x, y, j) => (j % 4 === 0
      ? `<rect x="${x - 2.8}" y="${y - 2.8}" width="5.6" height="5.6" rx="1.2" fill="#ec8a2c"/>`
      : j % 4 === 1
        ? `<circle cx="${x}" cy="${y}" r="2.8" fill="#6fae3a"/>`
        : j % 4 === 2
          ? `<rect x="${x - 2}" y="${y - 2}" width="4" height="4" rx="1" fill="#efc94c"/>`
          : `<rect x="${x - 4}" y="${y - 1.4}" width="8" height="2.8" rx="1.4" fill="#4f8a3a"/>`), '#e8f0d8');
  },
  frozenspinach(a) {
    return freezerBag(a, (x, y) => `<path d="M${x - 4} ${y}q0-4 4-4t4 4-4 4-4-4z" fill="#2f6a2a"/><path d="M${x - 2} ${y - 1}q2-1 4 0" stroke="#5d9a45" stroke-width=".8" fill="none"/>`, '#3f7a3a');
  },
  frozenchips(a) {
    return freezerBag(a, (x, y, j) => `<rect x="${x - 1.6}" y="${y - 5}" width="3.2" height="10" rx="1" transform="rotate(${(j * 37) % 90 - 45} ${x} ${y})" fill="${a.color}"/>`, light(a.color, 0.3));
  },
  hashbrowns(a) {
    return freezerBag(a, (x, y) => `<ellipse cx="${x}" cy="${y}" rx="4" ry="3" fill="${a.color}"/>${dots([[x - 1.5, y - 0.5], [x + 1.5, y + 1]], 0.5, dark(a.color, 0.3))}`, light(a.color, 0.35));
  },
  frozenberries(a) {
    return freezerBag(a, (x, y, j) => `<circle cx="${x}" cy="${y}" r="3" fill="${['#4a3a7a', '#c93b54', '#3a2a44', '#d8433c'][j % 4]}"/>`, '#e4d6ec');
  },
  pizza(a) {
    const k = new Kit();
    return k.out(92, 44, `${k.shadow(46, 41, 42, 3)}
      <ellipse cx="46" cy="24" rx="42" ry="15" fill="${k.grad([[0, '#f1c27a'], [1, '#c8863a']])}" ${EDGE}/>
      <ellipse cx="46" cy="23" rx="36" ry="12" fill="${a.color}"/>
      ${scatter(9, 3, 16, 15, 58, 14).map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="5" ry="2.6" fill="#f7e6a8" opacity=".95"/>`).join('')}
      ${[[30, 20], [48, 16], [62, 24], [40, 28], [56, 30]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="4.2" ry="2.6" fill="#a82a2a"/><ellipse cx="${x}" cy="${y}" rx="3" ry="1.8" fill="#c8403a"/>`).join('')}
      ${[[36, 17], [54, 25]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="2.4" ry="1.3" transform="rotate(-30 ${x} ${y})" fill="#4f8a3a"/>`).join('')}`);
  },
  fishfingers(a) {
    const k = new Kit();
    return k.out(70, 60, `${k.shadow(35, 57, 32, 3)}
      <path d="M6 14L14 8H64L56 14Z" fill="${light(a.accent, 0.35)}" ${EDGE}/>
      <rect x="6" y="14" width="50" height="42" fill="${face(k, a.accent)}" ${EDGE}/>
      <path d="M56 14L64 8V50L56 56Z" fill="${dark(a.accent, 0.28)}" ${EDGE}/>${label(11, 22, 24, '#fff')}
      ${[0, 1, 2].map((j) => `<rect x="${12 + j * 4}" y="${34 + j * 5}" width="34" height="7" rx="2.5" fill="${ball(k, a.color)}" ${EDGE}/>`).join('')}`);
  },
  salt(a) {
    const k = new Kit();
    return k.out(56, 80, `${k.shadow(28, 77, 22, 3)}
      <rect x="8" y="14" width="40" height="62" rx="4" fill="${k.cyl(a.accent)}" ${EDGE}/>
      <ellipse cx="28" cy="14" rx="20" ry="4" fill="${light(a.accent, 0.3)}" ${EDGE}/>
      <path d="M31 12l2-6h7l-2 6z" fill="#c5cdd1" ${EDGE}/>
      <rect x="8" y="34" width="40" height="22" fill="${k.cyl('#fbfaf6')}"/>${label(14, 42, 22, dark(a.accent, 0.2))}${hl(12, 18, 3, 54, 0.35)}`);
  },
  grinder(a) {
    const k = new Kit();
    const wood = k.grad([[0, '#6a4428'], [0.3, '#a8764a'], [0.65, '#80542f'], [1, '#4a2e1a']], 'h');
    return k.out(40, 96, `${k.shadow(20, 93, 14, 2.5)}
      <path d="M11 92h18l-2-38q5-8 0-24h-14q-5 16 0 24z" fill="${wood}" ${EDGE}/>
      <rect x="9" y="50" width="22" height="5" rx="1.5" fill="#c5cdd1" ${EDGE}/>
      <path d="M13 30q7-6 14 0" fill="${wood}" ${EDGE}/><circle cx="20" cy="22" r="4" fill="${wood}" ${EDGE}/>${dots([[16, 88], [22, 89], [26, 87]], 0.8, a.color)}${hl(14, 58, 2, 28, 0.3)}`);
  },
  flattin(a) {
    const k = new Kit();
    return k.out(72, 46, `${k.shadow(36, 43, 32, 3)}
      <rect x="6" y="18" width="60" height="22" rx="9" fill="${k.cyl('#d5dadc')}" ${EDGE}/>
      <rect x="6" y="24" width="60" height="12" fill="${face(k, a.color)}"/>
      <path d="M26 30q6-5 14 0q-8 5-14 0zM40 30l5-3v6z" fill="#fff" opacity=".85"/>
      <ellipse cx="36" cy="18" rx="30" ry="5" fill="${k.grad([[0, '#f2f4f5'], [1, '#aab3b7']])}" ${EDGE}/>
      <ellipse cx="50" cy="17" rx="5" ry="2" fill="none" stroke="#8d969b" stroke-width="1.4"/>`);
  },
};

/** A round tub with a lid, the way oats and cocoa are sold. */
function canister(a: ArtSpec, picture: string): Drawn {
  const k = new Kit();
  return k.out(58, 80, `${k.shadow(29, 77, 24, 3)}
    <rect x="7" y="12" width="44" height="64" rx="4" fill="${k.cyl(a.accent)}" ${EDGE}/>
    <ellipse cx="29" cy="12" rx="22" ry="4.5" fill="${k.grad([[0, light(a.accent, 0.35)], [1, dark(a.accent, 0.1)]])}" ${EDGE}/>
    <rect x="7" y="30" width="44" height="30" fill="${k.cyl('#f6efe0')}"/>${picture}${hl(11, 16, 3, 56, 0.35)}`);
}

/** A crisp packet: a pillow crimped at both ends. */
function pillow(a: ArtSpec, picture: string): Drawn {
  const k = new Kit();
  let top = 'M10 13', bottom = 'M10 76';
  for (let x = 12; x <= 58; x += 2) {
    top += `L${x} ${x % 4 === 0 ? 8 : 13}`;
    bottom += `L${x} ${x % 4 === 0 ? 81 : 76}`;
  }
  return k.out(68, 88, `${k.shadow(34, 85, 28, 3)}
    <path d="${top}V76H10Z" fill="${light(a.accent, 0.15)}"/><path d="${bottom}V13H10Z" fill="${light(a.accent, 0.15)}"/>
    <path d="M10 13Q34 9 58 13Q62 44 58 76Q34 80 10 76Q6 44 10 13Z" fill="${face(k, a.accent)}" ${EDGE}/>
    <ellipse cx="34" cy="48" rx="17" ry="13" fill="#fff" opacity=".9"/>${picture}${label(20, 24, 26, '#fff')}${hl(13, 17, 3, 54, 0.4)}`);
}

/** Biscuits in a short stack, the top one showing what kind. */
function stackOf(a: ArtSpec, top: (k: Kit) => string, square = false): Drawn {
  const k = new Kit();
  const side = dark(a.color, 0.14);
  let s = '';
  for (let i = 3; i >= 1; i--) s += square ? `<path d="M10 ${26 + i * 3.5}l24-9 26 9-24 10z" fill="${side}" ${EDGE}/>` : `<ellipse cx="35" cy="${24 + i * 4}" rx="26" ry="9" fill="${side}" ${EDGE}/>`;
  return k.out(70, 48, `${k.shadow(35, 45, 30, 3)}${s}${top(k)}`);
}

/** A slim glass bottle for oils and vinegars. */
function tallBottle(a: ArtSpec, picture: string, cap: string): Drawn {
  const k = new Kit();
  const body = 'M18 2H26V18Q26 22 30 26Q36 32 36 40V90Q36 96 30 96H14Q8 96 8 90V40Q8 32 14 26Q18 22 18 18Z';
  const cp = k.clip(`<path d="${body}"/>`);
  return k.out(44, 100, `${k.shadow(22, 97, 18, 3)}<path d="${body}" fill="rgba(255,255,255,.2)"/>
    <g clip-path="${cp}">${lvl(a.level, `<rect x="0" y="24" width="44" height="76" fill="${k.cyl(a.color)}"/>`)}<rect x="8" y="54" width="28" height="28" fill="#f6efe0"/>${picture}</g>
    <path d="${body}" fill="none" ${EDGE}/><rect x="16" y="0" width="12" height="7" rx="2" fill="${k.cyl(cap)}"/>${hl(12, 32, 3, 56, 0.45)}`);
}

export const FOOD_ART: Record<string, (a: ArtSpec) => Drawn> = {
  ...Object.fromEntries(Object.entries(SMALL).map(([id, one]) => [id, (a: ArtSpec) => loose(a, one)])),
  ...Object.fromEntries(Object.entries(LONG).map(([id, one]) => [id, (a: ArtSpec) => piled(a, one)])),
  ...WHOLE,
};
