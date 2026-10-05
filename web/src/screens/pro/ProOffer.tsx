import { useState, type ReactNode } from 'react';

/**
 * What Pantry2Plate Pro costs, and the code that unlocks it while payments are
 * switched off. Website only: the iPhone app sells nothing until it has
 * in-app purchase (see proOnOffer).
 */
export function ProOffer({
  cta,
  note,
  busy = false,
  error,
  onRedeem,
  children,
}: {
  /** the main button's words, e.g. "Start 7-day free trial" */
  cta: string;
  /** one more line of small print under the button */
  note?: string;
  busy?: boolean;
  error?: string | null;
  onRedeem: (code: string) => void;
  /** shown between the button and the code, e.g. an ad that earns a photo */
  children?: ReactNode;
}) {
  const [plan, setPlan] = useState<'year' | 'month'>('year');
  const [redeeming, setRedeeming] = useState(false);
  const [code, setCode] = useState('');

  return (
    <>
      <div className="plans" role="radiogroup" aria-label="Plan">
        <button type="button" role="radio" aria-checked={plan === 'year'} className={`plan${plan === 'year' ? ' on' : ''}`} onClick={() => setPlan('year')}>
          <span className="plan-tag">Best value</span>
          <span className="t">Yearly</span>
          <span className="price num">$79.99<small> / year</small></span>
          <span className="s">$6.67 a month</span>
        </button>
        <button type="button" role="radio" aria-checked={plan === 'month'} className={`plan${plan === 'month' ? ' on' : ''}`} onClick={() => setPlan('month')}>
          <span className="t">Monthly</span>
          <span className="price num">$9.99<small> / month</small></span>
          <span className="s">Cancel any time</span>
        </button>
      </div>
      <button type="button" className="btn block" style={{ marginTop: 16 }} disabled>{cta}</button>
      <p className="fine" style={{ textAlign: 'center', marginTop: 8 }}>
        {note ? <>{note} </> : null}Not available until payments are switched on.
      </p>

      {children}

      {redeeming ? (
        <div className="redeem">
          <div className="field">
            <label htmlFor="pw-code">Code</label>
            <input id="pw-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="XXXX-XXXX" autoCapitalize="characters" autoComplete="off" />
          </div>
          {error ? <div className="banner error" style={{ marginTop: 12 }}>{error}</div> : null}
          <button type="button" className="btn block" style={{ marginTop: 12 }} disabled={busy || code.trim().length < 4} onClick={() => onRedeem(code.trim())}>{busy ? 'Checking…' : 'Unlock Pro'}</button>
        </div>
      ) : (
        <button type="button" className="btn ghost block" style={{ marginTop: 10 }} onClick={() => setRedeeming(true)}>Have a code? Redeem it</button>
      )}
    </>
  );
}
