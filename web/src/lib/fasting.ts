import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { LiveActivity, ensurePermission } from './cookTimer';
import type { FastingPlan } from './types';

/*
 * Intermittent fasting on a daily clock: an eating window that opens at the
 * same time each day for a set number of hours, and a fast the rest of the
 * day. Everything here is worked out on the phone from the plan and the
 * window's start; the server only keeps the settings.
 */

export const PLANS: Array<{ plan: FastingPlan; fast: number; eat: number; note: string }> = [
  { plan: '12:12', fast: 12, eat: 12, note: 'A gentle start: dinner to breakfast' },
  { plan: '14:10', fast: 14, eat: 10, note: 'A little later breakfast' },
  { plan: '16:8', fast: 16, eat: 8, note: 'The usual one: skip breakfast' },
  { plan: '18:6', fast: 18, eat: 6, note: 'Two meals, close together' },
  { plan: '20:4', fast: 20, eat: 4, note: 'Hard going; most people don’t need it' },
];

const HOUR = 3_600_000;
const eatHours = (plan: FastingPlan) => PLANS.find((p) => p.plan === plan)?.eat ?? 8;

export interface FastingState {
  phase: 'fasting' | 'eating';
  /** when this phase began and when it ends */
  since: Date;
  until: Date;
}

/** Where the day's clock stands: fasting or eating, since when and until when. */
export function fastingState(plan: FastingPlan, start: string, now = new Date()): FastingState {
  const [h, m] = start.split(':').map(Number);
  const opens = new Date(now);
  opens.setHours(h ?? 12, m ?? 0, 0, 0);
  const eat = eatHours(plan) * HOUR;
  const closes = new Date(opens.getTime() + eat);
  if (now >= opens && now < closes) return { phase: 'eating', since: opens, until: closes };
  if (now < opens) {
    // before today's window: the fast began when yesterday's closed
    return { phase: 'fasting', since: new Date(closes.getTime() - 24 * HOUR), until: opens };
  }
  return { phase: 'fasting', since: closes, until: new Date(opens.getTime() + 24 * HOUR) };
}

export const clockTime = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** "13:20" for a span of time: hours and minutes. */
export function span(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

const OPENS_ID = 7101;
const CLOSES_ID = 7102;

/**
 * The two daily notifications, opening and closing the window, set again from
 * scratch so they always match the plan. Off, or no plan: none.
 */
export async function scheduleFasting(plan: FastingPlan | null, start: string | null, notify: boolean): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: OPENS_ID }, { id: CLOSES_ID }] });
  } catch {
    // nothing scheduled yet
  }
  if (!plan || !start || !notify) return false;
  if (!(await ensurePermission())) return false;
  const [h, m] = start.split(':').map(Number);
  const closes = new Date();
  closes.setHours(h ?? 12, m ?? 0, 0, 0);
  closes.setTime(closes.getTime() + eatHours(plan) * HOUR);
  try {
    await LocalNotifications.schedule({
      notifications: [
        { id: OPENS_ID, title: 'Your eating window is open', body: `Eat until ${clockTime(closes)}.`, schedule: { on: { hour: h ?? 12, minute: m ?? 0 }, allowWhileIdle: true } },
        { id: CLOSES_ID, title: 'Your fast starts now', body: `Next meal at ${clockTime(new Date(closes.getTime() - eatHours(plan) * HOUR))}.`, schedule: { on: { hour: closes.getHours(), minute: closes.getMinutes() }, allowWhileIdle: true } },
      ],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * The fast on the Lock Screen and in the Dynamic Island: started for the phase
 * the clock is in now, and ended when fasting is off. iOS ends an activity
 * after eight hours, so the app calls this whenever it opens; the native side
 * leaves an activity showing the same phase as it is.
 */
export async function showFastOnLockScreen(plan: FastingPlan | null, start: string | null): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    if (!plan || !start) {
      await LiveActivity.endFast();
      return;
    }
    const state = fastingState(plan, start);
    await LiveActivity.startFast({ phase: state.phase, since: state.since.getTime(), until: state.until.getTime(), plan });
  } catch {
    // an older iPhone, or Live Activities switched off: the bar and the notifications still work
  }
}
