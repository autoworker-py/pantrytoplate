/**
 * Formatting of imported recipes.
 *
 * Reported as "sometimes there's a formatting issue" on your own uploads. It
 * was markup: recipe pages hand us HTML, and the fragments that survive into a
 * plain string are exactly the ones that look wrong. Worse than looking wrong,
 * an entity swallows the quantity - "&frac12; cups milk" has no number in it
 * until it is decoded, so the amount silently became 1.
 */
import { describe, expect, it } from 'vitest';
import { decodeEntities, sanitizeImportedText, stripHtml } from '../src/services/text.js';
import { parseIngredientLine } from '../src/services/ingredientParser.js';
import { tidySteps } from '../src/services/recipeImport.js';

describe('sanitising text from a web page', () => {
  it('decodes the entities recipe sites actually emit', () => {
    expect(decodeEntities('Salt &amp; pepper')).toBe('Salt & pepper');
    expect(decodeEntities('Jamie&#39;s sauce')).toBe("Jamie's sauce");
    expect(decodeEntities('180&deg;C')).toBe('180°C');
    expect(decodeEntities('&frac12; cup')).toBe('½ cup');
    expect(decodeEntities('&frac34; cup')).toBe('¾ cup');
    expect(decodeEntities('caf&#xe9;')).toBe('café');
  });

  it('leaves text it does not recognise alone rather than mangling it', () => {
    expect(decodeEntities('5 &notarealentity; things')).toBe('5 &notarealentity; things');
    expect(decodeEntities('a & b')).toBe('a & b');
    expect(decodeEntities('&#99999999999;')).toBe('&#99999999999;');
  });

  it('removes tags but keeps the words apart', () => {
    expect(stripHtml('<p>Heat the oil.</p>').trim()).toBe('Heat the oil.');
    // deleting the tag outright would weld these into "2eggs"
    expect(sanitizeImportedText('2<br>eggs')).toBe('2 eggs');
    expect(sanitizeImportedText('<script>alert(1)</script>Warm the milk.')).toBe('Warm the milk.');
  });

  it('is safe to run twice', () => {
    const once = sanitizeImportedText('Salt &amp; pepper');
    expect(sanitizeImportedText(once)).toBe(once);
  });
});

describe('ingredient lines from imported recipes', () => {
  it('reads a quantity hidden behind an entity', () => {
    // the bug: this parsed as quantity 1, unit count, losing half the milk
    const parsed = parseIngredientLine('1 &frac12; cups milk');
    expect(parsed.quantity).toBe(1.5);
    expect(parsed.unit).toBe('cup');
    expect(parsed.name).toBe('milk');
  });

  it('reads a quantity wrapped in markup', () => {
    const parsed = parseIngredientLine('<span>200g</span> chicken breast');
    expect(parsed.quantity).toBe(200);
    expect(parsed.unit).toBe('g');
    expect(parsed.name).toBe('chicken breast');
  });

  it('reads a quantity written against its unit', () => {
    // "200g" is written without a space at least as often as with one
    expect(parseIngredientLine('200g chicken breast')).toMatchObject({ quantity: 200, unit: 'g' });
    expect(parseIngredientLine('1kg potatoes')).toMatchObject({ quantity: 1, unit: 'kg' });
    expect(parseIngredientLine('500ml stock')).toMatchObject({ quantity: 500, unit: 'ml' });
    expect(parseIngredientLine('2tbsp olive oil')).toMatchObject({ quantity: 2, unit: 'tbsp' });
  });

  it('does not mistake a tin size or an oven temperature for a quantity', () => {
    expect(parseIngredientLine('Bake in a 9x13 dish').quantityFound).toBe(false);
    expect(parseIngredientLine('350F oven').quantityFound).toBe(false);
  });

  it('keeps an ampersand readable', () => {
    expect(parseIngredientLine('Salt &amp; pepper to taste').name).toBe('Salt & pepper to taste');
  });
});

describe('method steps from imported recipes', () => {
  it('strips markup that survived into the step text', () => {
    expect(tidySteps(['<p>Heat the oil.</p>', '<strong>Add garlic</strong> and cook 1 minute.'])).toEqual([
      'Heat the oil.',
      'Add garlic and cook 1 minute.',
    ]);
  });

  it('keeps a bulleted method as separate steps', () => {
    // this came out as ["Rinse the rice Drain thoroughly", "Add to the pan"]
    expect(tidySteps(['• Rinse the rice', '- Drain thoroughly', '– Add to the pan'])).toEqual([
      'Rinse the rice',
      'Drain thoroughly',
      'Add to the pan',
    ]);
  });

  it('still folds a heading into the step it introduces', () => {
    expect(tidySteps(['For the sauce:', 'Melt the butter.'])).toEqual(['For the sauce: Melt the butter.']);
  });

  it('decodes entities in the method', () => {
    expect(tidySteps(['Heat to 180&deg;C and bake.'])).toEqual(['Heat to 180°C and bake.']);
  });
});
