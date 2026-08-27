import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getSettings, suggestTargets, updateSettings, SUGGESTED_CALORIES } from '../services/settings.js';

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  app.get('/', async (request) => ({
    settings: await getSettings(request.userId),
    suggestions: {
      lose: suggestTargets('lose'),
      maintain: suggestTargets('maintain'),
      gain: suggestTargets('gain'),
      baseline: SUGGESTED_CALORIES,
    },
  }));

  app.patch('/', async (request) => {
    const body = z
      .object({
        weightGoal: z.enum(['lose', 'maintain', 'gain']).optional(),
        // body data, so a weight that moved is a two-tap correction rather than
        // something you have to sign up again to change
        heightCm: z.number().min(120).max(250).nullish(),
        weightKg: z.number().min(30).max(350).nullish(),
        birthYear: z.number().int().min(1900).max(new Date().getFullYear() - 12).nullish(),
        sex: z.enum(['male', 'female', 'unspecified']).nullish(),
        activityLevel: z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']).nullish(),
        weeklyRateKg: z.number().min(0).max(1.5).nullish(),
        dailyCalorieTarget: z.number().int().min(800).max(8000).optional(),
        proteinTargetGrams: z.number().int().min(0).max(600).nullish(),
        carbsTargetGrams: z.number().int().min(0).max(1200).nullish(),
        fatTargetGrams: z.number().int().min(0).max(500).nullish(),
        adsEnabled: z.boolean().optional(),
        autoShoppingEnabled: z.boolean().optional(),
        expiryWarningDays: z.number().int().min(1).max(30).optional(),
        unitSystem: z.enum(['metric', 'imperial']).optional(),
        dietTags: z.array(z.string()).optional(),
        notifyExpiry: z.boolean().optional(),
      })
      .parse(request.body);

    return { settings: await updateSettings(request.userId, body) };
  });
};

export default routes;
