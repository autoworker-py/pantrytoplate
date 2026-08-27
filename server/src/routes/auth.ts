import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { changePassword, registerUser, verifyCredentials } from '../services/auth.js';
import { prisma } from '../db.js';
import { PRIVACY_POLICY, PRIVACY_VERSION, PRIVACY_EFFECTIVE } from '../content/privacy.js';
import { estimateEnergy, ACTIVITY_LABELS } from '../services/energy.js';

const credentials = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
});

const routes: FastifyPluginAsync = async (app) => {
  /** The notice itself, readable before signing up rather than only after. */
  app.get('/privacy', async () => ({
    version: PRIVACY_VERSION,
    effective: PRIVACY_EFFECTIVE,
    markdown: PRIVACY_POLICY,
  }));

  app.post('/register', async (request, reply) => {
    const body = credentials
      .extend({
        /**
         * Consent is a deliberate act, so it is a required field rather than a
         * default. Recording the version means a later revision can ask again
         * instead of assuming this agreement covered it.
         */
        acceptPrivacyVersion: z.string().min(1, 'You must accept the privacy notice to create an account.'),
      })
      .parse(request.body);

    if (body.acceptPrivacyVersion !== PRIVACY_VERSION) {
      return reply.code(409).send({
        error: 'privacy_version_mismatch',
        message: 'The privacy notice has been updated. Please read the current version and accept it.',
        currentVersion: PRIVACY_VERSION,
      });
    }

    const user = await registerUser(body.email, body.password);
    await prisma.user.update({
      where: { id: user.id },
      data: { privacyAcceptedAt: new Date(), privacyVersion: PRIVACY_VERSION },
    });
    const token = app.jwt.sign({ sub: user.id, email: user.email });
    return reply.code(201).send({ token, user, privacyVersion: PRIVACY_VERSION });
  });

  /**
   * Accept a revised notice. Separate from registration because an existing
   * account has to be able to agree to a new version without making a new one.
   */
  app.post('/privacy/accept', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { version } = z.object({ version: z.string().min(1) }).parse(request.body);
    if (version !== PRIVACY_VERSION) {
      return reply.code(409).send({
        error: 'privacy_version_mismatch',
        message: 'That is not the current privacy notice.',
        currentVersion: PRIVACY_VERSION,
      });
    }
    await prisma.user.update({
      where: { id: request.userId },
      data: { privacyAcceptedAt: new Date(), privacyVersion: PRIVACY_VERSION },
    });
    return { accepted: true, version: PRIVACY_VERSION };
  });

  app.post('/login', async (request) => {
    const { email, password } = credentials.parse(request.body);
    const user = await verifyCredentials(email, password);
    return { token: app.jwt.sign({ sub: user.id, email: user.email }), user };
  });

  app.post('/password', { preHandler: [app.authenticate] }, async (request) => {
    const body = z
      .object({
        currentPassword: z.string().min(1, 'Enter your current password.'),
        newPassword: z.string().min(8, 'New password must be at least 8 characters.'),
      })
      .parse(request.body);
    return changePassword(request.userId, body.currentPassword, body.newPassword);
  });

  app.get('/me', { preHandler: [app.authenticate] }, async (request) => {
    const user = await prisma.user.findUnique({ where: { id: request.userId } });
    const estimate = user ? estimateEnergy(user) : null;
    return {
      user: {
        id: request.user.sub,
        email: request.user.email,
        onboarded: Boolean(user?.onboardedAt),
        /** false once the notice is revised, which re-gates the app */
        privacyCurrent: user?.privacyVersion === PRIVACY_VERSION,
        privacyVersion: user?.privacyVersion ?? null,
      },
      currentPrivacyVersion: PRIVACY_VERSION,
      energy: estimate,
    };
  });

  /**
   * First-run body questions. Every field is optional — the app works without
   * any of it, and skipping is a real answer rather than a dead end.
   */
  app.post('/onboarding', { preHandler: [app.authenticate] }, async (request) => {
    const body = z
      .object({
        heightCm: z.number().min(120).max(250).nullish(),
        weightKg: z.number().min(30).max(350).nullish(),
        birthYear: z.number().int().min(1900).max(new Date().getFullYear() - 12).nullish(),
        sex: z.enum(['male', 'female', 'unspecified']).nullish(),
        activityLevel: z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']).nullish(),
        weightGoal: z.enum(['lose', 'maintain', 'gain']).nullish(),
        weeklyRateKg: z.number().min(0).max(1.5).nullish(),
        /** true when the user chose to skip rather than answer */
        skipped: z.boolean().optional(),
      })
      .parse(request.body ?? {});

    const merged = {
      heightCm: body.heightCm ?? null,
      weightKg: body.weightKg ?? null,
      birthYear: body.birthYear ?? null,
      sex: body.sex ?? null,
      activityLevel: body.activityLevel ?? null,
      weeklyRateKg: body.weeklyRateKg ?? null,
      weightGoal: body.weightGoal ?? 'maintain',
    };
    const estimate = estimateEnergy(merged);

    const user = await prisma.user.update({
      where: { id: request.userId },
      data: {
        ...merged,
        onboardedAt: new Date(),
        // the estimate becomes the target only when there was enough to compute
        // one; a skipped setup leaves the existing default alone
        ...(estimate
          ? {
              dailyCalorieTarget: estimate.target,
              proteinTargetGrams: estimate.protein,
              carbsTargetGrams: estimate.carbs,
              fatTargetGrams: estimate.fat,
            }
          : {}),
      },
    });

    return {
      onboarded: true,
      energy: estimate,
      targets: {
        calories: user.dailyCalorieTarget,
        protein: user.proteinTargetGrams,
        carbs: user.carbsTargetGrams,
        fat: user.fatTargetGrams,
      },
    };
  });

  /** What the app can work out from body data, without saving anything. */
  app.post('/energy/preview', { preHandler: [app.authenticate] }, async (request) => {
    const body = z
      .object({
        heightCm: z.number().nullish(),
        weightKg: z.number().nullish(),
        birthYear: z.number().int().nullish(),
        sex: z.string().nullish(),
        activityLevel: z.string().nullish(),
        weightGoal: z.string().nullish(),
        weeklyRateKg: z.number().nullish(),
      })
      .parse(request.body ?? {});
    return { energy: estimateEnergy(body), activityLabels: ACTIVITY_LABELS };
  });

  /**
   * Delete the account and everything in it.
   *
   * The notice promises a real deletion rather than a flag, and cascades in the
   * schema carry that out: inventory, diary, waste, shopping list, ratings,
   * plans and any recipes this person added all go with the row.
   */
  app.post('/delete-account', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { password } = z.object({ password: z.string().min(1) }).parse(request.body);
    const user = await prisma.user.findUnique({ where: { id: request.userId } });
    if (!user) return reply.code(404).send({ error: 'not_found', message: 'No such account.' });

    // deleting an account is irreversible; proving identity first is the point
    await verifyCredentials(user.email, password);
    await prisma.user.delete({ where: { id: request.userId } });
    return reply.code(200).send({ deleted: true });
  });
};

export default routes;
