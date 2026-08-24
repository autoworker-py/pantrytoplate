import { buildApp } from './app.js';
import { env } from './env.js';
import { prisma } from './db.js';

const app = await buildApp();

try {
  await app.listen({ port: env.port, host: '0.0.0.0' });
  app.log.info(`Pantry-to-Plate API listening on :${env.port}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  });
}
