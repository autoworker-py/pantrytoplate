/*
 * The drawing kit every food picture is made with: gradients that light a
 * shape from the upper left, a soft shadow to stand it on, a thin edge, and
 * the white highlight bars that make glass and plastic read as shiny.
 */

let seq = 0;
const uid = (p: string) => `${p}${(++seq).toString(36)}`;
export const EDGE = 'stroke="rgba(20,22,26,.28)" stroke-width=".8" stroke-linejoin="round"';

export function mix(hex: string, to: string, amount: number): string {
  const a = parseInt(hex.slice(1), 16), b = parseInt(to.slice(1), 16);
  const ch = (x: number, shift: number) => (x >> shift) & 255;
  const m = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * amount);
  return `#${((1 << 24) | (m(16) << 16) | (m(8) << 8) | m(0)).toString(16).slice(1)}`;
}
export const light = (c: string, a = 0.35) => mix(c, '#ffffff', a);
export const dark = (c: string, a = 0.3) => mix(c, '#000000', a);

export class Kit {
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

export const hl = (x: number, y: number, w: number, h: number, o = 0.6) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(w, h) / 2}" fill="#fff" opacity="${o}"/>`;
export const lvl = (level: number, inner: string) => `<g class="lvl" style="transform:scaleY(${level})">${inner}</g>`;
export const gone = (i: number, n: number) => `class="gone-able${i >= n ? ' gone' : ''}" data-i="${i}"`;

export type Drawn = { w: number; h: number; svg: string };
