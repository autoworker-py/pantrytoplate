/**
 * The last known account, kept on disk.
 *
 * The app used to render nothing at all until /api/auth/me answered, so the
 * first thing you saw on every launch was a blank "Loading…" that lasted as
 * long as the network felt like taking. But the answer barely changes, and we
 * already hold a token proving who you are — there is no reason to ask the
 * server before drawing the interface.
 *
 * So the account is cached here and the app opens from it immediately, with the
 * server consulted afterwards to correct anything that moved.
 */
import { ApiError } from './api';

/**
 * Whether a failed identity check should end the session.
 *
 * Only the server actively rejecting the token counts. Every failure used to
 * sign the person out, so one moment without signal during launch threw away a
 * valid login and dropped them at the sign-in screen. Not reaching the server
 * tells us nothing about whether the token is good.
 */
export function shouldEndSession(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

export interface CachedUser {
  id: string;
  email: string;
  onboarded: boolean;
  privacyCurrent: boolean;
}

const USER_KEY = 'pantry.user';

export const sessionStore = {
  get(): CachedUser | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CachedUser;
      // a half-written or outdated shape must not boot the app into a bad state
      if (typeof parsed?.id !== 'string' || typeof parsed?.email !== 'string') return null;
      return {
        id: parsed.id,
        email: parsed.email,
        onboarded: Boolean(parsed.onboarded),
        privacyCurrent: Boolean(parsed.privacyCurrent),
      };
    } catch {
      return null;
    }
  },
  set(user: CachedUser) {
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {
      // a full or unavailable store costs us the fast path, nothing more
    }
  },
  clear() {
    localStorage.removeItem(USER_KEY);
  },
};
