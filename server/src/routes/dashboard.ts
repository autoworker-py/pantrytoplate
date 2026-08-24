import type { FastifyPluginAsync } from 'fastify';
import { expiringSoon, listInventory, staleInventory, warningDaysFor } from '../services/inventory.js';
import { dailySummary } from '../services/diary.js';
import { searchRecipesForUser } from '../services/recipeMatch.js';
import { listShoppingList } from '../services/shopping.js';
import { slotAds } from '../services/ads.js';
import { wasteReport } from '../services/reports.js';

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  /**
   * Everything the home screen needs in one call: what is about to go off,
   * what you have eaten today, and what you could cook right now.
   */
  app.get('/', async (request) => {
    const { days } = request.query as { days?: string };
    const window = Number(days) || (await warningDaysFor(request.userId));

    const [inventory, expiring, today, recipes, shopping, stale, ads, waste] = await Promise.all([
      listInventory(request.userId, { sort: 'expiration' }),
      expiringSoon(request.userId, window),
      dailySummary(request.userId),
      searchRecipesForUser(request.userId, { limit: 100 }),
      listShoppingList(request.userId),
      staleInventory(request.userId),
      slotAds(request.userId, 'home'),
      wasteReport(request.userId, 30),
    ]);

    const cookable = recipes.filter((recipe) => recipe.canMakeNow);
    // recipes that both are cookable and use something about to expire: the
    // single most useful suggestion the app can make
    const useItUp = cookable.filter((recipe) => recipe.usesExpiring.length > 0);

    return {
      expiryWarningDays: window,
      inventoryCount: inventory.length,
      expiring: expiring.map((item) => ({
        id: item.id,
        name: item.food.name,
        quantity: item.quantity,
        unit: item.unit,
        daysUntilExpiration: item.daysUntilExpiration,
        expiryStatus: item.expiryStatus,
      })),
      useItUpRecipes: useItUp.slice(0, 4).map((r) => ({
        id: r.id,
        name: r.name,
        usesExpiring: r.usesExpiring,
        totalMinutes: r.totalMinutes,
      })),
      today: {
        totalCalories: today.totalCalories,
        entryCount: today.entryCount,
        unknownCalorieEntries: today.unknownCalorieEntries,
        macros: today.macros,
        macroSplit: today.macroSplit,
        targets: today.targets,
        caloriesRemaining: today.caloriesRemaining,
      },
      cookableNow: cookable.slice(0, 5).map((r) => ({
        id: r.id,
        name: r.name,
        servings: r.servings,
        totalMinutes: r.totalMinutes,
        nutrition: r.nutrition,
      })),
      cookableCount: cookable.length,
      shoppingListOpenCount: shopping.filter((item) => !item.isChecked).length,
      staleItems: stale.slice(0, 3),
      waste: {
        wastedItems: waste.wastedItems,
        perWeek: waste.perWeek,
        topWasted: waste.topWasted.slice(0, 3),
        byCategory: waste.byCategory.slice(0, 3),
      },
      ads,
    };
  });
};

export default routes;
