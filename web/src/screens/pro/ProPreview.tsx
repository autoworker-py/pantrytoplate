import { useState, type ReactNode } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { done, proOnOffer } from '../../lib/native';
import { errorText } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import { ProOffer } from './ProOffer';
import './pro.css';

/**
 * A Pro feature, for someone without Pro: the feature at work in a small
 * looping demo, what it does, and Pro. None of it can be used for free.
 */
export function ProPreview({
  name,
  demo,
  title,
  lead,
  points,
  cta,
  note,
}: {
  /** the feature's own name, for the iPhone's note */
  name: string;
  demo: ReactNode;
  title: ReactNode;
  lead: string;
  points: string[];
  /** the button's words on the website */
  cta: string;
  note?: string;
}) {
  const { refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function redeem(code: string) {
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/snap/redeem', { code });
      done();
      // with Pro the screen becomes the feature itself
      await refresh();
    } catch (cause) {
      setError(errorText(cause, 'That code is not valid.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pro-preview">
      <p className="pro-mark">Pantry2Plate Pro</p>
      <div className="pro-demo" aria-hidden="true">{demo}</div>
      <h1 className="title-xl" style={{ marginTop: 22 }}>{title}</h1>
      <p className="muted" style={{ marginTop: 8 }}>{lead}</p>
      <ul className="plus-list">
        {points.map((point) => (
          <li key={point}><Icon name="check" size={17} stroke={2.2} /> {point}</li>
        ))}
      </ul>
      {proOnOffer ? (
        <ProOffer cta={cta} note={note} busy={busy} error={error} onRedeem={(code) => void redeem(code)} />
      ) : (
        <p className="pro-later">{name} is part of Pantry2Plate Pro, which the iPhone app doesn’t sell yet.</p>
      )}
    </div>
  );
}
