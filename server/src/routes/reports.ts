import type { FastifyPluginAsync } from 'fastify';
import { wasteLog, wastePatterns, wasteReport, wasteTrend } from '../services/reports.js';
import { prisma } from '../db.js';

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  /** "You binned 6 things this month, mostly produce." */
  app.get('/waste', async (request) => {
    const { days } = request.query as { days?: string };
    return wasteReport(request.userId, Number(days) || 30);
  });

  /** Things you bin again and again — a habit you can actually change. */
  app.get('/waste/patterns', async (request) => ({
    patterns: await wastePatterns(request.userId),
    trend: await wasteTrend(request.userId),
  }));

  /**
   * Everything this account holds, as one file. Your pantry should not be
   * trapped in someone else's database.
   */
  app.get('/export', async (request, reply) => {
    const userId = request.userId;
    const [user, inventory, logs, removals, shopping, ratings, plan] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, createdAt: true, weightGoal: true, dailyCalorieTarget: true },
      }),
      prisma.inventoryItem.findMany({ where: { userId }, include: { foodReference: true } }),
      prisma.consumptionLog.findMany({ where: { userId }, include: { foodReference: true, recipe: true } }),
      prisma.inventoryRemoval.findMany({ where: { userId }, include: { foodReference: true } }),
      prisma.shoppingListItem.findMany({ where: { userId } }),
      prisma.recipeRating.findMany({ where: { userId }, include: { recipe: true } }),
      prisma.mealPlanEntry.findMany({ where: { userId }, include: { recipe: true } }),
    ]);

    reply.header('Content-Disposition', `attachment; filename="pantry-export-${new Date().toISOString().slice(0, 10)}.json"`);
    return {
      exportedAt: new Date().toISOString(),
      user,
      pantry: inventory.map((item) => ({
        name: item.foodReference.name,
        quantity: item.quantity,
        unit: item.unit,
        expirationDate: item.expirationDate,
        storageLocation: item.storageLocation,
        isLeftover: item.isLeftover,
      })),
      diary: logs.map((log) => ({
        name: log.foodReference.name,
        quantity: log.quantityConsumed,
        unit: log.unit,
        calories: log.calories,
        mealSlot: log.mealSlot,
        recipe: log.recipe?.name ?? null,
        consumedAt: log.consumedAt,
      })),
      removals: removals.map((removal) => ({
        name: removal.foodReference.name,
        quantity: removal.quantity,
        unit: removal.unit,
        reason: removal.reason,
        removedAt: removal.removedAt,
      })),
      shoppingList: shopping.map((item) => ({ name: item.name, quantity: item.quantityNeeded, unit: item.unit })),
      ratings: ratings.map((rating) => ({ recipe: rating.recipe.name, rating: rating.rating, note: rating.note })),
      mealPlan: plan.map((entry) => ({ recipe: entry.recipe.name, plannedFor: entry.plannedFor, servings: entry.servings })),
    };
  });

  /** Every item that left the pantry, for the log view. */
  app.get('/waste/log', async (request) => {
    const { days, reason, limit } = request.query as { days?: string; reason?: string; limit?: string };
    return {
      entries: await wasteLog(request.userId, {
        days: Number(days) || 90,
        ...(reason ? { reason } : {}),
        limit: Number(limit) || 200,
      }),
    };
  });
};

export default routes;
