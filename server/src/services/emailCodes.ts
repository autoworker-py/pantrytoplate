/**
 * Six-digit codes sent by email: one to confirm an address after signing up,
 * one to set a new password when the old one is forgotten.
 *
 * A code is a million-to-one guess, so the limits are what keep it safe. A code
 * works for fifteen minutes and five wrong tries; a new one replaces it; and an
 * account gets at most ten codes and ten wrong tries a day for each purpose,
 * counted against the account rather than the address asking, so spreading the
 * guesses over many networks gains nothing. Only a keyed hash of the code is
 * stored, so reading the database does not reveal a live one.
 */
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { sendMail, type Mail } from './mail.js';

export type Purpose = 'confirm' | 'reset';

const LIFETIME_MS = 15 * 60_000;
/** the soonest another code goes out, so a button pressed repeatedly sends one email */
const RESEND_AFTER_MS = 30_000;
const MAX_TRIES = 5;
const WINDOW_MS = 24 * 60 * 60_000;
const MAX_SENDS = 10;
const MAX_MISSES = 10;

const digest = (userId: string, purpose: Purpose, code: string) =>
  createHmac('sha256', env.jwtSecret).update(`${purpose}:${userId}:${code}`).digest();

function matches(storedHex: string, given: Buffer): boolean {
  const stored = Buffer.from(storedHex, 'hex');
  return stored.length === given.length && timingSafeEqual(stored, given);
}

export type Sending = { sent: true } | { sent: false; reason: 'wait'; waitSeconds: number } | { sent: false; reason: 'limit' };

/** Make a new code for this purpose, replacing any earlier one, and email it. */
export async function sendCode(user: { id: string; email: string }, purpose: Purpose): Promise<Sending> {
  const key = { userId_purpose: { userId: user.id, purpose } };
  const row = await prisma.emailCode.findUnique({ where: key });
  const now = Date.now();
  const fresh = !row || now - row.windowStart.getTime() >= WINDOW_MS;
  if (row && !fresh && now - row.sentAt.getTime() < RESEND_AFTER_MS) {
    return { sent: false, reason: 'wait', waitSeconds: Math.ceil((RESEND_AFTER_MS - (now - row.sentAt.getTime())) / 1000) };
  }
  const sends = fresh ? 0 : row.sends;
  const misses = fresh ? 0 : row.misses;
  if (sends >= MAX_SENDS || misses >= MAX_MISSES) return { sent: false, reason: 'limit' };

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const next = {
    codeHash: digest(user.id, purpose, code).toString('hex'),
    tries: 0,
    sentAt: new Date(now),
    expiresAt: new Date(now + LIFETIME_MS),
    windowStart: fresh ? new Date(now) : row.windowStart,
    sends: sends + 1,
    misses,
  };
  await prisma.emailCode.upsert({ where: key, create: { userId: user.id, purpose, ...next }, update: next });
  try {
    await sendMail(letter(purpose, user.email, code));
  } catch (error) {
    // nothing reached the inbox: the code is dead, and trying again is not held up or counted
    await prisma.emailCode.update({ where: key, data: { expiresAt: new Date(now), sentAt: new Date(0), sends: { decrement: 1 } } });
    throw error;
  }
  return { sent: true };
}

export type Check = 'ok' | 'wrong' | 'expired' | 'used_up' | 'locked';

/** Check a typed code. A right one is spent; a wrong one counts against the code and the day. */
export async function checkCode(userId: string, purpose: Purpose, typed: string): Promise<Check> {
  const key = { userId_purpose: { userId, purpose } };
  const row = await prisma.emailCode.findUnique({ where: key });
  const now = Date.now();
  if (!row) return 'expired';
  if (row.misses >= MAX_MISSES && now - row.windowStart.getTime() < WINDOW_MS) return 'locked';
  if (row.expiresAt.getTime() <= now) return 'expired';
  if (row.tries >= MAX_TRIES) return 'used_up';
  // the try is counted before comparing, so guesses sent all at once still each count
  const counted = await prisma.emailCode.updateMany({
    where: { userId, purpose, sentAt: row.sentAt, tries: { lt: MAX_TRIES }, misses: { lt: MAX_MISSES } },
    data: { tries: { increment: 1 }, misses: { increment: 1 } },
  });
  if (counted.count === 0) return 'used_up';
  if (!matches(row.codeHash, digest(userId, purpose, typed))) {
    if (row.misses + 1 >= MAX_MISSES) return 'locked';
    return row.tries + 1 >= MAX_TRIES ? 'used_up' : 'wrong';
  }
  await prisma.emailCode.delete({ where: key });
  return 'ok';
}

/** The email itself: the code in the subject and in large type, and what to do if it was not you. */
function letter(purpose: Purpose, to: string, code: string): Mail {
  const doing = purpose === 'confirm' ? 'confirm your email' : 'set a new password';
  const notYou =
    purpose === 'confirm'
      ? 'If you did not make a Pantry2Plate account, you can ignore this email.'
      : 'If you did not ask to reset your password, ignore this email and your password stays the same.';
  return {
    to,
    subject: `${code} is your Pantry2Plate code`,
    text: `Type this code into Pantry2Plate to ${doing}:\n\n${code}\n\nIt works for 15 minutes. ${notYou}\n`,
    html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:440px;margin:0 auto;padding:28px 24px;color:#1b1c1e">
<p style="font-size:16px;line-height:1.5;margin:0 0 18px">Type this code into Pantry2Plate to ${doing}:</p>
<p style="font-size:36px;font-weight:700;letter-spacing:8px;margin:0 0 18px">${code}</p>
<p style="font-size:14px;line-height:1.5;color:#5b5e64;margin:0">It works for 15 minutes. ${notYou}</p>
</div>`,
  };
}
