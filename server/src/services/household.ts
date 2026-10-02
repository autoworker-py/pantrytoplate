/**
 * Housemates: one pantry and one shopping list for the house, each person's
 * diary, goals, weight and recipes their own.
 *
 * The house's pantry and list are kept under its owner's account, so every
 * query about them asks pantryOf() whose they are. Joining brings your food
 * into the house; leaving starts you on an empty shelf; when the owner leaves
 * (or deletes their account) the house, food and all, passes to the member who
 * joined next, so nobody's dinner disappears with someone else's account.
 */
import { createHash, randomInt } from 'node:crypto';
import { prisma, type Tx } from '../db.js';
import { HttpError, badRequest, notFound } from '../errors.js';

const INVITE_HOURS = 48;
// no 0/O, 1/I/L: a code read out over the phone is a code typed in right
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const normalize = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');
const hashOf = (code: string) => createHash('sha256').update(normalize(code)).digest('hex');

/** Whose pantry and shopping list a person uses: the house owner's, or their own. */
export async function pantryOf(userId: string, db: Tx = prisma): Promise<string> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { household: { select: { ownerId: true } } } });
  return user?.household?.ownerId ?? userId;
}

/** Everyone whose planned meals share the person's shopping list: the house, or just them. */
export async function housemates(userId: string, db: Tx = prisma): Promise<string[]> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { household: { select: { members: { select: { id: true } } } } } });
  return user?.household?.members.map((m) => m.id) ?? [userId];
}

/** A house for the person, made when they first invite someone. */
async function houseOf(userId: string, db: Tx) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { householdId: true } });
  if (user.householdId) return db.household.findUniqueOrThrow({ where: { id: user.householdId } });
  const house = await db.household.create({ data: { ownerId: userId } });
  await db.user.update({ where: { id: userId }, data: { householdId: house.id } });
  return house;
}

/** A six-letter code for one person to join, good for two days. */
export async function inviteCode(userId: string) {
  const house = await houseOf(userId, prisma);
  const code = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  const expiresAt = new Date(Date.now() + INVITE_HOURS * 3_600_000);
  await prisma.householdInvite.create({ data: { householdId: house.id, codeHash: hashOf(code), expiresAt } });
  return { code: `${code.slice(0, 3)}-${code.slice(3)}`, expiresAt: expiresAt.toISOString() };
}

/** Move one person's pantry and list into another's (joining, or a house changing hands). */
async function moveFood(tx: Tx, from: string, to: string) {
  if (from === to) return;
  await tx.inventoryItem.updateMany({ where: { userId: from }, data: { userId: to } });
  await tx.shoppingListItem.updateMany({ where: { userId: from }, data: { userId: to } });
}

export async function joinHouse(userId: string, code: string) {
  return prisma.$transaction(async (tx) => {
    const invite = await tx.householdInvite.findUnique({ where: { codeHash: hashOf(code) }, include: { household: true } });
    if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
      throw badRequest('That code doesn’t work. Ask for a new one: they last two days and work once.', 'bad_code');
    }
    const me = await tx.user.findUniqueOrThrow({ where: { id: userId }, include: { household: { include: { members: { select: { id: true } } } } } });
    if (me.householdId === invite.householdId) throw new HttpError(409, 'You’re already in this house.', 'already_member');
    if (me.household) {
      // leaving a house of one is just tidying up; leaving one with others is a decision
      if (me.household.members.some((m) => m.id !== userId)) {
        throw new HttpError(409, 'You’re in another house. Leave it first, from Settings.', 'leave_first');
      }
      await tx.household.delete({ where: { id: me.household.id } });
    }
    // your food comes with you
    await moveFood(tx, userId, invite.household.ownerId);
    await tx.user.update({ where: { id: userId }, data: { householdId: invite.householdId } });
    await tx.householdInvite.update({ where: { id: invite.id }, data: { usedAt: new Date(), usedById: userId } });
    return { joined: true };
  });
}

/**
 * Leave the house. A member starts on an empty shelf; the owner hands the
 * house, and its food, to the member who joined next, or, alone, simply keeps
 * their food and the house goes.
 */
export async function leaveHouse(userId: string, db?: Tx) {
  const run = async (tx: Tx) => {
    const me = await tx.user.findUniqueOrThrow({ where: { id: userId }, include: { household: { include: { members: { select: { id: true }, orderBy: { createdAt: 'asc' } } } } } });
    const house = me.household;
    if (!house) return { left: false };
    if (house.ownerId !== userId) {
      await tx.user.update({ where: { id: userId }, data: { householdId: null } });
      return { left: true };
    }
    const next = house.members.find((m) => m.id !== userId);
    if (!next) {
      await tx.user.update({ where: { id: userId }, data: { householdId: null } });
      await tx.household.delete({ where: { id: house.id } });
      return { left: true };
    }
    await moveFood(tx, userId, next.id);
    await tx.household.update({ where: { id: house.id }, data: { ownerId: next.id } });
    await tx.user.update({ where: { id: userId }, data: { householdId: null } });
    return { left: true, handedTo: next.id };
  };
  return db ? run(db) : prisma.$transaction(run);
}

/** The owner takes someone out of the house; they start on an empty shelf. */
export async function removeMember(ownerId: string, memberId: string) {
  const house = await prisma.household.findUnique({ where: { ownerId } });
  if (!house) throw new HttpError(403, 'Only the person who set up the house can do that.', 'not_owner');
  if (memberId === ownerId) throw badRequest('To leave your own house, use Leave.');
  const { count } = await prisma.user.updateMany({ where: { id: memberId, householdId: house.id }, data: { householdId: null } });
  if (count === 0) throw notFound('They’re not in your house.');
  return { removed: true };
}

/** Who is in the person's house, and whether they set it up. */
export async function houseFor(userId: string) {
  const me = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { household: { include: { members: { select: { id: true, email: true }, orderBy: { createdAt: 'asc' } } } } },
  });
  if (!me.household) return { house: null };
  return {
    house: {
      id: me.household.id,
      youOwn: me.household.ownerId === userId,
      members: me.household.members.map((m) => ({ id: m.id, email: m.email, you: m.id === userId, owner: m.id === me.household!.ownerId })),
    },
  };
}
