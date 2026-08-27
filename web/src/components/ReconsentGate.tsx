/**
 * Shown when the privacy notice has been revised since this person agreed.
 *
 * Agreement was to a specific version of a specific text. Carrying it forward
 * to a document that now says something different would make the stored record
 * worthless — so the app stops here until the new version is read and accepted,
 * and offers the exit if it is not.
 */
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PrivacyNotice } from './PrivacyNotice';

export function ReconsentGate() {
  const { refresh, logout } = useAuth();
  const [version, setVersion] = useState<string | null>(null);
  const [effective, setEffective] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ version: string; effective: string }>('/api/auth/privacy')
      .then((data) => {
        setVersion(data.version);
        setEffective(data.effective);
      })
      .catch(() => setError('Could not load the notice. Please try again shortly.'));
  }, []);

  async function accept() {
    if (!version) return;
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/auth/privacy/accept', { version });
      await refresh();
    } catch {
      setError('Could not record that. Please try again.');
      setBusy(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 520, paddingTop: 40 }}>
      <h1>The privacy notice has changed</h1>
      <p className="muted">
        {effective ? `A new version took effect on ${effective}. ` : ''}
        You agreed to an earlier one, so we are asking again rather than assuming it still covers this.
      </p>

      {error ? <div className="banner error">{error}</div> : null}

      <div className="card">
        <button type="button" className="btn-secondary btn-block" onClick={() => setReading(true)}>
          Read the new notice
        </button>

        <label className="consent-check" style={{ marginTop: 16 }}>
          <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
          <span>I have read and agree to the updated privacy notice.</span>
        </label>

        <button
          type="button"
          className="btn-block"
          style={{ marginTop: 14 }}
          onClick={accept}
          disabled={busy || !agreed || !version}
        >
          Continue
        </button>
      </div>

      <button type="button" className="btn-ghost btn-block" onClick={logout}>
        Sign out instead
      </button>
      <p className="muted" style={{ textAlign: 'center' }}>
        Your data is untouched either way. You can delete your account from Settings once signed in.
      </p>

      {reading ? <PrivacyNotice onClose={() => setReading(false)} /> : null}
    </div>
  );
}
