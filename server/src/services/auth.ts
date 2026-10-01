import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';
import { badRequest, conflict, unauthorized } from '../errors.js';
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
  return { id: user.id, email: user.email, createdAt: user.createdAt };
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
