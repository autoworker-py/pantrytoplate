import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { env } from './env.js';
import { HttpError } from './errors.js';
import { prisma } from './db.js';
import { ceiling } from './limits.js';
import { inZone, zoneOrDefault } from './zone.js';
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
import snapRoutes from './routes/snap.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: env.nodeEnv === 'test' ? false : { transport: undefined, level: 'info' },
    // behind Render's proxy: the caller's address is the forwarded one, which rate limits key on
    trustProxy: true,
  });

  /**
   * CORS.
   *
   * The native build is not same-origin: an iOS Capacitor web view identifies
   * itself as `capacitor://localhost`, and the simulator sometimes as
   * `http://localhost`. Neither is a browser origin anyone could navigate to,
   * so allowing them costs nothing and omitting them makes every request from
   * the phone fail with an error that looks like the server being down.
   */
  const NATIVE_ORIGINS = ['capacitor://localhost', 'ionic://localhost', 'http://localhost'];
  await app.register(cors, {
    origin:
      env.corsOrigin === '*'
        ? true
        : [...env.corsOrigin.split(',').map((o) => o.trim()).filter(Boolean), ...NATIVE_ORIGINS],
    credentials: true,
  });
  /*
   * Standard browser protections for the web build this server also serves:
   * no framing, no MIME sniffing, HTTPS only. The page's own scripts are the
   * app's, so no content policy is set here to break them; the iPhone app
   * loads its pages from the phone, not from here.
   */
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  await app.register(rateLimit, {
    global: true,
    max: ceiling(300),
    timeWindow: '1 minute',
    errorResponseBuilder: (_request, context) => new HttpError(429, `Too many tries. Wait ${context.after} and try again.`, 'rate_limited'),
  });

  await app.register(jwt, { secret: env.jwtSecret, sign: { expiresIn: '30d' } });

  /*
   * A token is good while its account exists and was issued after the account
   * last said "sign everyone out" (a password change does). Without the check,
   * a token taken from a lost phone keeps working for thirty days whatever the
   * owner does, and one for a deleted account fails halfway through a request.
   */
  app.decorate('authenticate', async (request, reply) => {
    try {
      await request.jwtVerify();
      const issued = (request.user as { iat?: number }).iat ?? 0;
      const account = await prisma.user.findUnique({ where: { id: request.user.sub }, select: { sessionsValidFrom: true } });
      if (!account) throw new Error('no such account');
      if (account.sessionsValidFrom && issued < Math.floor(account.sessionsValidFrom.getTime() / 1000)) throw new Error('signed out');
      request.userId = request.user.sub;
    } catch {
      await reply.code(401).send({ error: 'unauthorized', message: 'Sign in to continue.' });
    }
  });

  // every request runs on its person's calendar, so "today" is their today and not the server's UTC one;
  // set after the body is read, which would otherwise lose it, and before the route's own hooks
  app.addHook('preHandler', (request, _reply, done) => inZone(zoneOrDefault(request.headers['x-time-zone']), done));

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
  await app.register(snapRoutes, { prefix: '/api/snap' });

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
  // In development Vite serves the frontend and proxies here; this must stay
  // out of the way, or a stale build would shadow the one being edited.
  if (!env.webRoot && env.nodeEnv !== 'production') return;

  const root = findWebRoot();
  if (!root) {
    app.log.warn('No built frontend found — serving the API only.');
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

/**
 * Locate the built frontend.
 *
 * WEB_ROOT wins when it points somewhere real. Otherwise fall back to where the
 * build actually puts things, worked out from this file's own location rather
 * than from an absolute path in a host's config — that path is a guess about
 * someone else's directory layout, and when it is wrong the app comes up
 * healthy and serves a blank page, which is a miserable thing to debug.
 */
function findWebRoot(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    ...(env.webRoot ? [resolve(env.webRoot)] : []),
    // dist/ -> server/ -> repo root -> web/dist
    resolve(here, '..', '..', 'web', 'dist'),
    resolve(process.cwd(), '..', 'web', 'dist'),
  ];
  return candidates.find((path) => existsSync(join(path, 'index.html'))) ?? null;
}
