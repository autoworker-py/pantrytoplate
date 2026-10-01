/**
 * Sending email: only ever the six-digit codes, never marketing.
 *
 * A deployed server sends through Resend once RESEND_API_KEY is set, and until
 * then sends nothing at all, which is what switches email codes off (see
 * emailCodesOn). A laptop has no key and prints each email to the log instead,
 * so the whole flow can be tried without an account anywhere. Tests have email
 * off unless they switch on the outbox, and read what would have been sent.
 */
import { env } from '../env.js';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

type Transport = 'resend' | 'log' | 'outbox' | 'off';

let forced: Transport | null = null;
/** For tests: pretend email is set up ('outbox') or not ('off'); null goes back to the default. */
export const useTransport = (transport: Transport | null) => { forced = transport; };

/** What a test would have sent, oldest first. */
export const outbox: Mail[] = [];

function transport(): Transport {
  if (forced) return forced;
  // tests sign up a lot of accounts that have nothing to do with email; the email tests switch it on
  if (env.nodeEnv === 'test') return 'off';
  if (env.resendApiKey) return 'resend';
  return env.nodeEnv === 'production' ? 'off' : 'log';
}

/** Whether codes can be sent at all; without it, nobody is asked for one. */
export const emailCodesOn = () => transport() !== 'off';

export async function sendMail(mail: Mail): Promise<void> {
  switch (transport()) {
    case 'outbox':
      outbox.push(mail);
      return;
    case 'log':
      console.info(`[mail] to ${mail.to}: ${mail.subject}`);
      return;
    case 'resend': {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: env.emailFrom, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Resend refused the email (${response.status}): ${(await response.text()).slice(0, 300)}`);
      return;
    }
    case 'off':
      throw new Error('Email is not set up on this server.');
  }
}
