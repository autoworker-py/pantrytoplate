import { describe, expect, it } from 'vitest';
import { artFor, drawArt, type ArtSpec } from './art';
import { FOOD_ART } from './art-foods';

/** How many numbers each path command takes; a path short of them is dropped by the browser from that point on. */
const ARITY: Record<string, number> = { m: 2, l: 2, t: 2, h: 1, v: 1, c: 6, s: 4, q: 4, a: 7, z: 0 };
const TOKEN = /[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g;

function brokenPaths(svg: string): string[] {
  const broken: string[] = [];
  for (const [, d] of svg.matchAll(/ d="([^"]*)"/g)) {
    if (d.replace(TOKEN, '').replace(/[\s,]/g, '') !== '') {
      broken.push(d);
      continue;
    }
    let command = '', count = 0, ok = true;
    const complete = () => {
      if (!command) return true;
      const need = ARITY[command.toLowerCase()];
      return need === 0 ? count === 0 : count > 0 && count % need === 0;
    };
    for (const token of d.match(TOKEN) ?? []) {
      if (/[a-zA-Z]/.test(token)) {
        ok &&= complete();
        command = token;
        count = 0;
      } else count++;
    }
    if (!ok || !complete()) broken.push(d);
  }
  return broken;
}

describe('food drawings', () => {
  it('draws every food picture with whole, valid shapes, however many are left', () => {
    for (const [shape, draw] of Object.entries(FOOD_ART)) {
      for (const n of [1, 3, 12]) {
        for (const level of [0.2, 1]) {
          const spec: ArtSpec = { kind: 'jar', shape, n, level, color: '#c9974a', accent: '#4f7cae' };
          const { svg, w, h } = draw(spec);
          expect(w > 0 && h > 0, shape).toBe(true);
          expect(svg, shape).not.toMatch(/NaN|undefined/);
          expect(brokenPaths(svg), shape).toEqual([]);
        }
      }
    }
  });

  it('picks the food itself, and not a food that shares a word with it', () => {
    const shape = (name: string, category: string | null, unit = 'g') => artFor({ name, category, quantity: 1, unit }).shape;
    expect(shape('Broccoli', 'Produce')).toBe('broccoli');
    expect(shape('Pineapple', 'Fruit')).toBe('pineapple');
    expect(shape('Black Pepper', 'Spices')).toBe('grinder');
    expect(shape('Egg Noodles', 'Pasta')).toBe('nests');
    expect(shape('Semisweet Chocolate Chips', 'Baking')).not.toBe('can');
    expect(shape('Lemongrass', 'Produce')).not.toBe('lemon');
    expect(shape('Apple Sauce', 'Condiments')).not.toBe('apple');
    expect(shape('Chicken Stock', 'Condiments')).not.toBe('breast');
    expect(artFor({ name: 'Orange Juice', category: 'Beverages', quantity: 1, unit: 'l' }).kind).toBe('carton');
  });

  it('shows each one left of a counted food, and a full set of a weighed one unless it is running low', () => {
    expect(artFor({ name: 'Apple', category: 'Fruit', quantity: 4, unit: 'count' }).n).toBe(4);
    expect(artFor({ name: 'Carrot', category: 'Produce', quantity: 500, unit: 'g' }).n).toBeGreaterThan(5);
    expect(artFor({ name: 'Carrot', category: 'Produce', quantity: 50, unit: 'g', isLowStock: true }).n).toBe(1);
    expect(drawArt(artFor({ name: 'Apple', category: 'Fruit', quantity: 4, unit: 'count' })).svg.match(/gone-able gone/g)).toHaveLength(2);
  });
});
