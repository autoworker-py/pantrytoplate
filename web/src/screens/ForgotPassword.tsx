import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';
import { ApiError, api } from '../lib/api';
import { done } from '../lib/native';
import { CodeBoxes } from '../components/CodeBoxes';
import { errorText } from '../ui/kit';
import { RESEND_SECONDS, clock, useCountdown } from './ConfirmEmail';

/**
 * A forgotten password, from the sign-in screen: email a code to the address,
 * then the code and a new password sign you straight in. Every other device
 * that was signed in is signed out by it.
 *
 * Whether the address has an account is never said, here or by the server, so
 * this cannot be used to find out who uses the app.
 */
export function ForgotPassword({ startEmail, onBack }: { startEmail: string; onBack: () => void }) {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState(startEmail);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useCountdown(0);

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const address = (sentTo ?? email).trim();
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/auth/password/forgot', { email: address });
      setSentTo(address);
      setWait(RESEND_SECONDS);
    } catch (cause) {
      setError(errorText(cause, 'Could not send a code. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function reset(event: FormEvent) {
    event.preventDefault();
    if (!sentTo) return;
    setBusy(true);
    setError(null);
    try {
      await resetPassword(sentTo, code, password);
      done();
    } catch (cause) {
      setBusy(false);
      if (cause instanceof ApiError && cause.code.startsWith('code_')) {
        setWrong(true);
        setCode('');
      }
      setError(errorText(cause, 'Could not set the new password. Try again.'));
    }
  }

  if (!sentTo) {
    return (
      <form className="auth-form" onSubmit={send} noValidate>
        <div className="field" style={{ marginTop: 0 }}>
          <label htmlFor="reset-email">Email</label>
          <input id="reset-email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus={!startEmail} required />
        </div>
        {error ? <div className="banner error" style={{ marginTop: 14 }}>{error}</div> : null}
        <button type="submit" className="btn block" style={{ marginTop: 22 }} disabled={busy || !email.includes('@')}>
          {busy ? 'Sending…' : 'Email me a code'}
        </button>
        <div className="code-links">
          <button type="button" className="link-btn" onClick={onBack}>Back to sign in</button>
        </div>
      </form>
    );
  }

  return (
    <form className="auth-form" onSubmit={reset} noValidate>
      <p className="code-sent">If <strong>{sentTo}</strong> has an account, a 6-digit code is on its way to it.</p>
      <CodeBoxes value={code} onChange={(digits) => { setCode(digits); setWrong(false); }} wrong={wrong} disabled={busy} autoFocus />
      {/* tells the iPhone whose password this is, so it can save the new one */}
      <input type="email" autoComplete="username" value={sentTo} readOnly hidden />
      <div className="field">
        <label htmlFor="new-password">New password</label>
        <input id="new-password" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
        <span className="hint">At least 8 characters.</span>
      </div>
      {error ? <div className="banner error" style={{ marginTop: 14 }}>{error}</div> : null}
      <button type="submit" className="btn block" style={{ marginTop: 22 }} disabled={busy || code.length < 6 || password.length < 8}>
        {busy ? 'Saving…' : 'Set new password'}
      </button>
      <div className="code-links">
        <button type="button" className="link-btn" disabled={busy || wait > 0} onClick={() => void send()}>
          Send a new code{wait > 0 ? <span className="code-wait"> · {clock(wait)}</span> : null}
        </button>
        <button type="button" className="link-btn" onClick={onBack}>Back to sign in</button>
      </div>
    </form>
  );
}
