/**
 * The first-run questions.
 *
 * Asked once, immediately after signing up, because a calorie target computed
 * from nothing is worse than no target at all — and because asking later means
 * asking someone who has already formed a view of what the app is for.
 *
 * Every field is optional and skipping is a real answer, not a dead end: the
 * pantry, the recipes and the waste log all work without knowing anything about
 * the person using them. Only the calorie target needs this, and it says so.
 */
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

type Sex = 'male' | 'female' | 'unspecified';
type Activity = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
type Goal = 'lose' | 'maintain' | 'gain';

interface Energy {
  bmr: number;
  tdee: number;
  target: number;
  protein: number;
  carbs: number;
  fat: number;
  weeklyRateKg: number;
  flooredAt: number | null;
  notes: string[];
}

const ACTIVITY: Array<{ value: Activity; label: string; note: string }> = [
  { value: 'sedentary', label: 'Not much', note: 'Desk job, little exercise' },
  { value: 'light', label: 'A little', note: 'Light exercise 1–3 days a week' },
  { value: 'moderate', label: 'Moderate', note: 'Exercise 3–5 days a week' },
  { value: 'active', label: 'A lot', note: 'Hard exercise 6–7 days a week' },
  { value: 'very_active', label: 'Very high', note: 'Physical job, or training twice a day' },
];

const GOALS: Array<{ value: Goal; label: string }> = [
  { value: 'lose', label: 'Lose weight' },
  { value: 'maintain', label: 'Stay the same' },
  { value: 'gain', label: 'Gain weight' },
];

export default function Onboarding() {
  const { refresh } = useAuth();
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [sex, setSex] = useState<Sex>('unspecified');
  const [activityLevel, setActivityLevel] = useState<Activity>('moderate');
  const [weightGoal, setWeightGoal] = useState<Goal>('maintain');
  const [energy, setEnergy] = useState<Energy | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const body = {
    heightCm: Number(heightCm) || null,
    weightKg: Number(weightKg) || null,
    birthYear: Number(birthYear) || null,
    sex,
    activityLevel,
    weightGoal,
  };
  const complete = Boolean(body.heightCm && body.weightKg && body.birthYear);

  // the estimate updates as the answers do, so the effect of each is visible
  useEffect(() => {
    if (!complete) {
      setEnergy(null);
      return;
    }
    let live = true;
    const timer = window.setTimeout(() => {
      api
        .post<{ energy: Energy | null }>('/api/auth/energy/preview', body)
        .then((data) => live && setEnergy(data.energy))
        .catch(() => live && setEnergy(null));
    }, 250);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heightCm, weightKg, birthYear, sex, activityLevel, weightGoal, complete]);

  async function finish(skipped: boolean) {
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/auth/onboarding', skipped ? { skipped: true } : body);
      await refresh();
    } catch {
      setError('Could not save that. You can set it later in Settings.');
      setBusy(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 520, paddingTop: 32 }}>
      <h1>A few numbers</h1>
      <p className="muted" style={{ marginBottom: 22 }}>
        Only used to work out a daily calorie target and a macro split. Every part of this is optional —
        the pantry and recipes work without any of it.
      </p>

      {error ? <div className="banner error">{error}</div> : null}

      <div className="card">
        <div className="field-row">
          <div className="field">
            <label htmlFor="height">Height (cm)</label>
            <input
              id="height" type="number" inputMode="numeric" min={120} max={250}
              placeholder="178" value={heightCm}
              onChange={(event) => setHeightCm(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="weight">Weight (kg)</label>
            <input
              id="weight" type="number" inputMode="decimal" min={30} max={350} step="any"
              placeholder="76" value={weightKg}
              onChange={(event) => setWeightKg(event.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="birth-year">Year you were born</label>
          <input
            id="birth-year" type="number" inputMode="numeric" min={1900} max={new Date().getFullYear() - 12}
            placeholder="1995" value={birthYear}
            onChange={(event) => setBirthYear(event.target.value)}
          />
        </div>

        <label>Sex</label>
        <div className="segmented">
          {(['male', 'female', 'unspecified'] as Sex[]).map((option) => (
            <button
              key={option} type="button"
              className={sex === option ? 'active' : ''}
              onClick={() => setSex(option)}
            >
              {option === 'unspecified' ? 'Rather not say' : option === 'male' ? 'Male' : 'Female'}
            </button>
          ))}
        </div>
        <p className="muted" style={{ marginTop: -8 }}>
          The formula uses it. Choosing not to say takes the midpoint of the two rather than guessing.
        </p>
      </div>

      <div className="card">
        <label>How active are you?</label>
        {ACTIVITY.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`activity-row ${activityLevel === option.value ? 'active' : ''}`}
            onClick={() => setActivityLevel(option.value)}
          >
            <span className="activity-label">{option.label}</span>
            <span className="muted">{option.note}</span>
          </button>
        ))}
      </div>

      <div className="card">
        <label>What are you aiming for?</label>
        <div className="goal-grid">
          {GOALS.map((option) => (
            <button
              key={option.value} type="button"
              className={weightGoal === option.value ? 'active' : ''}
              onClick={() => setWeightGoal(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {energy ? (
        <div className="card">
          <h2>Your estimate</h2>
          <div className="stat" style={{ marginBottom: 14 }}>
            <div>
              <div className="value">{energy.target}</div>
              <div className="label">kcal a day</div>
            </div>
            <div>
              <div className="value">{energy.tdee}</div>
              <div className="label">you burn</div>
            </div>
            <div>
              <div className="value">{energy.bmr}</div>
              <div className="label">at rest</div>
            </div>
          </div>

          <div className="macro-row">
            <span>Protein</span><span /><span className="muted">{energy.protein} g</span>
          </div>
          <div className="macro-row">
            <span>Carbs</span><span /><span className="muted">{energy.carbs} g</span>
          </div>
          <div className="macro-row">
            <span>Fat</span><span /><span className="muted">{energy.fat} g</span>
          </div>

          {energy.weeklyRateKg > 0 ? (
            <p className="muted">
              About {energy.weeklyRateKg} kg a week if you hit it consistently.
            </p>
          ) : null}

          {energy.notes.map((note) => (
            <div key={note} className="banner info">{note}</div>
          ))}

          <p className="muted" style={{ marginBottom: 0 }}>
            An estimate from a standard formula, not a measurement and not medical advice. Real needs vary
            by more than ten percent between people of identical size. You can change any of it in Settings.
          </p>
        </div>
      ) : null}

      <button
        type="button"
        className="btn-block"
        onClick={() => finish(false)}
        disabled={busy || !complete}
      >
        {complete ? 'Use this target' : 'Fill in height, weight and year to continue'}
      </button>

      <button
        type="button"
        className="btn-ghost btn-block"
        style={{ marginTop: 10 }}
        onClick={() => finish(true)}
        disabled={busy}
      >
        Skip — I do not want calorie tracking
      </button>
    </div>
  );
}
