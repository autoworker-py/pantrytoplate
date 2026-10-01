import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';
import { ApiError, api, tokenStore } from '../lib/api';
import { done } from '../lib/native';
import { CodeBoxes } from '../components/CodeBoxes';
import { Logo, errorText } from '../ui/kit';

/** how long before another code can be sent; the server holds to the same */
export const RESEND_SECONDS = 30;

/** Counts down to zero a second at a time; set it to start again. */
export function useCountdown(start: number): [number, (seconds: number) => void] {
  const [left, setLeft] = useState(start);
  useEffect(() => {
    if (left <= 0) return;
    const tick = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(tick);
  }, [left]);
  return [left, setLeft];
}

export const clock = (seconds: number) => `0:${String(seconds).padStart(2, '0')}`;

/**
 * Right after signing up: the app opens once the six digits emailed to the new
 * address are typed in. A mistyped address is fixed here, and another code
 * can be sent after half a minute.
 */
export default function ConfirmEmail() {
  const { user, refresh, logout } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [wait, setWait] = useCountdown(RESEND_SECONDS);
  const [changing, setChanging] = useState(false);
  const [newEmail, setNewEmail] = useState('');

  async function confirm(digits: string) {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await api.post('/api/auth/email/confirm', { code: digits });
      done();
      await refresh();
    } catch (cause) {
      setBusy(false);
      setCode('');
      setWrong(true);
      setError(errorText(cause, 'That code did not work. Try again.'));
    }
  }

  function type(digits: string) {
    setCode(digits);
    setWrong(false);
    setError(null);
    if (digits.length === 6 && !busy) void confirm(digits);
  }

  async function sendAnother() {
    setError(null);
    setNote(null);
    try {
      const result = await api.post<{ sent: boolean; confirmed?: boolean }>('/api/auth/email/send-code');
      if (result.confirmed) return void (await refresh());
      setNote(`A new code is on its way to ${user?.email}.`);
      setWait(RESEND_SECONDS);
    } catch (cause) {
      const seconds = cause instanceof ApiError ? (cause.details as { waitSeconds?: number } | undefined)?.waitSeconds : undefined;
      if (seconds) setWait(seconds);
      setError(errorText(cause, 'Could not send a new code. Try again in a minute.'));
    }
  }

  async function changeEmail(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ email: string; token: string }>('/api/auth/email/change', { email: newEmail.trim() });
      tokenStore.set(result.token);
      await refresh();
      setChanging(false);
      setCode('');
      setWait(RESEND_SECONDS);
      setNote(`New code sent to ${result.email}.`);
    } catch (cause) {
      setError(errorText(cause, 'Could not change the email. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-hero">
        <Logo size={64} />
        <h1>Check your email</h1>
        <p className="lede">
          We sent a 6-digit code to <strong className="confirm-to">{user?.email}</strong>
        </p>
      </div>

      {changing ? (
        <form className="auth-form" onSubmit={changeEmail} noValidate>
          <div className="field" style={{ marginTop: 0 }}>
            <label htmlFor="new-email">Your email</label>
            <input id="new-email" type="email" autoComplete="email" inputMode="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} autoFocus required />
          </div>
          {error ? <div className="banner error" style={{ marginTop: 14 }}>{error}</div> : null}
          <button type="submit" className="btn block" style={{ marginTop: 18 }} disabled={busy || !newEmail.includes('@')}>
            {busy ? 'Sending…' : 'Send the code there'}
          </button>
          <div className="code-links">
            <button type="button" className="link-btn" onClick={() => { setChanging(false); setError(null); }}>Keep {user?.email}</button>
          </div>
        </form>
      ) : (
        <div className="auth-form">
          <CodeBoxes value={code} onChange={type} wrong={wrong} disabled={busy} autoFocus />
          {error ? (
            <div className="banner error" style={{ marginTop: 18 }}>{error}</div>
          ) : (
            <p className="code-note" aria-live="polite">{busy ? 'Checking…' : note}</p>
          )}
          <div className="code-links">
            <button type="button" className="link-btn" disabled={wait > 0} onClick={sendAnother}>
              Send a new code{wait > 0 ? <span className="code-wait"> · {clock(wait)}</span> : null}
            </button>
            <span className="fine">
              Wrong email?{' '}
              <button type="button" className="link-btn" onClick={() => { setChanging(true); setNewEmail(user?.email ?? ''); setError(null); setNote(null); }}>
                Change it
              </button>
            </span>
          </div>
        </div>
      )}

      <button type="button" className="auth-leave fine" onClick={logout}>Sign out</button>
    </div>
  );
}
