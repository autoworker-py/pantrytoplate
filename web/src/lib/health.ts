import { Capacitor, registerPlugin } from '@capacitor/core';

/*
 * Apple Health, on the phone only: the day's steps and the calories burned
 * exercising, and sleep times once the person switches on the sleep insight.
 * None of it is sent to the server; the budget and the insights that use it are
 * worked out here.
 */

interface HealthPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  requestActivity(): Promise<{ asked: boolean }>;
  requestSleep(): Promise<{ asked: boolean }>;
  activity(options: { day: string }): Promise<{ activeKcal: number; steps: number }>;
  sleep(options: { days: number }): Promise<{ nights: SleepNight[] }>;
}

export interface SleepNight {
  /** the evening the night began on, YYYY-MM-DD */
  day: string;
  asleepAt: string;
  wokeAt: string;
  minutes: number;
}

const Health = registerPlugin<HealthPlugin>('Health');

// Health never says whether reading was allowed, so the app remembers that it asked
const ACTIVITY_KEY = 'pantry.health.activity';
const SLEEP_KEY = 'pantry.health.sleep';
const remembered = (key: string) => {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
};
const remember = (key: string, on: boolean) => {
  try {
    if (on) localStorage.setItem(key, '1');
    else localStorage.removeItem(key);
  } catch {
    // private mode: asked again next time
  }
};

export const healthOnThisDevice = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
export const activityConnected = () => healthOnThisDevice() && remembered(ACTIVITY_KEY);
export const sleepConnected = () => healthOnThisDevice() && remembered(SLEEP_KEY);

export async function connectActivity(): Promise<boolean> {
  if (!healthOnThisDevice()) return false;
  try {
    if (!(await Health.isAvailable()).available) return false;
    const { asked } = await Health.requestActivity();
    remember(ACTIVITY_KEY, asked);
    return asked;
  } catch {
    return false;
  }
}

export async function connectSleep(): Promise<boolean> {
  if (!healthOnThisDevice()) return false;
  try {
    if (!(await Health.isAvailable()).available) return false;
    const { asked } = await Health.requestSleep();
    remember(SLEEP_KEY, asked);
    return asked;
  } catch {
    return false;
  }
}

export function disconnectActivity() {
  remember(ACTIVITY_KEY, false);
}
export function disconnectSleep() {
  remember(SLEEP_KEY, false);
}

/** A day's steps and active calories, or nothing when Health isn't connected. */
export async function dayActivity(day: string): Promise<{ activeKcal: number; steps: number } | null> {
  if (!activityConnected()) return null;
  try {
    return await Health.activity({ day });
  } catch {
    return null;
  }
}

export async function sleepNights(days = 30): Promise<SleepNight[] | null> {
  if (!sleepConnected()) return null;
  try {
    return (await Health.sleep({ days })).nights;
  } catch {
    return null;
  }
}
