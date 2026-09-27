import { createHash } from 'node:crypto';

/**
 * Pantry2Plate Plus, while payments are switched off: unlocked by a code.
 *
 * Only a SHA-256 of each code lives here, so a code cannot be read out of the
 * source or the app. Codes compare without case, spaces or dashes.
 * PLUS_CODE, when set, is one more accepted code (the test suite uses it).
 */
const CODE_HASHES = new Set([
  // the owner's test code, 2026-09-27
  'dda8572d8569ad1679fbc359386fdf72aa228b489c30de1f1dc6cb1314cb7f56',
]);

export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isPlusCode(code: string): boolean {
  const normalized = normalizeCode(code);
  if (!normalized) return false;
  const extra = process.env.PLUS_CODE;
  if (extra && normalizeCode(extra) === normalized) return true;
  return CODE_HASHES.has(createHash('sha256').update(normalized).digest('hex'));
}
