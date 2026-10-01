import { Capacitor, registerPlugin } from '@capacitor/core';

/*
 * The small things that make the app feel like it was made for the iPhone
 * rather than a web page in a frame:
 *
 * - The keyboard. The web view shrinks above it (capacitor.config.ts), so a
 *   sheet's field rises with it instead of hiding under it; the tab bar steps
 *   away while typing, as it would in any app; the field being typed in is
 *   kept in view; the web-form bar above the keys is gone; and a tap anywhere
 *   that is not a field puts the keyboard away.
 * - The status bar. Tapping it scrolls what is on screen back to the top
 *   (the web view cannot do this itself: the app's lists scroll inside the
 *   page, not the page itself).
 * - Swiping in from the left edge goes back, on screens that have somewhere to
 *   go back to, and does nothing on the four tabs, as in any tab-bar app.
 * - A light tap of haptics on changing tabs and when something is done.
 *
 * All of it is the phone's; in a browser every call here does nothing.
 */

const native = Capacitor.isNativePlatform();

const FIELDS = 'input, textarea, select, [contenteditable="true"]';

export async function setUpNative(): Promise<void> {
  if (!native) return;
  const root = document.documentElement;
  root.classList.add('native');
  // an app's screens do not pinch-zoom like a web page (the phone's own Zoom still works)
  document.querySelector('meta[name="viewport"]')?.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');

  const { Keyboard } = await import('@capacitor/keyboard');
  void Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => undefined);
  void Keyboard.addListener('keyboardWillShow', ({ keyboardHeight }) => {
    root.classList.add('kb-open');
    root.style.setProperty('--kb-h', `${Math.round(keyboardHeight)}px`);
  });
  void Keyboard.addListener('keyboardDidShow', () => {
    // once the view has shrunk, bring the field being typed in to the middle of what is left
    const field = document.activeElement;
    if (field instanceof HTMLElement && field.matches(FIELDS)) field.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
  void Keyboard.addListener('keyboardWillHide', () => {
    root.classList.remove('kb-open');
    root.style.setProperty('--kb-h', '0px');
  });

  // a tap on anything but a field puts the keyboard away, as it does in Messages or Notes
  document.addEventListener(
    'touchstart',
    (event) => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !active.matches(FIELDS)) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(`${FIELDS}, label`)) return;
      active.blur();
    },
    { capture: true, passive: true },
  );

  // the status bar: back to the top of whatever scrolls in the middle of the screen, an open sheet included
  window.addEventListener('statusTap', () => scrollerOnScreen()?.scrollTo({ top: 0, behavior: 'smooth' }));
}

function scrollerOnScreen(): HTMLElement | null {
  let el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
  for (; el && el !== document.body; el = el.parentElement) {
    if (el instanceof HTMLElement && el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(el).overflowY)) return el;
  }
  return null;
}

/* ---------- haptics ---------- */

const haptics = native ? import('@capacitor/haptics') : null;

/** The tick of a picker wheel: for choosing between things, like tabs. */
export function tick(): void {
  void haptics?.then(({ Haptics }) => Haptics.selectionChanged()).catch(() => undefined);
}

/** Something was done and can be undone: logged, cooked, put away. */
export function done(): void {
  void haptics?.then(({ Haptics, NotificationType }) => Haptics.notification({ type: NotificationType.Success })).catch(() => undefined);
}

/* ---------- swiping back ---------- */

interface SwipeBackPlugin {
  setEnabled(options: { enabled: boolean }): Promise<void>;
}
const SwipeBack = registerPlugin<SwipeBackPlugin>('SwipeBack');

/** The four tabs: nothing to swipe back to from these. */
const TAB_ROOTS = new Set(['/', '/pantry', '/shopping', '/eaten']);

/** Edge-swipe back on screens opened from somewhere, off on the tabs themselves. */
export function allowSwipeBack(pathname: string): void {
  if (!native) return;
  void SwipeBack.setEnabled({ enabled: !TAB_ROOTS.has(pathname) && window.history.length > 1 }).catch(() => undefined);
}
