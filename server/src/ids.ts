import { randomUUID } from 'node:crypto';

/** Ids we generate ourselves (Prisma's @default(cuid()) only covers primary keys). */
export function createId(): string {
  return randomUUID();
}
