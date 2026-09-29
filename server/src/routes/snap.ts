import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { badRequest, HttpError } from '../errors.js';
import { isPlusCode } from '../content/plus.js';
import { PHOTO_SIDE, photoSize, readPlate, snapProvider } from '../services/snap.js';

/**
 * Snap a meal. A few photos are free on every account; after that it is Plus,
 * which while payments are switched off is unlocked by a code. Only a read that
 * found food uses up a free photo.
 */
const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  async function standing(userId: string) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { plusSince: true, snapsUsed: true } });
    const plus = user.plusSince !== null;
    return {
      plus,
      freeLeft: plus ? null : Math.max(0, env.freeSnaps - user.snapsUsed),
      freeTotal: env.freeSnaps,
      /** false when this server has no photo reader configured */
      available: snapProvider() !== null,
    };
  }

  app.get('/status', async (request) => standing(request.userId));

  // a 768 x 768 JPEG made on the phone: around a hundred kilobytes of base64
  app.post('/', { bodyLimit: 8 * 1024 * 1024 }, async (request) => {
    const body = z
      .object({
        image: z.string().min(100),
        mediaType: z.enum(['image/jpeg', 'image/png']).default('image/jpeg'),
        /** the person's own words for what it is, to help the reader; optional */
        hint: z.string().trim().max(140).optional(),
      })
      .parse(request.body);
    // one square size, so every read costs the same: the app sends 768 x 768
    const size = photoSize(body.image);
    if (!size || size.width !== PHOTO_SIDE || size.height !== PHOTO_SIDE) {
      throw badRequest(`Photos are read at ${PHOTO_SIDE} by ${PHOTO_SIDE} pixels. Update the app and try again.`, 'photo_size');
    }
    const before = await standing(request.userId);
    if (!before.plus && (before.freeLeft ?? 0) <= 0) {
      throw new HttpError(402, 'Your free meal photos are used up. Pro reads as many as you like.', 'plus_required');
    }
    const plate = await readPlate(body.image, body.mediaType, body.hint);
    if (!before.plus && plate.items.length > 0) {
      await prisma.user.update({ where: { id: request.userId }, data: { snapsUsed: { increment: 1 } } });
    }
    return { items: plate.items, ...(await standing(request.userId)) };
  });

  app.post('/redeem', async (request) => {
    const { code } = z.object({ code: z.string().min(1).max(64) }).parse(request.body);
    if (!isPlusCode(code)) throw badRequest('That code is not valid.', 'bad_code');
    await prisma.user.update({ where: { id: request.userId }, data: { plusSince: new Date() } });
    return standing(request.userId);
  });
};

export default routes;
