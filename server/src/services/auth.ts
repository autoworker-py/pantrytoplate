import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';
import { badRequest, conflict, forbidden, unauthorized } from '../errors.js';
import { env } from '../env.js';

const ROUNDS = 10;

/**
 * Compared against when no account has the email, so a wrong email takes as
 * long to refuse as a wrong password and the timing gives nothing away. It has
 * to be a real hash: bcrypt refuses a malformed one instantly, which is the
 * very difference this exists to hide.
 */
export const DUMMY_HASH = bcrypt.hashSync('no account has this password', ROUNDS);

/**
 * The seeded development accounts (demo@pantry.local and friends) have
 * passwords printed in the README. They are for laptops; a deployed server
 * neither makes nor admits them.
 */
const devOnly = (email: string) => env.nodeEnv === 'production' && email.endsWith('@pantry.local');

export async function registerUser(email: string, password: string) {
  const normalized = email.trim().toLowerCase();
  if (password.length < 8) throw badRequest('Password must be at least 8 characters.');
  if (devOnly(normalized)) throw badRequest('Use a real email address.', 'email_invalid');

  const existing = await prisma.user.findUnique({ where: { email: normalized } });
  if (existing) throw conflict('An account with that email already exists.', 'email_taken');

  const user = await prisma.user.create({
    data: { email: normalized, passwordHash: await bcrypt.hash(password, ROUNDS) },
  });
  return { id: user.id, email: user.email, createdAt: user.createdAt };
}

export async function verifyCredentials(email: string, password: string) {
  const normalized = email.trim().toLowerCase();
  const user = devOnly(normalized) ? null : await prisma.user.findUnique({ where: { email: normalized } });
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) throw unauthorized('Incorrect email or password.');
  return { id: user.id, email: user.email, createdAt: user.createdAt, emailUnconfirmed: user.emailUnconfirmed };
}

/**
 * Change your own password.
 *
 * Needed the moment this app is reachable from the internet: the demo account
 * ships with a password printed in the README, and any pantry carried over from
 * a laptop arrives still using it. Requires the current password, so a stolen
 * or forgotten-open session cannot lock the owner out of their own account.
 */
export async function changePassword(userId: string, current: string, next: string) {
  if (next.length < 8) throw badRequest('New password must be at least 8 characters.');
  if (next === current) throw badRequest('That is the password you already have.');

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw unauthorized('Sign in to continue.');

  const valid = await bcrypt.compare(current, user.passwordHash);
  if (!valid) throw unauthorized('That is not your current password.');

  // a new password signs out every other device; the route hands this one a fresh token
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(next, ROUNDS), sessionsValidFrom: new Date() },
  });
  return { changed: true };
}

/** The account an email belongs to, or null. The development accounts do not exist on a deployed server. */
export async function accountByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  return devOnly(normalized) ? null : prisma.user.findUnique({ where: { email: normalized } });
}

/**
 * A forgotten password, replaced once the code emailed to the account was typed
 * in. The code proved the address is theirs, so the email counts as confirmed
 * too, and every device that was signed in is signed out.
 */
export async function resetPassword(userId: string, next: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(next, ROUNDS), sessionsValidFrom: new Date(), emailUnconfirmed: false },
  });
}

/**
 * Put a different address on an account that has not confirmed its email yet:
 * the fix for a typo at sign-up. A confirmed address is not changed this way.
 */
export async function changeUnconfirmedEmail(userId: string, email: string) {
  const normalized = email.trim().toLowerCase();
  if (devOnly(normalized)) throw badRequest('Use a real email address.', 'email_invalid');
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw unauthorized('Sign in to continue.');
  if (!user.emailUnconfirmed) throw forbidden('This email is already confirmed.', 'already_confirmed');
  if (normalized === user.email) return user;
  if (await prisma.user.findUnique({ where: { email: normalized } })) throw conflict('An account with that email already exists.', 'email_taken');
  // the code sent to the old address stops working, and the new address need not wait for its own;
  // the day's count of codes carries over, so changing back and forth cannot send more
  await prisma.emailCode.updateMany({ where: { userId, purpose: 'confirm' }, data: { expiresAt: new Date(), sentAt: new Date(0) } });
  try {
    return await prisma.user.update({ where: { id: userId }, data: { email: normalized } });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') throw conflict('An account with that email already exists.', 'email_taken');
    throw error;
  }
}
