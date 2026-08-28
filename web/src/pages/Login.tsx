import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { ApiError, api } from '../lib/api';
import { PrivacyNotice } from '../components/PrivacyNotice';

export default function Login() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('demo@pantry.local');
  const [password, setPassword] = useState('pantrydemo');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * Consent is a decision, so it gets its own tick box and its own state — not
   * a line of small print under a button. The notice itself is one tap away and
   * readable before an account exists.
   */
  const [agreed, setAgreed] = useState(false);
  const [reading, setReading] = useState(false);
  const [privacyVersion, setPrivacyVersion] = useState<string | null>(null);
  /**
   * Whether the notice could be fetched at all.
   *
   * Consent has to be to a specific version, so without it there is nothing to
   * agree to and the button must stay disabled. What it must not do is stay
   * disabled *silently* — a ticked box above a dead button is the app refusing
   * to explain itself.
   */
  const [noticeFailed, setNoticeFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setNoticeFailed(false);
    api
      .get<{ version: string }>('/api/auth/privacy')
      .then((data) => {
        if (!live) return;
        setPrivacyVersion(data.version);
      })
      .catch(() => {
        if (!live) return;
        setPrivacyVersion(null);
        setNoticeFailed(true);
      });
    return () => {
      live = false;
    };
  }, [attempt]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (mode === 'register' && (!agreed || !privacyVersion)) {
      setError('Please read and accept the privacy notice first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await (mode === 'login' ? login(email, password) : register(email, password, privacyVersion!));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container safe-top" style={{ maxWidth: 420 }}>
      <h1>
        Pantry to Plate
      </h1>
      <p className="muted" style={{ marginBottom: 24 }}>
        Enter your food once. After that, eating it is a tap.
      </p>

      <div className="card">
        <div className="segmented">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
            Sign in
          </button>
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>
            Create account
          </button>
        </div>

        {error ? <div className="banner error">{error}</div> : null}

        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          {mode === 'register' && noticeFailed ? (
            <div className="banner error">
              <strong>Cannot reach the privacy notice.</strong> Creating an account means agreeing to a
              specific version of it, so we will not ask you to agree to something we could not show you.
              <button
                type="button"
                className="btn-ghost btn-sm"
                style={{ marginTop: 8 }}
                onClick={() => setAttempt((n) => n + 1)}
              >
                Try again
              </button>
            </div>
          ) : null}

          {mode === 'register' ? (
            <div className="consent">
              <label className="consent-check">
                <input
                  type="checkbox"
                  checked={agreed}
                  disabled={!privacyVersion}
                  onChange={(event) => setAgreed(event.target.checked)}
                />
                <span>
                  I have read and agree to the{' '}
                  <button type="button" className="btn-ghost" onClick={() => setReading(true)}>
                    privacy notice
                  </button>
                  .
                </span>
              </label>
              <p className="muted" style={{ margin: '8px 0 0' }}>
                It covers what this app stores, that your camera images never leave your device, and
                how to delete everything.
              </p>
            </div>
          ) : null}

          <button
            type="submit"
            className="btn-block"
            disabled={busy || (mode === 'register' && (!agreed || !privacyVersion))}
          >
            {busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        {reading ? <PrivacyNotice onClose={() => setReading(false)} /> : null}
      </div>

      {/*
        * The demo account is seeded on a development database only; the
        * deployed build skips it deliberately. Offering those credentials in
        * the shipped app would just be an invitation to a failed sign-in.
        */}
      {import.meta.env.VITE_API_URL ? null : (
        <p className="muted">
          The seeded demo account is <strong>demo@pantry.local</strong> / <strong>pantrydemo</strong> — it comes
          with a stocked pantry.
        </p>
      )}
    </div>
  );
}
