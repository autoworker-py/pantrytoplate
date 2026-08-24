/**
 * Generate the PostgreSQL schema from the SQLite one.
 *
 * There is one schema in this project and it lives in prisma/schema.prisma.
 * Prisma will not take the provider from an environment variable, so a
 * deployment onto Postgres needs a second file — and a second file maintained
 * by hand is a second file that drifts, silently, until a column exists in one
 * place and not the other.
 *
 * So it is generated, never edited: the only difference is the provider line.
 * Every model, field, index and relation comes from the same source, which is
 * what makes "the schema is Postgres-shaped" a fact rather than a hope.
 *
 *   node scripts/pg-schema.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, '..', 'prisma', 'schema.prisma');
const target = join(here, '..', 'prisma', 'schema.postgres.prisma');

const original = readFileSync(source, 'utf8');

if (!/provider\s*=\s*"sqlite"/.test(original)) {
  console.error('prisma/schema.prisma no longer says provider = "sqlite" — check before generating.');
  process.exit(1);
}

const generated = original.replace(
  /provider\s*=\s*"sqlite"/,
  'provider = "postgresql"',
);

const banner = `// GENERATED FILE — DO NOT EDIT.
// Produced from prisma/schema.prisma by scripts/pg-schema.mjs.
// Edit the source schema and re-run: npm run schema:pg

`;

writeFileSync(target, banner + generated);
console.log(`Wrote ${target}`);
