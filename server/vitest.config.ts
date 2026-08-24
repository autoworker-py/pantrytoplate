import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./tests/globalSetup.ts'],
    // Integration tests share one SQLite file, so run files serially.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      // separate database from dev.db; created and seeded by globalSetup
      DATABASE_URL: 'file:./test.db',
      JWT_SECRET: 'test-secret-do-not-use-in-production',
      // never call USDA / Open Food Facts from the test suite
      OFFLINE_MODE: 'true',
      EXPIRY_WARNING_DAYS: '3',
    },
  },
});
