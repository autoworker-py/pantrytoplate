/**
 * The daily nudge, delivered as best the browser allows.
 *
 * Real background push needs a push service and VAPID keys on the server. Until
 * those exist this does the honest version: when the app is opened, it asks the
 * server what is about to go off and shows it — as a system notification if
 * permission was granted, and in the app either way.
 *
 * Shown at most once a day, because a reminder you see five times is one you
 * start ignoring.
 */
const LAST_SHOWN = 'pantry.lastDigest';

export interface Digest {
  headline: string | null;
  expiring: Array<{ name: string; daysUntilExpiration: number | null }>;
  rescueRecipes: Array<{ id: string; name: string; uses: string[]; totalMinutes: number | null }>;
  runningOut: Array<{ name: string; daysLeft: number }>;
}

function shownToday(): boolean {
  const last = localStorage.getItem(LAST_SHOWN);
  return last === new Date().toDateString();
}

export function markShown() {
  localStorage.setItem(LAST_SHOWN, new Date().toDateString());
}

/** Show the digest as a system notification if we are allowed to. */
export function notifyDigest(digest: Digest): boolean {
  if (!digest.headline || shownToday()) return false;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;

  const rescue = digest.rescueRecipes[0];
  new Notification('Use it or lose it', {
    body: rescue ? `${digest.headline}` : digest.headline,
    icon: '/icon.svg',
    tag: 'pantry-digest',
  });
  markShown();
  return true;
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/service-worker.js');
  } catch {
    // an app that works without it is better than one that refuses to start
  }
}
