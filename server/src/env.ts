import 'dotenv/config';

function str(key: string, fallback?: string): string {
  const value = process.env[key];
  if (value === undefined || value === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required environment variable ${key} (see .env.example)`);
  }
  return value;
}

function num(key: string, fallback: number): number {
  const raw = process.env[key];
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const DEV_JWT_SECRET = 'dev-only-change-me';

/**
 * The signing key for every session token in the app.
 *
 * A convenient default is exactly right in development and a hole in
 * production: anyone who has read this file could mint a token for any
 * account. So the fallback exists, and refuses to be used once NODE_ENV says
 * this is a real deployment. Failing to boot is the correct outcome — a server
 * that starts with a public secret is worse than one that does not start.
 */
function jwtSecret(): string {
  const secret = str('JWT_SECRET', DEV_JWT_SECRET);
  if (process.env.NODE_ENV === 'production' && secret === DEV_JWT_SECRET) {
    throw new Error(
      'JWT_SECRET is still the development default. Set it to a long random string ' +
        'before running in production — try: openssl rand -base64 48',
    );
  }
  return secret;
}

export const env = {
  nodeEnv: str('NODE_ENV', 'development'),
  port: num('PORT', 4000),
  corsOrigin: str('CORS_ORIGIN', 'http://localhost:5173'),
  jwtSecret: jwtSecret(),
  /**
   * Which database is behind Prisma: "sqlite" locally and in tests,
   * "postgresql" in a deployment that has no persistent disk.
   *
   * The schema is identical either way. This exists because the two disagree
   * about one thing that matters — SQLite's LIKE ignores case for ASCII and
   * Postgres's does not — so searching "Omelette" would silently find nothing
   * on a deployed copy while working perfectly on the laptop it was tested on.
   */
  dbProvider: str('DATABASE_PROVIDER', 'sqlite'),
  /**
   * Where the built frontend lives, when this process serves it too. Set in
   * production so the app is one origin: no CORS, no second host, and the
   * camera works because there is only one certificate to get right.
   */
  webRoot: process.env.WEB_ROOT ?? '',
  usdaApiKey: str('USDA_API_KEY', 'DEMO_KEY'),
  offUserAgent: str('OFF_USER_AGENT', 'PantryToPlate/0.1 (local development)'),
  /** hard kill switch for outbound calls; the app stays fully usable */
  offlineMode: str('OFFLINE_MODE', 'false').toLowerCase() === 'true',
  expiryWarningDays: num('EXPIRY_WARNING_DAYS', 3),
  /** how long an external API may take before we fall back to manual entry */
  externalTimeoutMs: num('EXTERNAL_TIMEOUT_MS', 6000),
};
