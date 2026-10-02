import { prisma } from '../db.js';
import { HttpError } from '../errors.js';

/**
 * Pantry2Plate Pro ("plus" in the code and the database). Features kept for Pro
 * ask here first, on the server, so no build of the app can skip it. There are
 * no free tries (the owner's call, 2026-10-02).
 */
export async function requirePlus(userId: string, message: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { plusSince: true } });
  if (!user?.plusSince) throw new HttpError(403, message, 'plus_required');
}
