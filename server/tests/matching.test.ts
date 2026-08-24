import { describe, expect, it } from 'vitest';
import { matchFood, normalizeName, similarity, singularize } from '../src/services/matching.js';

const catalog = [
  { id: 'f1', name: 'All-Purpose Flour', nameNorm: normalizeName('All-Purpose Flour') },
  { id: 'f2', name: 'Granulated Sugar', nameNorm: normalizeName('Granulated Sugar') },
  { id: 'f3', name: 'Egg', nameNorm: normalizeName('Egg') },
  { id: 'f4', name: 'Whole Milk', nameNorm: normalizeName('Whole Milk') },
  { id: 'f5', name: 'Yellow Onion', nameNorm: normalizeName('Yellow Onion') },
];

const synonyms = new Map([
  [normalizeName('ap flour'), 'f1'],
  [normalizeName('plain flour'), 'f1'],
  [normalizeName('caster sugar'), 'f2'],
]);

describe('singularize', () => {
  it('handles regular and irregular plurals', () => {
    expect(singularize('eggs')).toBe('egg');
    expect(singularize('tomatoes')).toBe('tomato');
    expect(singularize('berries')).toBe('berry');
    expect(singularize('peaches')).toBe('peach');
    expect(singularize('leaves')).toBe('leaf');
  });

  it('leaves words that only look plural alone', () => {
    expect(singularize('molasses')).toBe('molasses');
    expect(singularize('hummus')).toBe('hummus');
    expect(singularize('oats')).toBe('oats');
  });
});

describe('normalizeName', () => {
  it('lowercases, strips punctuation and de-pluralises', () => {
    expect(normalizeName('  Large EGGS ')).toBe('egg');
    expect(normalizeName('All-Purpose Flour')).toBe('all purpose flour');
    expect(normalizeName('Organic Fresh Tomatoes')).toBe('tomato');
  });

  it('never reduces a name to nothing', () => {
    expect(normalizeName('organic')).toBe('organic');
    expect(normalizeName('')).toBe('');
  });
});

describe('matchFood', () => {
  it('matches exactly, ignoring case and pluralisation', () => {
    const result = matchFood('eggs', catalog, synonyms);
    expect(result.match?.id).toBe('f3');
    expect(result.method).toBe('exact');
  });

  it('matches through the synonyms table', () => {
    const result = matchFood('AP flour', catalog, synonyms);
    expect(result.match?.id).toBe('f1');
    expect(result.method).toBe('synonym');
  });

  it('falls back to fuzzy matching for near misses', () => {
    const result = matchFood('all purpose flor', catalog, synonyms);
    expect(result.match?.id).toBe('f1');
    expect(result.method).toBe('fuzzy');
    expect(result.score).toBeGreaterThan(0.72);
  });

  it('matches a bare ingredient name against a qualified catalog entry', () => {
    expect(matchFood('milk', catalog, synonyms).match?.id).toBe('f4');
    expect(matchFood('onion', catalog, synonyms).match?.id).toBe('f5');
  });

  it('declines rather than forcing a bad match', () => {
    const result = matchFood('sriracha', catalog, synonyms);
    expect(result.match).toBeNull();
    expect(result.method).toBe('none');
  });

  it('does not confuse flour with sugar', () => {
    expect(similarity('flour', 'sugar')).toBeLessThan(0.72);
    expect(matchFood('flour', catalog, synonyms).match?.id).toBe('f1');
  });
});
