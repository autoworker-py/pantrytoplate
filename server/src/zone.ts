/**
 * The person's own calendar. The server runs on UTC, so by its clock "today"
 * turns into tomorrow at 6pm in Denver: food eaten that evening was filed under
 * the next day, and use-by dates counted a day short. The app sends its time
 * zone with every request (X-Time-Zone), each request runs in it, and anything
 * that asks what day it is asks here.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

/** The server's own zone: what a request that names none (an older app, a test) has always had. */
const SERVER_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

const zones = new AsyncLocalStorage<string>();
const clocks = new Map<string, Intl.DateTimeFormat>();

/** A clock reading in the zone; throws for a zone the runtime does not know. */
function clock(zone: string): Intl.DateTimeFormat {
  let found = clocks.get(zone);
  if (!found) {
    found = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    clocks.set(zone, found);
  }
  return found;
}

/** A zone the runtime knows ("America/Denver"), or the server's own. */
export function zoneOrDefault(name: unknown): string {
  if (typeof name !== 'string' || !name || name.length > 64) return SERVER_ZONE;
  try {
    clock(name);
    return name;
  } catch {
    return SERVER_ZONE;
  }
}

/** Runs a request's work in its person's zone. */
export function inZone<T>(zone: string, run: () => T): T {
  return zones.run(zone, run);
}

export const currentZone = (): string => zones.getStore() ?? SERVER_ZONE;

function reading(instant: Date, zone: string) {
  const parts: Record<string, number> = {};
  for (const part of clock(zone).formatToParts(instant)) if (part.type !== 'literal') parts[part.type] = Number(part.value);
  return parts as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

const pad = (n: number) => String(n).padStart(2, '0');
const utcMidnight = (day: string) => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
};

/** The calendar day an instant falls on in the zone: "2026-09-27". */
export function localDay(instant: Date, zone = currentZone()): string {
  const at = reading(instant, zone);
  return `${at.year}-${pad(at.month)}-${pad(at.day)}`;
}

/** Minutes past midnight on the person's clock: 19:30 is 1170. */
export function localMinutes(instant: Date, zone = currentZone()): number {
  const at = reading(instant, zone);
  return at.hour * 60 + at.minute;
}

/** A calendar day moved by whole days: addDays("2026-09-30", 1) is "2026-10-01". */
export function addDays(day: string, n: number): string {
  return new Date(utcMidnight(day) + n * 86_400_000).toISOString().slice(0, 10);
}

/** The instant a calendar day begins in the zone. */
export function dayStart(day: string, zone = currentZone()): Date {
  const midnight = utcMidnight(day);
  // read the zone's clock to find its offset from UTC; twice, for the days the clocks change
  let at = midnight;
  for (let i = 0; i < 2; i++) {
    const seen = reading(new Date(at), zone);
    const offset = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute, seen.second) - Math.floor(at / 1000) * 1000;
    at = midnight - offset;
  }
  return new Date(at);
}

/** Whole calendar days from one instant's day to another's, in the zone. */
export function daysBetween(from: Date, to: Date, zone = currentZone()): number {
  return Math.round((utcMidnight(localDay(to, zone)) - utcMidnight(localDay(from, zone))) / 86_400_000);
}
