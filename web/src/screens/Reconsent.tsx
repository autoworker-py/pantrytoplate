import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PrivacyNotice } from '../components/PrivacyNotice';
import { Logo, errorText } from '../ui/kit';

/**
 * The privacy notice changed since you agreed. Agreement was to a specific
 * text, so the app waits here until the new one is read and accepted, and
 * always offers the way out.
 */
export default function Reconsent() {
  const { refresh, logout } = useAuth();
  const [version, setVersion] = useState<string | null>(null);
  const [effective, setEffective] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ version: string; effective: string }>('/api/auth/privacy')
      .then((d) => { setVersion(d.version); setEffective(d.effective); })
      .catch(() => setError('Could not load the notice. Try again shortly.'));
  }, []);

  async function accept() {
    if (!version) return;
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/auth/privacy/accept', { version });
      await refresh();
    } catch (e) {
      setError(errorText(e, 'Could not save that. Try again.'));
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-hero">
        <Logo size={56} />
        <h1>The privacy notice changed</h1>
        <p className="lede">You agreed to an earlier version. Read what changed{effective ? `, in effect from ${new Date(effective).toLocaleDateString()}` : ''}, then carry on.</p>
      </div>
      <div className="auth-form">
        {error ? <div className="banner error">{error}</div> : null}
        <button type="button" className="btn secondary block" onClick={() => setReading(true)} disabled={!version}>Read the notice</button>
        <label className="check">
          <input type="checkbox" checked={agreed} disabled={!version} onChange={(e) => setAgreed(e.target.checked)} />
          <span>I have read and agree to this version of the privacy notice.</span>
        </label>
        <button type="button" className="btn block" style={{ marginTop: 20 }} onClick={accept} disabled={busy || !agreed || !version}>{busy ? 'Saving…' : 'Agree and continue'}</button>
        <button type="button" className="btn ghost block" onClick={logout} disabled={busy}>Not now, sign me out</button>
      </div>
      {reading ? <PrivacyNotice onClose={() => setReading(false)} /> : null}
    </div>
  );
}
