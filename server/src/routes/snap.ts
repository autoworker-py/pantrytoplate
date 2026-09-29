import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { badRequest, HttpError } from '../errors.js';
import { isPlusCode } from '../content/plus.js';
import { PHOTO_SIDE, photoSize, readPlate, snapProvider } from '../services/snap.js';
import { localDay } from '../zone.js';

/**
 * Photos an account without Pro can earn a day by watching an ad, once its
 * free ones are gone. The app reports each ad watched; until real ad units can
 * have Google confirm them to the server, this cap is what bounds a report
 * that never had an ad behind it: a few photos, a fraction of a cent.
 */
export const AD_PHOTOS_PER_DAY = 3;

/**
 * Snap a meal. A few photos are free on every account; after that a short ad
 * earns one more, up to a few a day, or it is Pro, which while payments are
 * switched off is unlocked by a code. Only a read that found food uses up a
 * free photo.
 */
const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  async function standing(userId: string) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { plusSince: true, snapsUsed: true, snapsEarned: true, adPhotosDay: true, adPhotosThatDay: true },
    });
    const plus = user.plusSince !== null;
    const earnedToday = user.adPhotosDay === localDay(new Date()) ? user.adPhotosThatDay : 0;
    return {
      plus,
      freeLeft: plus ? null : Math.max(0, env.freeSnaps + user.snapsEarned - user.snapsUsed),
      freeTotal: env.freeSnaps,
      /** photos an ad can still earn today; Pro has no ads */
      adPhotosLeft: plus ? 0 : Math.max(0, AD_PHOTOS_PER_DAY - earnedToday),
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

  /** An ad watched to the end, on an account whose free photos are gone: one more photo. */
  app.post('/reward', async (request) => {
    const before = await standing(request.userId);
    if (before.plus) throw badRequest('Pro has no ads to watch.', 'no_ads');
    if ((before.freeLeft ?? 0) > 0) throw badRequest('You still have a free photo to use first.', 'photos_left');
    const today = localDay(new Date());
    // the day's count starts again on a new day, and stops at the cap however many requests race
    const fresh = await prisma.user.updateMany({
      where: { id: request.userId, OR: [{ adPhotosDay: null }, { adPhotosDay: { not: today } }] },
      data: { snapsEarned: { increment: 1 }, adPhotosDay: today, adPhotosThatDay: 1 },
    });
    const more = fresh.count
      ? fresh
      : await prisma.user.updateMany({
          where: { id: request.userId, adPhotosDay: today, adPhotosThatDay: { lt: AD_PHOTOS_PER_DAY } },
          data: { snapsEarned: { increment: 1 }, adPhotosThatDay: { increment: 1 } },
        });
    if (!more.count) throw new HttpError(429, 'That is all the photos ads can earn today. More tomorrow, or go Pro.', 'ad_photos_used');
    return standing(request.userId);
  });

  app.post('/redeem', async (request) => {
    const { code } = z.object({ code: z.string().min(1).max(64) }).parse(request.body);
    if (!isPlusCode(code)) throw badRequest('That code is not valid.', 'bad_code');
    await prisma.user.update({ where: { id: request.userId }, data: { plusSince: new Date() } });
    return standing(request.userId);
  });
};

export default routes;
