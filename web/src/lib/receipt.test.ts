import { describe, expect, it } from 'vitest';
import vision from './__fixtures__/receipt-vision.json';
import { joinPhotos, lineKey, matchLine, parseReceipt, standsFor, toRows, type TextPiece } from './receipt';

const piece = (text: string, x: number, y: number, h = 0.02): TextPiece => ({ text, x, y, w: 0.3, h });

describe('rows from pieces', () => {
  it('joins a name and its price printed on one line, left to right', () => {
    const rows = toRows([piece('3.48 N', 0.7, 0.301), piece('WHL MLK 1GAL', 0.1, 0.3), piece('5.29 N', 0.7, 0.33), piece('GRK YGRT PLN 32OZ', 0.1, 0.331)]);
    expect(rows).toEqual(['WHL MLK 1GAL  3.48 N', 'GRK YGRT PLN 32OZ  5.29 N']);
  });
});

describe('item lines', () => {
  const lines = parseReceipt([
    'CORNER GROCER',
    '1400 MAIN ST',
    'WHL MLK 1GAL  3.48 N',
    'BNLS SKNLS CHKN BRST 0001234567 9.87 F',
    'AVOCADO 3 @ .89  2.67',
    'BANANAS  1.36 F',
    '2.31 LB @ 0.59 /LB',
    'BAG FEE  0.10',
    'COUPON  1.00-',
    'SUBTOTAL  61.24',
    'TAX  2.10',
    'VISA  63.34',
  ]);

  it('keeps items and drops the header, discounts, totals and payment', () => {
    expect(lines.map((l) => l.text)).toEqual(['WHL MLK 1GAL', 'BNLS SKNLS CHKN BRST', 'AVOCADO', 'BANANAS', 'BAG FEE']);
  });

  it('reads pack sizes, counts and weights', () => {
    expect(lines[0].measure).toEqual({ quantity: 1, unit: 'gallon', byWeight: false });
    expect(lines[2].count).toBe(3);
    expect(lines[3].measure).toEqual({ quantity: 2.31, unit: 'lb', byWeight: true });
    expect(lines[0].price).toBe('3.48');
  });

  it('marks fees, which are skipped unless the person says otherwise', () => {
    expect(lines[4].fee).toBe(true);
    expect(lines[0].fee).toBe(false);
  });

  it('keys a line on its words, whatever the amount this time', () => {
    expect(lineKey('BANANAS 2.31 LB')).toBe('BANANAS');
    expect(lineKey('GRK YGRT PLN 32OZ')).toBe('GRK YGRT PLN');
  });
});

describe('two photos of one long receipt', () => {
  it('drops the lines the second photo repeats', () => {
    const [a, b, c] = parseReceipt(['MILK  3.48', 'EGGS  4.99', 'BREAD  2.50']);
    expect(joinPhotos([a, b], [b, c]).map((l) => l.text)).toEqual(['MILK', 'EGGS', 'BREAD']);
  });
});

describe('matching shorthand to what was bought before', () => {
  const bought = [
    { id: 'milk', name: 'Whole Milk', category: 'Dairy & Eggs' },
    { id: 'oat', name: 'Oat Milk', category: 'Beverages' },
    { id: 'yog', name: 'Plain Greek Yogurt', category: 'Dairy & Eggs' },
    { id: 'chk', name: 'Chicken Breast', category: 'Meat & Seafood' },
    { id: 'thigh', name: 'Chicken Thighs', category: 'Meat & Seafood' },
    { id: 'ched', name: 'Cheddar Cheese', category: 'Cheese' },
    { id: 'butter', name: 'Butter', category: 'Dairy & Eggs' },
    { id: 'peas', name: 'Frozen Peas', category: 'Frozen' },
  ];

  it('reads dropped vowels and cut words', () => {
    expect(standsFor('YGRT', 'YOGURT')).toBe(true);
    expect(standsFor('SPAGH', 'SPAGHETTI')).toBe(true);
    expect(standsFor('BRST', 'THIGH')).toBe(false);
  });

  it('is sure when every word is accounted for', () => {
    expect(matchLine('GRK YGRT PLN 32OZ', bought)).toEqual({ food: bought[2], sure: true });
    expect(matchLine('BNLS SKNLS CHKN BRST', bought)).toEqual({ food: bought[3], sure: true });
    expect(matchLine('SHRP CHDR 8OZ', bought)).toEqual({ food: bought[5], sure: true });
    expect(matchLine('WHL MLK 1GAL', bought)).toEqual({ food: bought[0], sure: true });
    expect(matchLine('FRZ PEAS 12OZ', bought)).toEqual({ food: bought[7], sure: true });
  });

  it('only suggests when something on the line is unexplained', () => {
    expect(matchLine('OAT MLK BARISTA', bought)).toEqual({ food: bought[1], sure: false });
    expect(matchLine('PNT BTR CRNCHY', bought)).toEqual({ food: bought[6], sure: false });
  });

  it('offers nothing for a thing never bought', () => {
    expect(matchLine('SRIRACHA 17OZ', bought)).toBeNull();
  });

  it('never lets a describing word name the food', () => {
    expect(matchLine('KS ORG EGGS 24CT', [{ id: 'oregano', name: 'Dried Oregano', category: 'Spices' }])).toBeNull();
  });
});

describe('a real reading', () => {
  // Apple's text recognition run on a photographed test receipt: names and prices come back as separate pieces
  const lines = parseReceipt(toRows(vision as TextPiece[]));

  it('finds every item and nothing else', () => {
    expect(lines.map((l) => l.text)).toEqual([
      'WHL MLK 1GAL', 'GRK YGRT PLN 32OZ', 'BNLS SKNLS CHKN BRST', 'KS ORG EGGS 24CT', 'SHRP CHDR 8OZ',
      'BANANAS', 'SPAGHETTI 16OZ', 'UNSLTD BUTTER 4PK', 'AVOCADO', 'BAG FEE',
    ]);
  });

  it('pairs each item with its price, count and size', () => {
    expect(lines.map((l) => l.price)).toEqual(['3.48', '5.29', '9.87', '7.49', '2.98', '1.36', '1.28', '4.64', '2.67', '0.10']);
    expect(lines[1].measure).toEqual({ quantity: 32, unit: 'oz', byWeight: false });
    expect(lines[5].measure).toEqual({ quantity: 2.31, unit: 'lb', byWeight: true });
    expect(lines[8].count).toBe(3);
    expect(lines[9].fee).toBe(true);
  });
});
