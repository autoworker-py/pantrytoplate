import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

/** Prisma's interactive-transaction client, for services that must be atomic. */
export type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;
