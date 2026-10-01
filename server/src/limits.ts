/**
 * How often a route can be called, per caller.
 *
 * Signing in is limited per address and email together, so guessing passwords
 * is slow while one person mistyping on a shared Wi-Fi network locks nobody else
 * out. Everything else gets a generous ceiling per address, enough for any real
 * use and short of what a script would send. Calls that cost money or reach an
 * outside service (meal photos, barcode and food lookups, recipe pages) are
 * tighter.
 *
 * Tests run with the limits off, since every test request comes from the same
 * address, and turn them on to test them.
 */
import type { FastifyRequest, RouteShorthandOptions } from 'fastify';
import { env } from './env.js';

let enforced = env.nodeEnv !== 'test';
export const enforceLimits = (on: boolean) => {
  enforced = on;
};

const OFF = 1_000_000;
export const ceiling = (max: number) => () => (enforced ? max : OFF);

/** A per-route limit: at most `max` calls per `window`, keyed by address unless said otherwise. */
export function limit(max: number, timeWindow: string, keyGenerator?: (request: FastifyRequest) => string): RouteShorthandOptions {
  return { config: { rateLimit: { max: ceiling(max), timeWindow, ...(keyGenerator ? { keyGenerator } : {}) } } };
}

/** Address and the email being tried, for sign-in. */
export const byEmail = (request: FastifyRequest) => {
  const email = (request.body as { email?: unknown } | undefined)?.email;
  return `${request.ip}|${typeof email === 'string' ? email.trim().toLowerCase() : ''}`;
};
