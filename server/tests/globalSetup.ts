import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

/** Fresh, seeded SQLite database for the integration tests. */
export default function setup() {
  const dbPath = resolve(import.meta.dirname, '../prisma/test.db');
  rmSync(dbPath, { force: true });
  rmSync(`${dbPath}-journal`, { force: true });

  const env = { ...process.env, DATABASE_URL: 'file:./test.db' };
  execSync('npx prisma migrate deploy', { cwd: resolve(import.meta.dirname, '..'), env, stdio: 'pipe' });
  execSync('npx tsx prisma/seed.ts', { cwd: resolve(import.meta.dirname, '..'), env, stdio: 'pipe' });
}
