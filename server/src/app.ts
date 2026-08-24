import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ZodError } from 'zod';
import { env } from './env.js';
import { HttpError } from './errors.js';
import './types.js';

import authRoutes from './routes/auth.js';
import foodRoutes from './routes/foods.js';
import inventoryRoutes from './routes/inventory.js';
import recipeRoutes from './routes/recipes.js';
import consumptionRoutes from './routes/consumption.js';
import shoppingRoutes from './routes/shopping.js';
import dashboardRoutes from './routes/dashboard.js';
import settingsRoutes from './routes/settings.js';
import reportRoutes from './routes/reports.js';
import adRoutes from './routes/ads.js';
import planningRoutes from './routes/planning.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: env.nodeEnv === 'test' ? false : { transport: undefined, level: 'info' },
  });

  await app.register(cors, {
    origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(',').map((o) => o.trim()),
    credentials: true,
  });
  await app.register(jwt, { secret: env.jwtSecret, sign: { expiresIn: '30d' } });

  app.decorate('authenticate', async (request, reply) => {
    try {
      await request.jwtVerify();
      request.userId = request.user.sub;
    } catch {
      await reply.code(401).send({ error: 'unauthorized', message: 'Sign in to continue.' });
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'validation_error',
        message: 'Some fields are invalid.',
        details: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({
        error: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      });
    }
    request.log.error(error);
    const fastifyError = error as { statusCode?: number; message?: string };
    const status =
      fastifyError.statusCode && fastifyError.statusCode >= 400 ? fastifyError.statusCode : 500;
    return reply.code(status).send({
      error: 'internal_error',
      message: status === 500 ? 'Something went wrong.' : fastifyError.message ?? 'Request failed.',
    });
  });

  app.get('/api/health', async () => ({
    status: 'ok',
    offlineMode: env.offlineMode,
    expiryWarningDays: env.expiryWarningDays,
  }));

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(foodRoutes, { prefix: '/api/foods' });
  await app.register(inventoryRoutes, { prefix: '/api/inventory' });
  await app.register(recipeRoutes, { prefix: '/api/recipes' });
  await app.register(consumptionRoutes, { prefix: '/api/consumption' });
  await app.register(shoppingRoutes, { prefix: '/api/shopping-list' });
  await app.register(dashboardRoutes, { prefix: '/api/dashboard' });
  await app.register(settingsRoutes, { prefix: '/api/settings' });
  await app.register(reportRoutes, { prefix: '/api/reports' });
  await app.register(adRoutes, { prefix: '/api/ads' });
  await app.register(planningRoutes, { prefix: '/api/planning' });

  await registerWebApp(app);

  return app;
}

/**
 * Serve the built frontend from this same process.
 *
 * One origin means no CORS to misconfigure and one certificate to get right —
 * and the barcode scanner needs a secure origin to exist at all, so halving the
 * number of places TLS can go wrong is worth more than it sounds.
 *
 * Only active when WEB_ROOT points at a real build; in development Vite serves
 * the frontend and proxies here, and this stays out of the way.
 */
async function registerWebApp(app: FastifyInstance) {
  if (!env.webRoot) return;

  const root = resolve(env.webRoot);
  if (!existsSync(root)) {
    app.log.warn(`WEB_ROOT is set to ${root} but nothing is there — serving the API only.`);
    return;
  }

  await app.register(fastifyStatic, { root, index: ['index.html'] });

  /**
   * Client-side routing: /recipes/abc123 is a real page to the user and an
   * unknown path to the server. Anything that is not an API call and did not
   * match a file gets index.html, and React reads the URL from there.
   *
   * An unmatched /api/* path must still 404 as JSON — handing the SPA shell to
   * a fetch() call turns a clear "no such endpoint" into a parse error.
   */
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.code(404).send({ error: 'not_found', message: 'No such endpoint.' });
    }
    return reply.sendFile('index.html');
  });

  app.log.info(`Serving the web app from ${root}`);
}
