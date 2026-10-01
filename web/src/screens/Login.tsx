import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { PrivacyNotice } from '../components/PrivacyNotice';
import { errorText } from '../ui/kit';
import { ForgotPassword } from './ForgotPassword';

/* the demo account only exists on a development database, so only offer it there */
const DEV = !import.meta.env.VITE_API_URL;

export default function Login() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [email, setEmail] = useState(DEV ? 'demo@pantry.local' : '');
  const [password, setPassword] = useState(DEV ? 'pantrydemo' : '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [reading, setReading] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const [noticeFailed, setNoticeFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // whether this server can email codes: what makes "Forgot password?" possible
  const [emailCodes, setEmailCodes] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .get<{ emailCodes: boolean }>('/api/auth/options')
      .then((d) => live && setEmailCodes(d.emailCodes))
      .catch(() => undefined);
    return () => { live = false; };
  }, []);

  useEffect(() => {
    let live = true;
    setNoticeFailed(false);
    api
      .get<{ version: string }>('/api/auth/privacy')
      .then((d) => live && setVersion(d.version))
      .catch(() => {
        if (!live) return;
        setVersion(null);
        setNoticeFailed(true);
      });
    return () => { live = false; };
  }, [attempt]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    // consent is to a specific version of a specific text; no version, nothing to agree to
    if (mode === 'register' && (!agreed || !version)) {
      setError('Read and accept the privacy notice first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await (mode === 'login' ? login(email.trim(), password) : register(email.trim(), password, version!));
    } catch (cause) {
      setError(errorText(cause, 'Could not sign in. Check your details and try again.'));
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-hero">
        <div className={`auth-door${busy ? ' open' : ''}`} aria-hidden="true">
          <div className="inside"><i style={{ top: 64 }} /><i style={{ top: 118 }} /></div>
          <div className="panel"><img src="/logo-mark.png" alt="" /></div>
        </div>
        <h1>{mode === 'login' ? 'Welcome back' : mode === 'register' ? 'Make your pantry' : 'Reset your password'}</h1>
        <p className="lede">
          {mode === 'forgot' ? 'We will email you a code, and the code lets you choose a new password.' : 'Enter your food once. After that, eating it or cooking with it is a tap.'}
        </p>
      </div>

      {mode === 'forgot' ? (
        <ForgotPassword startEmail={email.trim()} onBack={() => { setMode('login'); setError(null); }} />
      ) : (
      <form className="auth-form" onSubmit={submit} noValidate>
        <div className="seg" role="tablist" style={{ marginBottom: 6 }}>
          <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'on' : ''} onClick={() => { setMode('login'); setError(null); }}>Sign in</button>
          <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'on' : ''} onClick={() => { setMode('register'); setError(null); }}>Create account</button>
        </div>

        {error ? <div className="banner error" style={{ marginTop: 14 }}>{error}</div> : null}

        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          {mode === 'register' && emailCodes ? <span className="hint">We will email you a code to confirm it.</span> : null}
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
          {mode === 'register' ? <span className="hint">At least 8 characters.</span> : null}
          {mode === 'login' && emailCodes ? (
            <button type="button" className="link-btn forgot-link" onClick={() => { setMode('forgot'); setError(null); }}>Forgot password?</button>
          ) : null}
        </div>

        {mode === 'register' ? (
          <>
            {noticeFailed ? (
              <div className="banner error" style={{ marginTop: 16 }}>
                <strong>Cannot reach the privacy notice.</strong> Creating an account means agreeing to a specific version of it, so we will not ask you to agree to something we could not show you.{' '}
                <button type="button" className="link-btn" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
              </div>
            ) : null}
            <label className="check">
              <input type="checkbox" checked={agreed} disabled={!version} onChange={(e) => setAgreed(e.target.checked)} />
              <span>
                I am 16 or older, and I have read and agree to the <button type="button" className="link-btn" onClick={() => setReading(true)}>privacy notice</button>. It covers what the app stores, which photos leave your phone (only meals you snap), and how to delete everything.
              </span>
            </label>
          </>
        ) : null}

        <button type="submit" className="btn block" style={{ marginTop: 22 }} disabled={busy || !email || password.length < (mode === 'register' ? 8 : 1) || (mode === 'register' && (!agreed || !version))}>
          {busy ? 'Opening…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>

        {DEV ? <p className="fine" style={{ marginTop: 16, textAlign: 'center' }}>Demo account: demo@pantry.local / pantrydemo</p> : null}
      </form>
      )}

      {reading ? <PrivacyNotice onClose={() => setReading(false)} /> : null}
    </div>
  );
}
