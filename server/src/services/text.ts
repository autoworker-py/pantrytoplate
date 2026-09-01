/**
 * Cleaning up text that came from a web page.
 *
 * Imported recipes arrive as HTML, and the parts that survive into a plain
 * string are exactly the parts that look broken in the app: a stray `<span>`
 * around a quantity, `&amp;` where an ampersand belongs, `&frac12;` where the
 * recipe plainly said half. Left alone they do more than look untidy - an
 * ingredient line reading "&frac12; cups milk" loses its quantity entirely,
 * because the parser never sees a number.
 *
 * So this runs before anything tries to understand the text, on both steps and
 * ingredient lines.
 */

/** Named entities worth knowing, plus the fractions recipes actually use. */
const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '-', mdash: '-', hellip: '...', middot: '·', bull: '·',
  lsquo: "'", rsquo: "'", ldquo: '"', rdquo: '"', deg: '°',
  frac12: '½', frac13: '⅓', frac14: '¼', frac23: '⅔', frac34: '¾',
  frac18: '⅛', frac38: '⅜', frac58: '⅝', frac78: '⅞',
  times: 'x', divide: '/', plusmn: '+/-',
};

/** `&amp;` -> `&`, `&#39;` -> `'`, `&#x2153;` -> the fraction. */
export function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      // a nonsensical code point must not become a replacement character in a
      // recipe; leaving the original text is the lesser harm
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return whole;
      try {
        return String.fromCodePoint(code);
      } catch {
        return whole;
      }
    }
    const named = NAMED[body.toLowerCase()];
    return named ?? whole;
  });
}

/**
 * Remove markup, keeping the words apart.
 *
 * Tags become a space rather than nothing: "2<br>eggs" is two things, and
 * deleting the tag outright would weld them into "2eggs".
 */
export function stripHtml(input: string): string {
  return input
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ');
}

/** Everything above, then whitespace collapsed. Safe to run twice. */
export function sanitizeImportedText(input: string): string {
  // decode first so an encoded tag (&lt;b&gt;) is stripped rather than shown,
  // then decode again for entities that were themselves encoded
  return decodeEntities(stripHtml(decodeEntities(input)))
    .replace(/\s+/g, ' ')
    .trim();
}
