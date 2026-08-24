import type { FastifyPluginAsync } from 'fastify';
import { adsEnabledFor, shoppingAds, slotAds } from '../services/ads.js';

/**
 * Demo ad surfaces. Every response is empty when the user has ads switched
 * off, so the UI has nothing to lay out around rather than an empty box.
 */
const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  app.get('/', async (request) => {
    const { slot } = request.query as { slot?: string };
    if (!(await adsEnabledFor(request.userId))) return { ads: [], adsEnabled: false };

    const ads =
      slot === 'shopping'
        ? await shoppingAds(request.userId)
        : await slotAds(request.userId, slot === 'recipes' ? 'recipes' : 'home');

    return { ads, adsEnabled: true };
  });
};

export default routes;
