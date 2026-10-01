/**
 * Confirming an email with a six-digit code, and resetting a forgotten
 * password the same way.
 *
 * Email codes switch on only where email can be sent; without it nothing about
 * signing up changes. Accounts made before they existed are never asked. A
 * code has to be hard to guess: it is spent once used, dies after a few wrong
 * tries, and an account only gets so many tries a day.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { PRIVACY_VERSION } from '../src/content/privacy.js';
import { outbox, useTransport, type Mail } from '../src/services/mail.js';

let app: FastifyInstance;
const stamp = Date.now();
const address = (label: string) => `${label}-${stamp}@example.test`;

beforeAll(async () => {
  app = await buildApp();
});
beforeEach(() => useTransport('outbox'));
afterEach(() => useTransport(null));
afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: `-${stamp}@example.test` } } });
  await app.close();
});

async function call(method: 'GET' | 'POST', url: string, payload?: Record<string, unknown>, token?: string) {
  const response = await app.inject({
    method,
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(payload === undefined ? {} : { payload }),
  });
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : null };
}

async function register(label: string) {
  const email = address(label);
  const response = await call('POST', '/api/auth/register', { email, password: 'testpassword', acceptPrivacyVersion: PRIVACY_VERSION });
  expect(response.status).toBe(201);
  return { email, token: response.body.token as string, id: response.body.user.id as string };
}

/** The newest email to an address about a purpose, waiting a moment for one sent in the background. */
async function mailTo(email: string, about: 'confirm your email' | 'set a new password' = 'confirm your email'): Promise<Mail> {
  for (let i = 0; i < 50; i++) {
    const mail = [...outbox].reverse().find((m) => m.to === email && m.text.includes(about));
    if (mail) return mail;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`no "${about}" email to ${email}`);
}
const codeIn = (mail: Mail) => /^(\d{6}) is your Pantry2Plate code$/.exec(mail.subject)![1]!;
const wrong = (right: string) => (right === '000000' ? '111111' : '000000');
/** skip the half-minute wait between codes */
const letResend = (userId: string, purpose: string) => prisma.emailCode.update({ where: { userId_purpose: { userId, purpose } }, data: { sentAt: new Date(0) } });

describe('a new account confirms its email', () => {
  it('is emailed a code and can do nothing else until it is typed in', async () => {
    const someone = await register('newbie');
    const mail = await mailTo(someone.email);
    const sent = codeIn(mail);
    expect(mail.text).toContain(sent);
    expect(mail.html).toContain(sent);

    const me = await call('GET', '/api/auth/me', undefined, someone.token);
    expect(me.body.user.emailConfirmed).toBe(false);
    const pantry = await call('GET', '/api/inventory', undefined, someone.token);
    expect(pantry.status).toBe(403);
    expect(pantry.body.error).toBe('email_unconfirmed');

    expect((await call('POST', '/api/auth/email/confirm', { code: wrong(sent) }, someone.token)).body.error).toBe('code_wrong');
    // typed with a space, the way the email is easy to read
    expect((await call('POST', '/api/auth/email/confirm', { code: `${sent.slice(0, 3)} ${sent.slice(3)}` }, someone.token)).status).toBe(200);

    expect((await call('GET', '/api/auth/me', undefined, someone.token)).body.user.emailConfirmed).toBe(true);
    expect((await call('GET', '/api/inventory', undefined, someone.token)).status).toBe(200);
    // a code is spent once used
    expect((await call('POST', '/api/auth/email/confirm', { code: sent }, someone.token)).body.error).toBe('code_expired');
  });

  it('keeps only a keyed hash of the code', async () => {
    const someone = await register('hashed');
    const sent = codeIn(await mailTo(someone.email));
    const row = await prisma.emailCode.findUniqueOrThrow({ where: { userId_purpose: { userId: someone.id, purpose: 'confirm' } } });
    expect(row.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.codeHash).not.toContain(sent);
  });

  it('can fix a typo in the address before confirming', async () => {
    const someone = await register('typo');
    const oldCode = codeIn(await mailTo(someone.email));
    const fixed = address('fixed');
    const changed = await call('POST', '/api/auth/email/change', { email: fixed }, someone.token);
    expect(changed.status).toBe(200);
    expect(changed.body.email).toBe(fixed);

    // the code sent to the mistyped address no longer works; the one sent to the right one does
    expect((await call('POST', '/api/auth/email/confirm', { code: oldCode }, changed.body.token)).status).toBe(400);
    const newCode = codeIn(await mailTo(fixed));
    expect((await call('POST', '/api/auth/email/confirm', { code: newCode }, changed.body.token)).status).toBe(200);
    expect((await call('GET', '/api/auth/me', undefined, changed.body.token)).body.user.email).toBe(fixed);

    // once confirmed, the address is not changed this way
    expect((await call('POST', '/api/auth/email/change', { email: address('again') }, changed.body.token)).status).toBe(403);
  });

  it('cannot take an address another account has', async () => {
    const first = await register('first');
    const second = await register('second');
    expect((await call('POST', '/api/auth/email/change', { email: first.email }, second.token)).status).toBe(409);
  });

  it('sends a new code on request, but not twice in a moment', async () => {
    const someone = await register('again');
    await mailTo(someone.email);
    const tooSoon = await call('POST', '/api/auth/email/send-code', {}, someone.token);
    expect(tooSoon.status).toBe(429);
    expect(tooSoon.body.error).toBe('code_wait');

    await letResend(someone.id, 'confirm');
    const before = outbox.filter((m) => m.to === someone.email).length;
    expect((await call('POST', '/api/auth/email/send-code', {}, someone.token)).body.sent).toBe(true);
    expect(outbox.filter((m) => m.to === someone.email).length).toBe(before + 1);
  });

  it('stops a code after five wrong tries, and the account after ten in a day', async () => {
    const guesser = await register('guesser');
    const first = codeIn(await mailTo(guesser.email));
    const results = [];
    for (let i = 0; i < 5; i++) results.push((await call('POST', '/api/auth/email/confirm', { code: wrong(first) }, guesser.token)).body.error);
    expect(results).toEqual(['code_wrong', 'code_wrong', 'code_wrong', 'code_wrong', 'code_used_up']);
    // even the right code is refused once it has been guessed at five times
    expect((await call('POST', '/api/auth/email/confirm', { code: first }, guesser.token)).body.error).toBe('code_used_up');

    await letResend(guesser.id, 'confirm');
    await call('POST', '/api/auth/email/send-code', {}, guesser.token);
    const second = codeIn(await mailTo(guesser.email));
    expect(second).toBeDefined();
    let last;
    for (let i = 0; i < 5; i++) last = await call('POST', '/api/auth/email/confirm', { code: wrong(second) }, guesser.token);
    expect(last!.status).toBe(429);
    expect(last!.body.error).toBe('code_locked');
    expect((await call('POST', '/api/auth/email/confirm', { code: second }, guesser.token)).body.error).toBe('code_locked');

    // and no more codes are sent today
    await letResend(guesser.id, 'confirm');
    expect((await call('POST', '/api/auth/email/send-code', {}, guesser.token)).body.error).toBe('code_limit');
  });

  it('can still delete the account before confirming', async () => {
    const leaving = await register('unsure');
    expect((await call('POST', '/api/auth/delete-account', { password: 'testpassword' }, leaving.token)).status).toBe(200);
  });
});

describe('without email set up, nothing changes', () => {
  it('signs people straight in and offers no reset', async () => {
    useTransport('off');
    const someone = await register('noemail');
    expect(outbox.some((m) => m.to === someone.email)).toBe(false);
    expect((await call('GET', '/api/auth/me', undefined, someone.token)).body.user.emailConfirmed).toBe(true);
    expect((await call('GET', '/api/inventory', undefined, someone.token)).status).toBe(200);
    expect((await call('GET', '/api/auth/options')).body.emailCodes).toBe(false);
    expect((await call('POST', '/api/auth/password/forgot', { email: someone.email })).status).toBe(503);

    // and switching email on later does not lock out an account made before
    useTransport('outbox');
    expect((await call('GET', '/api/auth/options')).body.emailCodes).toBe(true);
    expect((await call('GET', '/api/inventory', undefined, someone.token)).status).toBe(200);
  });
});

describe('a forgotten password', () => {
  it('is replaced with the emailed code, signing out every other device', async () => {
    useTransport('off');
    const owner = await register('forgetful');
    useTransport('outbox');
    const lostPhone = owner.token;
    await new Promise((resolve) => setTimeout(resolve, 1100)); // tokens carry seconds

    expect((await call('POST', '/api/auth/password/forgot', { email: owner.email })).body.sent).toBe(true);
    const sent = codeIn(await mailTo(owner.email, 'set a new password'));

    expect((await call('POST', '/api/auth/password/reset', { email: owner.email, code: wrong(sent), newPassword: 'a-new-password' })).body.error).toBe('code_wrong');
    const reset = await call('POST', '/api/auth/password/reset', { email: owner.email, code: sent, newPassword: 'a-new-password' });
    expect(reset.status).toBe(200);
    expect((await call('GET', '/api/auth/me', undefined, reset.body.token)).status).toBe(200);
    expect((await call('GET', '/api/auth/me', undefined, lostPhone)).status).toBe(401);
    expect((await call('POST', '/api/auth/login', { email: owner.email, password: 'a-new-password' })).status).toBe(200);
    expect((await call('POST', '/api/auth/login', { email: owner.email, password: 'testpassword' })).status).toBe(401);
  });

  it('answers the same whether or not the email has an account', async () => {
    const nobody = address('nobody');
    const answer = await call('POST', '/api/auth/password/forgot', { email: nobody });
    expect(answer).toEqual({ status: 200, body: { sent: true } });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(outbox.some((m) => m.to === nobody)).toBe(false);
    expect((await call('POST', '/api/auth/password/reset', { email: nobody, code: '123456', newPassword: 'whatever-it-is' })).body.error).toBe('code_wrong');
  });

  it('confirms the email too, since the code proved the address', async () => {
    const someone = await register('resetter');
    await mailTo(someone.email);
    await call('POST', '/api/auth/password/forgot', { email: someone.email });
    const sent = codeIn(await mailTo(someone.email, 'set a new password'));
    const reset = await call('POST', '/api/auth/password/reset', { email: someone.email, code: sent, newPassword: 'another-password' });
    expect((await call('GET', '/api/auth/me', undefined, reset.body.token)).body.user.emailConfirmed).toBe(true);
  });
});
