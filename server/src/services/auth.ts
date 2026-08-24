import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';
import { badRequest, conflict, unauthorized } from '../errors.js';

const ROUNDS = 10;

export async function registerUser(email: string, password: string) {
  const normalized = email.trim().toLowerCase();
  if (password.length < 8) throw badRequest('Password must be at least 8 characters.');

  const existing = await prisma.user.findUnique({ where: { email: normalized } });
  if (existing) throw conflict('An account with that email already exists.', 'email_taken');

  const user = await prisma.user.create({
    data: { email: normalized, passwordHash: await bcrypt.hash(password, ROUNDS) },
  });
  return { id: user.id, email: user.email, createdAt: user.createdAt };
}

export async function verifyCredentials(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  // compare against a dummy hash on miss so timing does not reveal existence
  const hash = user?.passwordHash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi';
  const valid = await bcrypt.compare(password, hash);
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

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(next, ROUNDS) },
  });
  return { changed: true };
}
