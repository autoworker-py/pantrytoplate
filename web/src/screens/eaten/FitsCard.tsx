import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { done } from '../../lib/native';
import { formatAmount } from '../../lib/format';
import { Icon } from '../../ui/Icon';
import { errorText, useToast } from '../../ui/kit';
import { mealNow } from '../ItemSheet';
import './eaten.css';

interface Idea {
  kind: 'food' | 'recipe';
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  kcal: number;
  protein: number;
  why: string;
}

/**
 * Under the day: two or three things that fit what's left, from the pantry or
 * ready to cook, best at protein when protein is short. Tap a food to log it;
 * a recipe opens. Nothing shows when there's no gap worth filling.
 */
export function FitsCard({ day, extra, onLogged }: { day: string; extra: number; onLogged: () => void }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState<{ kcalLeft: number; proteinLeft: number; ideas: Idea[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    api.getFresh<{ kcalLeft: number; proteinLeft: number; ideas: Idea[] }>(`/api/consumption/suggest?date=${day}&extra=${extra}`).then(setData).catch(() => setData(null));
  }, [day, extra]);
  useEffect(load, [load]);

  async function take(idea: Idea) {
    if (idea.kind === 'recipe') {
      navigate(`/recipes/${idea.id}`);
      return;
    }
    setBusy(idea.id);
    try {
      await api.post(`/api/inventory/${idea.id}/consume`, { quantity: idea.quantity, unit: idea.unit, mealSlot: mealNow() });
      done();
      toast(`Logged ${formatAmount(idea.quantity ?? 1, idea.unit ?? '')} of ${idea.name.toLowerCase()}.`);
      onLogged();
      load();
    } catch (cause) {
      toast(errorText(cause, 'That could not be logged.'));
    } finally {
      setBusy(null);
    }
  }

  if (!data?.ideas.length) return null;
  return (
    <section className="fits-card" aria-label="Fits what's left">
      <div className="fits-head">
        <span className="t">Fits what’s left</span>
        <span className="s num">{data.kcalLeft.toLocaleString()} kcal{data.proteinLeft > 0 ? ` · ${data.proteinLeft} g protein` : ''}</span>
      </div>
      {data.ideas.map((idea) => (
        <button key={`${idea.kind}-${idea.id}`} type="button" className="fits-row" disabled={busy === idea.id} onClick={() => void take(idea)}>
          <span className="grow">
            <span className="t">{idea.name}</span>
            <span className="s">
              {idea.kind === 'food' ? `${formatAmount(idea.quantity ?? 1, idea.unit ?? '')} · ` : 'Recipe · '}
              {idea.kcal} kcal · {idea.why}
            </span>
          </span>
          <Icon name={idea.kind === 'food' ? 'plus' : 'chevron'} size={18} className="faint" />
        </button>
      ))}
    </section>
  );
}
