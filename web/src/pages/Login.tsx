import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';

export default function Login() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('demo@pantry.local');
  const [password, setPassword] = useState('pantrydemo');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await (mode === 'login' ? login(email, password) : register(email, password));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 420, paddingTop: 48 }}>
      <h1>
        Pantry<span style={{ color: 'var(--green)' }}>→</span>Plate
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
          <button type="submit" className="btn-block" disabled={busy}>
            {busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      </div>

      <p className="muted">
        The seeded demo account is <strong>demo@pantry.local</strong> / <strong>pantrydemo</strong> — it comes with a
        stocked pantry.
      </p>
    </div>
  );
}
