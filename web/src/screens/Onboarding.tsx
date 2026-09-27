import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { EnergyEstimate } from '../lib/types';
import { Logo } from '../ui/kit';
import { BodyInputs, localUnitSystem, type UnitSystem } from '../components/BodyInputs';

type Sex = 'male' | 'female' | 'unspecified';
const ACTIVITY = [
  { value: 'sedentary', label: 'Not much', note: 'Desk job, little exercise' },
  { value: 'light', label: 'A little', note: 'Light exercise 1–3 days a week' },
  { value: 'moderate', label: 'Moderate', note: 'Exercise 3–5 days a week' },
  { value: 'active', label: 'A lot', note: 'Hard exercise 6–7 days a week' },
  { value: 'very_active', label: 'Very high', note: 'Physical job, or training twice a day' },
];
const GOALS = [
  { value: 'lose', label: 'Lose weight' },
  { value: 'maintain', label: 'Stay the same' },
  { value: 'gain', label: 'Gain weight' },
] as const;

/**
 * A few numbers, asked once, all optional. They only set a calorie target;
 * the pantry and recipes work without any of them.
 */
export default function Onboarding() {
  const { refresh } = useAuth();
  const [system, setSystem] = useState<UnitSystem>(localUnitSystem);
  const [heightCm, setHeightCm] = useState<number | null>(null);
  const [weightKg, setWeightKg] = useState<number | null>(null);
  const [born, setBorn] = useState('');
  const [sex, setSex] = useState<Sex>('unspecified');
  const [activity, setActivity] = useState('moderate');
  const [goal, setGoal] = useState<'lose' | 'maintain' | 'gain'>('maintain');
  const [energy, setEnergy] = useState<EnergyEstimate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const body = { heightCm, weightKg, birthYear: Number(born) || null, sex, activityLevel: activity, weightGoal: goal };
  const complete = Boolean(body.heightCm && body.weightKg && body.birthYear);

  useEffect(() => {
    if (!complete) { setEnergy(null); return; }
    let live = true;
    const t = window.setTimeout(() => {
      api.post<{ energy: EnergyEstimate | null }>('/api/auth/energy/preview', body).then((d) => live && setEnergy(d.energy)).catch(() => live && setEnergy(null));
    }, 250);
    return () => { live = false; window.clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heightCm, weightKg, born, sex, activity, goal, complete]);

  async function finish(skipped: boolean) {
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/auth/onboarding', skipped ? { skipped: true } : body);
      // the units they chose here are the units the app speaks from now on
      await api.patch('/api/settings', { unitSystem: system }).catch(() => undefined);
      await refresh();
    } catch {
      setError('Could not save that. You can set it later in Settings.');
      setBusy(false);
    }
  }

  return (
    <div className="auth onboarding">
      <div className="auth-hero" style={{ marginBottom: 18 }}>
        <Logo size={56} />
        <h1>A few numbers</h1>
        <p className="lede">Only used to work out a daily calorie target. Skip it and everything else still works.</p>
      </div>
      <div className="auth-form">
        {error ? <div className="banner error">{error}</div> : null}
        <BodyInputs system={system} onSystem={setSystem} heightCm={heightCm} weightKg={weightKg} onChange={(h, w) => { setHeightCm(h); setWeightKg(w); }} />
        <div className="field"><label htmlFor="o-y">Year you were born</label><input id="o-y" type="number" inputMode="numeric" placeholder="1995" value={born} onChange={(e) => setBorn(e.target.value)} /></div>

        <div className="label" style={{ marginTop: 18 }}>Sex</div>
        <div className="chips wrap" style={{ marginTop: 8 }}>
          {([['female', 'Female'], ['male', 'Male'], ['unspecified', 'Rather not say']] as Array<[Sex, string]>).map(([v, l]) => <button key={v} type="button" className={`chip${sex === v ? ' on' : ''}`} onClick={() => setSex(v)}>{l}</button>)}
        </div>
        <p className="fine" style={{ marginTop: 6 }}>The formula uses it. Rather not say takes the midpoint instead of guessing.</p>

        <div className="label" style={{ marginTop: 18 }}>How active are you?</div>
        <div className="choice-list">
          {ACTIVITY.map((a) => (
            <button key={a.value} type="button" className={`choice${activity === a.value ? ' on' : ''}`} onClick={() => setActivity(a.value)}>
              <span className="t">{a.label}</span><span className="s">{a.note}</span>
            </button>
          ))}
        </div>

        <div className="label" style={{ marginTop: 18 }}>Your goal</div>
        <div className="goal-seg" style={{ marginTop: 8 }}>
          {GOALS.map((g) => <button key={g.value} type="button" className={goal === g.value ? 'on' : ''} onClick={() => setGoal(g.value)}>{g.label}</button>)}
        </div>

        <div className={`target-card${energy ? ' on' : ''}`} aria-live="polite">
          {energy ? (
            <>
              <span className="big num">{energy.target.toLocaleString()}</span>
              <span className="fine">kcal a day · {energy.protein} g protein · {energy.carbs} g carbs · {energy.fat} g fat</span>
              {energy.notes.length ? <span className="fine">{energy.notes[0]}</span> : null}
            </>
          ) : (
            <span className="fine">Your target appears here once height, weight and year are in.</span>
          )}
        </div>

        <button type="button" className="btn block" style={{ marginTop: 20 }} onClick={() => void finish(false)} disabled={busy || !complete}>{busy ? 'Saving…' : 'Use this target'}</button>
        <button type="button" className="btn ghost block" onClick={() => void finish(true)} disabled={busy}>Skip for now</button>
      </div>
    </div>
  );
}
