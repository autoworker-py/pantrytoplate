/**
 * A cook timer that survives the app being backgrounded or killed.
 *
 * The old timer decremented a counter on a one-second setTimeout. iOS suspends
 * JavaScript the moment the app leaves the foreground, so the countdown did not
 * merely pause - it resumed from where it froze and under-reported the elapsed
 * time. A timer that quietly tells you eighteen minutes have passed when it has
 * really been thirty is worse than no timer at all.
 *
 * So the deadline is the truth: an absolute wall-clock instant, and three
 * things are driven from that single instant so they cannot disagree.
 *
 *   1. The countdown on screen, rendered as `deadline - now`.
 *   2. A Live Activity, which draws the same countdown on the Lock Screen. The
 *      system ticks it from the end date, so it keeps running with the app
 *      closed and needs no updates from us.
 *   3. A local notification, which fires at the deadline even if the Live
 *      Activity was dismissed or is unavailable.
 *
 * Failures are reported rather than swallowed. The first version hid them, so
 * a timer that could never alert looked identical to one that would.
 */
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor, registerPlugin } from '@capacitor/core';

interface LiveActivityPlugin {
  isSupported(): Promise<{ supported: boolean }>;
  start(options: {
    endsAt: number;
    recipeName: string;
    stepLabel: string;
  }): Promise<{ started: boolean; reason?: string }>;
  end(): Promise<void>;
}

const LiveActivity = registerPlugin<LiveActivityPlugin>('LiveActivity');

const STORAGE_KEY = 'pantry.cookTimer';
const NOTIFICATION_ID = 8801;

export type RunningTimer = {
  /** epoch milliseconds at which the timer finishes */
  deadline: number;
  /** the step being timed, so the alert can name it */
  label: string;
};

export type StartResult = {
  timer: RunningTimer;
  /** the Lock Screen countdown is showing */
  liveActivity: boolean;
  /** an alert will fire at the deadline */
  notification: boolean;
  /** why background alerting is unavailable, when it is */
  problem?: string;
};

function isNative() {
  return Capacitor.isNativePlatform();
}

/** Reads back a timer that is still running; clears one that has expired. */
export function loadTimer(): RunningTimer | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RunningTimer;
    if (typeof parsed?.deadline !== 'number') return null;
    if (parsed.deadline <= Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Seconds remaining, floored at zero. Derived, never accumulated. */
export function secondsRemaining(timer: RunningTimer, now = Date.now()): number {
  return Math.max(0, Math.ceil((timer.deadline - now) / 1000));
}

export async function ensurePermission(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'granted') return true;
    if (current.display === 'denied') return false;
    const asked = await LocalNotifications.requestPermissions();
    return asked.display === 'granted';
  } catch {
    return false;
  }
}

async function scheduleNotification(timer: RunningTimer): Promise<{ ok: boolean; problem?: string }> {
  if (!isNative()) return { ok: false, problem: 'not_native' };
  try {
    await LocalNotifications.cancel({ notifications: [{ id: NOTIFICATION_ID }] });
  } catch {
    // nothing scheduled yet
  }

  const granted = await ensurePermission();
  if (!granted) return { ok: false, problem: 'notifications_denied' };

  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: NOTIFICATION_ID,
          title: 'Timer finished',
          body: timer.label ? `${timer.label} - time is up.` : 'Time is up.',
          schedule: { at: new Date(timer.deadline) },
          /*
           * No `sound` key. Naming one makes iOS look for a file of that name
           * in the bundle; "default" is not a file we ship, so asking for it
           * got a silent notification. Omitting it uses the system default.
           */
        },
      ],
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, problem: String(error) };
  }
}

async function startLiveActivity(
  timer: RunningTimer,
  recipeName: string,
): Promise<{ ok: boolean; problem?: string }> {
  if (!isNative()) return { ok: false, problem: 'not_native' };
  try {
    const result = await LiveActivity.start({
      endsAt: timer.deadline,
      recipeName,
      stepLabel: timer.label,
    });
    return result.started ? { ok: true } : { ok: false, problem: result.reason };
  } catch (error) {
    // an older iOS has no plugin method to call
    return { ok: false, problem: String(error) };
  }
}

/**
 * Starts a timer. The screen, the Lock Screen and the notification are all set
 * from the same deadline, so they cannot drift apart.
 */
export async function startTimer(
  seconds: number,
  label: string,
  recipeName = 'Cook timer',
): Promise<StartResult> {
  const timer: RunningTimer = { deadline: Date.now() + seconds * 1000, label };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(timer));

  const [live, note] = await Promise.all([
    startLiveActivity(timer, recipeName),
    scheduleNotification(timer),
  ]);

  return {
    timer,
    liveActivity: live.ok,
    notification: note.ok,
    // only worth reporting when nothing at all will alert them
    problem: live.ok || note.ok ? undefined : (note.problem ?? live.problem),
  };
}

export async function stopTimer(): Promise<void> {
  localStorage.removeItem(STORAGE_KEY);
  if (!isNative()) return;
  await Promise.all([
    LocalNotifications.cancel({ notifications: [{ id: NOTIFICATION_ID }] }).catch(() => undefined),
    LiveActivity.end().catch(() => undefined),
  ]);
}
