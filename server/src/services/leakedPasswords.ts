/**
 * Refusing a password that has already leaked from somewhere else.
 *
 * Most accounts taken over are not cracked but tried: email and password pairs
 * from other sites' breaches, replayed against every sign-in page there is
 * ("credential stuffing", which is how 23andMe lost thousands of accounts and
 * then millions of people's data). A password in a breach corpus is exactly the
 * one that works, so a new password is checked against Have I Been Pwned's list
 * of passwords seen in breaches before it is accepted.
 *
 * Only the first five characters of the password's SHA-1 hash leave the server,
 * and the answer is every leaked hash sharing them (padded with decoys), so the
 * service cannot tell which password was checked. If it cannot be reached in a
 * moment, the password is allowed: this is a safety net, not a gate on signing up.
 */
import { createHash } from 'node:crypto';
import { env } from '../env.js';
import { badRequest } from '../errors.js';

/** The hashes seen in breaches that start with this prefix, one "SUFFIX:COUNT" per line. */
type RangeLookup = (prefix: string) => Promise<string>;

const pwnedRange: RangeLookup = async (prefix) => {
  const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
    headers: { 'Add-Padding': 'true', 'User-Agent': env.offUserAgent },
    signal: AbortSignal.timeout(2500),
  });
  if (!response.ok) throw new Error(`Pwned Passwords answered ${response.status}`);
  return response.text();
};

/** How many times this password has been seen in breaches; 0 when unknown or unreachable. */
export async function timesLeaked(password: string, lookup: RangeLookup = pwnedRange): Promise<number> {
  if (env.offlineMode && lookup === pwnedRange) return 0;
  const hash = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
  try {
    const range = await lookup(hash.slice(0, 5));
    for (const line of range.split('\n')) {
      const [suffix, count] = line.trim().split(':');
      if (suffix === hash.slice(5)) return Number(count) || 0;
    }
  } catch {
    // unreachable or slow: allowed, never a reason sign-up fails
  }
  return 0;
}

export async function refuseLeaked(password: string, lookup?: RangeLookup): Promise<void> {
  if ((await timesLeaked(password, lookup)) > 0) {
    throw badRequest('That password has turned up in data breaches on other sites, so it would be easy to guess. Choose a different one.', 'password_leaked');
  }
}
