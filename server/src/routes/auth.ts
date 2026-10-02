import type { FastifyPluginAsync, FastifyReply, RouteShorthandOptions } from 'fastify';
import { z } from 'zod';
import { accountByEmail, changePassword, changeUnconfirmedEmail, deleteAccount, registerUser, resetPassword, verifyCredentials } from '../services/auth.js';
import { checkCode, sendCode, type Check, type Sending } from '../services/emailCodes.js';
import { emailCodesOn } from '../services/mail.js';
import { env } from '../env.js';
import { HttpError, badRequest } from '../errors.js';
import { prisma } from '../db.js';
import { PRIVACY_POLICY, PRIVACY_VERSION, PRIVACY_EFFECTIVE } from '../content/privacy.js';
import { estimateEnergy, ACTIVITY_LABELS } from '../services/energy.js';
import { byEmail, limit } from '../limits.js';

const credentials = z.object({
  email: z.string().max(254).email('Enter a valid email address.'),
  // bcrypt reads 72 bytes; the ceiling stops a megabyte "password" being hashed
  password: z.string().min(8, 'Password must be at least 8 characters.').max(128, 'Passwords can be up to 128 characters.'),
});

/** the six digits from the email, forgiving a space or dash typed between them */
const code = z
  .string()
  .max(20)
  .transform((typed) => typed.replace(/\D/g, ''))
  .pipe(z.string().length(6, 'Enter the 6-digit code from the email.'));

function codeRefused(check: Exclude<Check, 'ok'>): HttpError {
  if (check === 'wrong') return badRequest('That code is not right. Check the email and try again.', 'code_wrong');
  if (check === 'used_up') return badRequest('That code has had too many wrong tries. Send a new one.', 'code_used_up');
  if (check === 'locked') return new HttpError(429, 'Too many wrong codes today. Try again tomorrow.', 'code_locked');
  return badRequest('That code has expired. Send a new one.', 'code_expired');
}

function notSent(reply: FastifyReply, sending: Exclude<Sending, { sent: true }>) {
  return sending.reason === 'wait'
    ? reply.code(429).send({ error: 'code_wait', message: `A code was sent a moment ago. Try again in ${sending.waitSeconds} seconds.`, details: { waitSeconds: sending.waitSeconds } })
    : reply.code(429).send({ error: 'code_limit', message: 'That is a lot of codes for one day. Try again tomorrow.' });
}

const emailFailed = () => new HttpError(503, 'The email could not be sent just now. Try again in a minute.', 'email_failed');

/** A route a new account can reach before its email is confirmed (see authenticate). */
const beforeConfirming = (options: RouteShorthandOptions = {}): RouteShorthandOptions => ({ ...options, config: { ...options.config, unconfirmedOk: true } });

const routes: FastifyPluginAsync = async (app) => {
  /** The notice itself, readable before signing up rather than only after. */
  app.get('/privacy', async () => ({
    version: PRIVACY_VERSION,
    effective: PRIVACY_EFFECTIVE,
    markdown: PRIVACY_POLICY,
  }));

  /** What the sign-in and support screens can offer: a password reset once email is set up, and where to write. */
  app.get('/options', async () => ({ emailCodes: emailCodesOn(), support: env.supportEmail || null }));

  app.post('/register', limit(10, '1 hour'), async (request, reply) => {
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
    // with email set up, the address is confirmed by a code before the app opens
    const confirming = emailCodesOn();
    await prisma.user.update({
      where: { id: user.id },
      data: { privacyAcceptedAt: new Date(), privacyVersion: PRIVACY_VERSION, emailUnconfirmed: confirming },
    });
    // a failed send is not a failed sign-up: the code screen offers to send another
    if (confirming) await sendCode(user, 'confirm').catch((error: unknown) => request.log.error(error, 'confirmation code not sent'));
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

  // ten tries per email per address every fifteen minutes: slow for a guesser, invisible to a person
  app.post('/login', limit(10, '15 minutes', byEmail), async (request) => {
    const { email, password } = credentials.parse(request.body);
    const user = await verifyCredentials(email, password);
    // signing in before confirming, say on a second phone: send a fresh code for the screen that follows
    if (user.emailUnconfirmed && emailCodesOn()) void sendCode(user, 'confirm').catch((error: unknown) => request.log.error(error, 'confirmation code not sent'));
    return { token: app.jwt.sign({ sub: user.id, email: user.email }), user: { id: user.id, email: user.email, createdAt: user.createdAt } };
  });

  app.post('/password', { preHandler: [app.authenticate], ...limit(10, '15 minutes') }, async (request) => {
    const body = z
      .object({
        currentPassword: z.string().min(1, 'Enter your current password.').max(128),
        newPassword: z.string().min(8, 'New password must be at least 8 characters.').max(128, 'Passwords can be up to 128 characters.'),
      })
      .parse(request.body);
    const result = await changePassword(request.userId, body.currentPassword, body.newPassword);
    // every other device is signed out now; this one carries on with a new token
    return { ...result, token: app.jwt.sign({ sub: request.user.sub, email: request.user.email }) };
  });

  app.get('/me', { preHandler: [app.authenticate], ...beforeConfirming() }, async (request) => {
    const user = await prisma.user.findUnique({ where: { id: request.userId } });
    const estimate = user ? estimateEnergy(user) : null;
    return {
      user: {
        id: request.user.sub,
        email: user?.email ?? request.user.email,
        /** false from signing up until the emailed code is typed in, which gates the app */
        emailConfirmed: !(user?.emailUnconfirmed && emailCodesOn()),
        onboarded: Boolean(user?.onboardedAt),
        /** Pantry2Plate Pro: no ads, and as many meal photos as they like */
        plus: user?.plusSince != null,
        /** false once the notice is revised, which re-gates the app */
        privacyCurrent: user?.privacyVersion === PRIVACY_VERSION,
        privacyVersion: user?.privacyVersion ?? null,
      },
      currentPrivacyVersion: PRIVACY_VERSION,
      energy: estimate,
    };
  });

  /** The code from the email, typed in: the address is theirs, and the app opens. */
  app.post('/email/confirm', { preHandler: [app.authenticate], ...beforeConfirming(limit(30, '15 minutes')) }, async (request) => {
    const body = z.object({ code }).parse(request.body);
    const check = await checkCode(request.userId, 'confirm', body.code);
    if (check !== 'ok') throw codeRefused(check);
    await prisma.user.update({ where: { id: request.userId }, data: { emailUnconfirmed: false } });
    return { confirmed: true };
  });

  /** "Send a new code" on the code screen. */
  app.post('/email/send-code', { preHandler: [app.authenticate], ...beforeConfirming(limit(15, '1 hour')) }, async (request, reply) => {
    const account = await prisma.user.findUniqueOrThrow({ where: { id: request.userId } });
    if (!account.emailUnconfirmed || !emailCodesOn()) return { sent: false, confirmed: true };
    const sending = await sendCode(account, 'confirm').catch((error: unknown) => {
      request.log.error(error, 'confirmation code not sent');
      throw emailFailed();
    });
    return sending.sent ? { sent: true } : notSent(reply, sending);
  });

  /** "Wrong email? Change it": a typo at sign-up, fixed before the code is typed in. */
  app.post('/email/change', { preHandler: [app.authenticate], ...beforeConfirming(limit(10, '1 hour')) }, async (request, reply) => {
    const { email } = z.object({ email: credentials.shape.email }).parse(request.body);
    const account = await changeUnconfirmedEmail(request.userId, email);
    const sending = await sendCode(account, 'confirm').catch((error: unknown) => {
      request.log.error(error, 'confirmation code not sent');
      throw emailFailed();
    });
    if (!sending.sent) return notSent(reply, sending);
    // the token carries the address, so this phone gets one with the new one
    return { email: account.email, token: app.jwt.sign({ sub: account.id, email: account.email }) };
  });

  /**
   * Forgot password: email a code to the address, if an account has it. The
   * answer is the same either way and arrives before the email is sent, so it
   * says nothing about who has an account.
   */
  app.post('/password/forgot', limit(5, '1 hour', byEmail), async (request) => {
    if (!emailCodesOn()) throw new HttpError(503, 'Resetting a password by email is not available yet.', 'email_off');
    const { email } = z.object({ email: credentials.shape.email }).parse(request.body);
    const account = await accountByEmail(email);
    if (account) void sendCode(account, 'reset').catch((error: unknown) => request.log.error(error, 'reset code not sent'));
    return { sent: true };
  });

  /** The code from the email and a new password: set it, sign out every other device, and sign in here. */
  app.post('/password/reset', limit(10, '15 minutes', byEmail), async (request) => {
    const body = z.object({ email: credentials.shape.email, code, newPassword: credentials.shape.password }).parse(request.body);
    const account = await accountByEmail(body.email);
    // no account answers exactly as a wrong code does
    if (!account) throw codeRefused('wrong');
    const check = await checkCode(account.id, 'reset', body.code);
    if (check !== 'ok') throw codeRefused(check);
    await resetPassword(account.id, body.newPassword);
    return { token: app.jwt.sign({ sub: account.id, email: account.email }), user: { id: account.id, email: account.email, createdAt: account.createdAt } };
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
        // the app is for people 16 and over, as sign-up asks them to confirm
        birthYear: z.number().int().min(1900).max(new Date().getFullYear() - 16, 'Pantry2Plate is for people 16 and over.').nullish(),
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
  app.post('/delete-account', { preHandler: [app.authenticate], ...beforeConfirming(limit(10, '15 minutes')) }, async (request, reply) => {
    const { password } = z.object({ password: z.string().min(1).max(128) }).parse(request.body);
    const user = await prisma.user.findUnique({ where: { id: request.userId } });
    if (!user) return reply.code(404).send({ error: 'not_found', message: 'No such account.' });

    // deleting an account is irreversible; proving identity first is the point
    await verifyCredentials(user.email, password);
    await deleteAccount(request.userId);
    return reply.code(200).send({ deleted: true });
  });
};

export default routes;
