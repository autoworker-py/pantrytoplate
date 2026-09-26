/*
 * The door opens once per visit, the first time a fridge appears. After that
 * the app stays open: re-animating on every tab switch would be a toll, not a
 * delight.
 */
const KEY = 'pantry.door-opened';
let grantedAt = 0;

export function firstDoorThisSession(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  // development renders twice on purpose; the second ask is the same visit
  if (Date.now() - grantedAt < 800) return true;
  try {
    if (sessionStorage.getItem(KEY)) return false;
    sessionStorage.setItem(KEY, '1');
    grantedAt = Date.now();
    return true;
  } catch {
    return false;
  }
}
