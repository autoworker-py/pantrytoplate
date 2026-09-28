/**
 * The person's calendar, not the server's. The server runs on UTC, so without
 * the app's time zone every evening in the Americas already counted as
 * tomorrow. These pick zones far from the server's own on purpose.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { PRIVACY_VERSION } from '../src/content/privacy.js';
import { addDays, currentZone, dayStart, daysBetween, localDay, zoneOrDefault } from '../src/zone.js';

const SERVER_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
/** fourteen hours ahead of UTC and twelve behind: at any moment one of them is on another day than the server */
const FAR_ZONES = ['Etc/GMT-14', 'Etc/GMT+12'];

/** The day it is now in a zone, worked out here without the code under test. */
function todayIn(zone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

describe('calendar days in a time zone', () => {
  it('names the day an instant falls on where the person is', () => {
    const sevenPmInDenver = new Date('2026-09-28T01:30:00Z');
    expect(localDay(sevenPmInDenver, 'America/Denver')).toBe('2026-09-27');
    expect(localDay(sevenPmInDenver, 'UTC')).toBe('2026-09-28');
  });

  it('finds the instant a day begins, on either side of UTC and across clock changes', () => {
    expect(dayStart('2026-09-27', 'America/Denver').toISOString()).toBe('2026-09-27T06:00:00.000Z');
    expect(dayStart('2026-09-27', 'Asia/Tokyo').toISOString()).toBe('2026-09-26T15:00:00.000Z');
    expect(dayStart('2026-03-08', 'America/Denver').toISOString()).toBe('2026-03-08T07:00:00.000Z');
    expect(dayStart('2026-11-01', 'America/Denver').toISOString()).toBe('2026-11-01T06:00:00.000Z');
  });

  it('moves between days and counts them', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    const sevenPmInDenver = new Date('2026-09-28T01:00:00Z');
    const noonTomorrowInDenver = new Date('2026-09-28T18:00:00Z');
    expect(daysBetween(sevenPmInDenver, noonTomorrowInDenver, 'America/Denver')).toBe(1);
    expect(daysBetween(sevenPmInDenver, noonTomorrowInDenver, 'UTC')).toBe(0);
  });

  it('only takes zones it knows', () => {
    expect(zoneOrDefault('America/Denver')).toBe('America/Denver');
    expect(zoneOrDefault('Mars/Olympus')).toBe(SERVER_ZONE);
    expect(zoneOrDefault(undefined)).toBe(SERVER_ZONE);
  });
});

describe('each request on its person’s calendar', () => {
  let app: FastifyInstance;
  let auth: { authorization: string };

  beforeAll(async () => {
    app = await buildApp();
    // what zone the work of a request sees, after its body is read and it is signed in
    app.post('/api/zone-check', { preHandler: app.authenticate }, async (request) => ({ zone: currentZone(), body: request.body }));
    const registered = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: `zone-${Date.now()}@example.test`, password: 'testpassword', acceptPrivacyVersion: PRIVACY_VERSION },
    });
    auth = { authorization: `Bearer ${JSON.parse(registered.body).token}` };
    const logged = await app.inject({
      method: 'POST',
      url: '/api/consumption/eat-out',
      headers: auth,
      payload: { name: 'Test dinner', calories: 100, mealSlot: 'dinner' },
    });
    expect(logged.statusCode).toBe(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('keeps the zone through reading a body and signing in', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/zone-check', headers: { ...auth, 'x-time-zone': 'Asia/Tokyo' }, payload: { hello: 'there' } });
    expect(JSON.parse(response.body)).toEqual({ zone: 'Asia/Tokyo', body: { hello: 'there' } });
    const without = await app.inject({ method: 'POST', url: '/api/zone-check', headers: auth, payload: {} });
    expect(JSON.parse(without.body).zone).toBe(SERVER_ZONE);
  });

  it('files what was just eaten under today where the person is', async () => {
    for (const zone of FAR_ZONES) {
      const today = todayIn(zone);
      const diary = async (day: string) =>
        JSON.parse((await app.inject({ method: 'GET', url: `/api/consumption/today?date=${day}`, headers: { ...auth, 'x-time-zone': zone } })).body);
      expect(await diary(today)).toMatchObject({ date: today, totalCalories: 100 });
      expect((await diary(addDays(today, -1))).totalCalories).toBe(0);
      expect((await diary(addDays(today, 1))).totalCalories).toBe(0);
    }
  });

  it('shows the week by the person’s days', async () => {
    for (const zone of FAR_ZONES) {
      const today = todayIn(zone);
      const response = await app.inject({ method: 'GET', url: '/api/consumption/history?days=3', headers: { ...auth, 'x-time-zone': zone } });
      expect(JSON.parse(response.body).days).toEqual([
        { date: addDays(today, -2), totalCalories: 0, protein: 0 },
        { date: addDays(today, -1), totalCalories: 0, protein: 0 },
        { date: today, totalCalories: 100, protein: 0 },
      ]);
    }
  });
});
