import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { CookPreview, MealSlot } from '../lib/types';
import { formatAmount, formatServings } from '../lib/format';
import { describeDuration, formatClock, parseDuration } from '../lib/duration';
import { loadTimer, secondsRemaining, startTimer, stopTimer, type RunningTimer } from '../lib/cookTimer';
import { Overlay } from '../components/Overlay';
import { Icon } from '../ui/Icon';
import { Sheet, Stepper, errorText, useToast } from '../ui/kit';
import { mealNow } from './ItemSheet';

export interface Adjustments {
  servings: number | null;
  choices: Record<string, string>;
  exclude: string[];
  swaps: Record<string, string>;
}
export const NO_ADJUSTMENTS: Adjustments = { servings: null, choices: {}, exclude: [], swaps: {} };

export function previewPath(id: string, a: Adjustments): string {
  const p = new URLSearchParams();
  if (a.servings) p.set('servings', String(a.servings));
  const picked = Object.entries(a.choices).map(([food, lot]) => `${food}:${lot}`).join(',');
  if (picked) p.set('choices', picked);
  if (a.exclude.length) p.set('exclude', a.exclude.join(','));
  const swapped = Object.entries(a.swaps).map(([from, to]) => `${from}:${to}`).join(',');
  if (swapped) p.set('swap', swapped);
  return `/api/recipes/${id}/cook-preview${p.toString() ? `?${p}` : ''}`;
}

/** Stored as "1. …\n2. …": the list supplies the numbers, so strip the stored ones. */
export function parseSteps(instructions: string): string[] {
  return instructions
    .split('\n')
    .map((line) => line.replace(/^\s*(?:\d+[.)]\s*)+/, '').replace(/^[•*-]\s*/, '').trim())
    .filter((line) => line.length > 0);
}

interface CookResult {
  cookEventId?: string;
  caloriesLogged: number | null;
  ranOut: Array<{ name: string }>;
  leftovers: { servings: number } | null;
}

/**
 * Nothing is deducted until this is confirmed. Every line the app is about to
 * change is on screen, before and after, so a bad conversion is caught by a
 * person instead of silently corrupting the pantry.
 */
export function CookSheet({
  preview,
  adjustments,
  onClose,
  onCooked,
}: {
  preview: CookPreview;
  adjustments: Adjustments;
  onClose: () => void;
  onCooked: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keep, setKeep] = useState(0);
  const [meal, setMeal] = useState<MealSlot>(() => (mealNow() === 'snack' ? 'dinner' : mealNow()));
  const toast = useToast();
  const lines = preview.ingredients.flatMap((ing) => ing.plan.deductions.map((d) => ({ ing, d })));
  const unconvertible = preview.ingredients.some((i) => i.plan.unconvertibleLots.length > 0);

  async function cook() {
    setBusy(true);
    setError(null);
    try {
      const { result } = await api.post<{ result: CookResult }>(`/api/recipes/${preview.id}/cook`, {
        servings: adjustments.servings ?? preview.servingsCooked,
        mealSlot: meal,
        choices: adjustments.choices,
        exclude: adjustments.exclude,
        swaps: adjustments.swaps,
        keepServings: keep,
      });
      const kcal = result.caloriesLogged === null ? 'Pantry updated.' : `${Math.round(result.caloriesLogged)} kcal logged.`;
      const kept = result.leftovers ? ` ${result.leftovers.servings} ${result.leftovers.servings === 1 ? 'portion' : 'portions'} in the fridge.` : '';
      const ran = result.ranOut?.length ? ` ${result.ranOut.map((r) => r.name).join(', ')} ran out and went on your list.` : '';
      toast(
        `Cooked. ${kcal}${kept}${ran}`,
        result.cookEventId
          ? {
              label: 'Undo',
              run: () => {
                void api
                  .delete(`/api/consumption/${result.cookEventId}`)
                  .then(() => { toast('Undone. Everything is back in the pantry.'); onCooked(); })
                  .catch((e) => toast(errorText(e, 'Could not undo that.')));
              },
            }
          : undefined,
      );
      onCooked();
    } catch (cause) {
      setError(errorText(cause, 'Could not cook this recipe.'));
      setBusy(false);
    }
  }

  return (
    <Sheet title="What gets used" sub={`${preview.name} · ${formatServings(preview.servingsCooked)}`} onClose={onClose}>
      {error ? <div className="banner error" style={{ marginTop: 10 }}>{error}</div> : null}
      <div className="deductions">
        {lines.map(({ ing, d }) => (
          <div className="deduction" key={d.inventoryItemId + ing.recipeIngredientId}>
            <span className="grow">
              <span className="t">{ing.name}</span>
              <span className="s">−{formatAmount(d.quantityDeducted, d.unit)}</span>
            </span>
            <span className="after">
              <span className="before">{formatAmount(d.quantityBefore, d.unit)}</span>
              <Icon name="chevron" size={14} />
              <span className="now">{formatAmount(d.quantityAfter, d.unit)}</span>
            </span>
          </div>
        ))}
        {lines.length === 0 ? <p className="fine" style={{ padding: '12px 0' }}>Nothing in your pantry will change.</p> : null}
      </div>

      {unconvertible ? (
        <div className="banner" style={{ marginTop: 12 }}>
          Some of what you own is in units the app will not guess a conversion for, so those were left alone. Check the amounts above.
        </div>
      ) : null}

      {preview.servingsCooked >= 2 ? (
        <div className="keep">
          <div className="label">Keep some for later?</div>
          <div className="keep-row">
            <Stepper value={keep} onChange={setKeep} min={0} max={Math.floor(preview.servingsCooked - 0.01)} label="portions to keep" />
            <span className="fine">{keep === 0 ? 'Eating it all now.' : `${preview.servingsCooked - keep} now, ${keep} in the fridge. Only what you eat now counts today.`}</span>
          </div>
        </div>
      ) : null}

      <div className="label" style={{ marginTop: 18 }}>Log it as</div>
      <div className="chips" style={{ marginTop: 8 }}>
        {(['breakfast', 'lunch', 'dinner', 'snack'] as MealSlot[]).map((m) => (
          <button key={m} type="button" className={`chip${meal === m ? ' on' : ''}`} onClick={() => setMeal(m)}>
            {m[0].toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      <button type="button" className="btn block" style={{ marginTop: 22 }} onClick={cook} disabled={busy}>
        {busy ? 'Updating your pantry…' : 'Cook it'}
      </button>
    </Sheet>
  );
}

/**
 * Cooking, not reading: one step at a time, big enough to read from a step
 * back, the screen kept awake, and any duration in a step offered as a timer
 * that keeps running with the app closed.
 */
export function CookMode({ name, steps, onClose }: { name: string; steps: string[]; onClose: () => void }) {
  const toast = useToast();
  const [index, setIndex] = useState(0);
  const [timer, setTimer] = useState<RunningTimer | null>(() => loadTimer());
  const [left, setLeft] = useState<number | null>(() => {
    const t = loadTimer();
    return t ? secondsRemaining(t) : null;
  });

  useEffect(() => {
    let sentinel: { release: () => Promise<void> } | null = null;
    const wake = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<never> } }).wakeLock;
    wake?.request('screen').then((lock) => { sentinel = lock as unknown as { release: () => Promise<void> }; }).catch(() => undefined);
    return () => { void sentinel?.release().catch(() => undefined); };
  }, []);

  // recomputed from the deadline every tick, so a suspended app wakes to the true time
  useEffect(() => {
    if (!timer) return;
    const sync = () => {
      const s = secondsRemaining(timer);
      setLeft(s);
      if (s <= 0) {
        navigator.vibrate?.([200, 100, 200]);
        void stopTimer();
        setTimer(null);
        setLeft(null);
      }
    };
    sync();
    const tick = window.setInterval(sync, 250);
    document.addEventListener('visibilitychange', sync);
    return () => { window.clearInterval(tick); document.removeEventListener('visibilitychange', sync); };
  }, [timer]);

  const step = steps[index] ?? '';
  const seconds = parseDuration(step);

  return (
    <Overlay>
      <div className="cook-mode" role="dialog" aria-modal="true" aria-label={`Cooking ${name}`}>
        <div className="cm-head">
          <div className="grow">
            <div className="cm-name">{name}</div>
            <div className="fine">Step {index + 1} of {steps.length}</div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Leave cook mode"><Icon name="close" size={18} /></button>
        </div>
        <div className="cm-progress"><span style={{ width: `${((index + 1) / Math.max(1, steps.length)) * 100}%` }} /></div>

        <p className="cm-step" key={index}>{step}</p>

        {left !== null ? (
          <div className="cm-timer">
            <span className="num">{formatClock(left)}</span>
            <button type="button" className="btn small secondary" onClick={() => { void stopTimer(); setTimer(null); setLeft(null); }}>Stop</button>
          </div>
        ) : seconds ? (
          <button
            type="button"
            className="btn secondary cm-start"
            onClick={() => {
              void startTimer(seconds, step, name).then((r) => {
                setTimer(r.timer);
                if (!r.liveActivity && !r.notification) {
                  toast(r.problem === 'notifications_denied' ? 'Timer started. Allow notifications to be alerted with the app closed.' : 'Timer started. It can only run while the app is open.');
                }
              });
            }}
          >
            <Icon name="timer" size={20} /> Start {describeDuration(seconds)} timer
          </button>
        ) : null}

        <div className="cm-nav">
          <button type="button" className="btn secondary" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>Back</button>
          {index < steps.length - 1 ? (
            <button type="button" className="btn" onClick={() => setIndex((i) => i + 1)}>Next step</button>
          ) : (
            <button type="button" className="btn" onClick={onClose}>Done</button>
          )}
        </div>
      </div>
    </Overlay>
  );
}
