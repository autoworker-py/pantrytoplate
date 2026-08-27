import { useEffect, useState } from 'react';
import { ApiError, api } from '../lib/api';
import type { Settings as SettingsData, WeightGoal } from '../lib/types';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { useToast } from '../components/Toast';
import { Icon } from '../components/Icon';

const ACTIVITY_LEVELS = [
  { value: 'sedentary', label: 'Not much', note: 'Desk job, little exercise' },
  { value: 'light', label: 'A little', note: 'Light exercise 1–3 days a week' },
  { value: 'moderate', label: 'Moderate', note: 'Exercise 3–5 days a week' },
  { value: 'active', label: 'A lot', note: 'Hard exercise 6–7 days a week' },
  { value: 'very_active', label: 'Very high', note: 'Physical job, or training twice a day' },
];

const GOALS: Array<{ value: WeightGoal; label: string; note: string }> = [
  { value: 'lose', label: 'Lose', note: 'Lighter, higher-protein recipes first' },
  { value: 'maintain', label: 'Maintain', note: 'No calorie preference in ranking' },
  { value: 'gain', label: 'Gain', note: 'Calorie-dense recipes first' },
];

export default function Settings() {
  const { logout, user } = useAuth();
  const { theme, setTheme } = useTheme();
  const toast = useToast();
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [waste, setWaste] = useState<{ wastedItems: number; perWeek: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ settings: SettingsData }>('/api/settings')
      .then((data) => setSettings(data.settings))
      .catch(() => setError('Could not load your settings.'));
    api
      .get<{ wastedItems: number; perWeek: number }>('/api/reports/waste?days=30')
      .then(setWaste)
      .catch(() => setWaste(null));
  }, []);

  async function save(update: Partial<SettingsData>, message?: string) {
    try {
      const data = await api.patch<{ settings: SettingsData }>('/api/settings', update);
      setSettings(data.settings);
      if (message) toast(message);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not save that.');
    }
  }

  if (error) return <div className="banner error">{error}</div>;
  if (!settings) return <div className="empty">Loading…</div>;

  return (
    <>
      <h1>Settings</h1>

      <h2>Appearance</h2>
      <div className="card">
        <div className="theme-grid">
          {(
            [
              { value: 'system', label: 'System', icon: 'gear' as const },
              { value: 'light', label: 'Light', icon: 'sun' as const },
              { value: 'dark', label: 'Dark', icon: 'moon' as const },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              className={theme === option.value ? 'active' : ''}
              onClick={() => setTheme(option.value)}
            >
              <Icon name={option.icon} size={20} className="icon" />
              <strong>{option.label}</strong>
            </button>
          ))}
        </div>
        <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
          Saved on this device, so your phone and laptop can differ.
        </p>
      </div>

      <h2>Your goal</h2>
      <div className="card">
        <div className="goal-grid">
          {GOALS.map((goal) => (
            <button
              key={goal.value}
              type="button"
              className={settings.weightGoal === goal.value ? 'active' : ''}
              onClick={() => save({ weightGoal: goal.value }, `Recipes now favour ${goal.label.toLowerCase()}.`)}
            >
              <strong>{goal.label}</strong>
            </button>
          ))}
        </div>
        <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
          {GOALS.find((goal) => goal.value === settings.weightGoal)?.note}
        </p>
      </div>

      <BodySection settings={settings} onSaved={setSettings} />

      <h2>Daily targets</h2>
      <div className="card">
        <p className="muted">
          Suggested from your goal. We don't ask for your height, weight or activity level, so these are round
          starting points — edit them to whatever your own plan says.
        </p>

        <div className="field">
          <label htmlFor="kcal">Calories</label>
          <input
            id="kcal"
            type="number"
            min={800}
            max={8000}
            step={50}
            value={settings.dailyCalorieTarget}
            onChange={(event) => setSettings({ ...settings, dailyCalorieTarget: Number(event.target.value) })}
            onBlur={() => save({ dailyCalorieTarget: settings.dailyCalorieTarget })}
          />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="p">Protein (g)</label>
            <input
              id="p"
              type="number"
              min={0}
              value={settings.proteinTargetGrams}
              onChange={(event) => setSettings({ ...settings, proteinTargetGrams: Number(event.target.value) })}
              onBlur={() => save({ proteinTargetGrams: settings.proteinTargetGrams })}
            />
          </div>
          <div className="field">
            <label htmlFor="c">Carbs (g)</label>
            <input
              id="c"
              type="number"
              min={0}
              value={settings.carbsTargetGrams}
              onChange={(event) => setSettings({ ...settings, carbsTargetGrams: Number(event.target.value) })}
              onBlur={() => save({ carbsTargetGrams: settings.carbsTargetGrams })}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="f">Fat (g)</label>
          <input
            id="f"
            type="number"
            min={0}
            value={settings.fatTargetGrams}
            onChange={(event) => setSettings({ ...settings, fatTargetGrams: Number(event.target.value) })}
            onBlur={() => save({ fatTargetGrams: settings.fatTargetGrams })}
          />
        </div>
      </div>

      <h2>Units</h2>
      <div className="card">
        <div className="segmented" style={{ marginBottom: 0 }}>
          {(['metric', 'imperial'] as const).map((system) => (
            <button
              key={system}
              type="button"
              className={settings.unitSystem === system ? 'active' : ''}
              onClick={() => save({ unitSystem: system }, `Showing amounts in ${system}.`)}
            >
              {system === 'metric' ? 'Metric (g, ml)' : 'Imperial (oz, cups)'}
            </button>
          ))}
        </div>
      </div>

      <h2>Diet</h2>
      <div className="card">
        <p className="muted">
          A diet is a filter, not a preference — anything that does not fit is left out of suggestions entirely.
        </p>
        <div className="btn-row">
          {['vegetarian', 'gluten-free', 'low-carb', 'high-protein', 'quick'].map((tag) => {
            const on = settings.dietTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                className={`btn-secondary btn-sm ${on ? 'active' : ''}`}
                onClick={() =>
                  save(
                    { dietTags: on ? settings.dietTags.filter((t) => t !== tag) : [...settings.dietTags, tag] },
                    on ? `No longer filtering by ${tag}.` : `Only showing ${tag} recipes.`,
                  )
                }
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      <h2>Pantry</h2>
      <div className="card">
        <div className="field">
          <label htmlFor="expiry">Warn me this many days before food expires</label>
          <input
            id="expiry"
            type="number"
            min={1}
            max={30}
            value={settings.expiryWarningDays}
            onChange={(event) => setSettings({ ...settings, expiryWarningDays: Number(event.target.value) })}
            onBlur={() => save({ expiryWarningDays: settings.expiryWarningDays })}
          />
        </div>

        <div className="switch-row">
          <div className="stack">
            <strong>Add low items to my shopping list</strong>
            <span className="muted">
              When something drops below the amount you set for it, it goes on the list automatically.
            </span>
          </div>
          <input
            type="checkbox"
            checked={settings.autoShoppingEnabled}
            onChange={(event) =>
              save(
                { autoShoppingEnabled: event.target.checked },
                event.target.checked ? 'Auto-shopping on.' : 'Auto-shopping off.',
              )
            }
          />
        </div>
      </div>

      <h2>Reminders</h2>
      <div className="card">
        <div className="switch-row">
          <div className="stack">
            <strong>Tell me what is about to go off</strong>
            <span className="muted">
              A daily nudge with what dies tomorrow and what you could cook to save it.
            </span>
          </div>
          <input
            type="checkbox"
            checked={settings.notifyExpiry}
            onChange={async (event) => {
              const on = event.target.checked;
              if (on && 'Notification' in window && Notification.permission === 'default') {
                await Notification.requestPermission();
              }
              save({ notifyExpiry: on }, on ? 'Reminders on.' : 'Reminders off.');
            }}
          />
        </div>
        {typeof Notification !== 'undefined' && Notification.permission === 'denied' ? (
          <p className="muted" style={{ marginBottom: 0 }}>
            Your browser is blocking notifications for this site — you will still see the reminder when you open
            the app.
          </p>
        ) : null}
      </div>

      <h2>Ads</h2>
      <div className="card">
        <div className="switch-row">
          <div className="stack">
            <strong>Show sponsored suggestions</strong>
            <span className="muted">
              Demo placements only — plain brand names, always labelled, no tracking. Turn this off and every ad
              surface disappears completely.
            </span>
          </div>
          <input
            type="checkbox"
            checked={settings.adsEnabled}
            onChange={(event) =>
              save({ adsEnabled: event.target.checked }, event.target.checked ? 'Ads on.' : 'Ads off.')
            }
          />
        </div>
      </div>

      {waste && waste.wastedItems > 0 ? (
        <>
          <h2>Waste</h2>
          <div className="card">
            <div className="stat">
              <div>
                <div className="value">{waste.wastedItems}</div>
                <div className="label">binned in 30 days</div>
              </div>
              <div>
                <div className="value">{waste.perWeek}</div>
                <div className="label">a week</div>
              </div>
            </div>
            <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
              The full log lives on the home screen.
            </p>
          </div>
        </>
      ) : null}

      <h2>Your data</h2>
      <div className="card">
        <p className="muted">
          Everything this account holds, as one file. Your pantry should not be trapped in someone else's
          database.
        </p>
        <button
          type="button"
          className="btn-secondary btn-block"
          onClick={async () => {
            const data = await api.get<unknown>('/api/reports/export');
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `pantry-export-${new Date().toISOString().slice(0, 10)}.json`;
            link.click();
            URL.revokeObjectURL(url);
          }}
        >
          Export everything
        </button>
      </div>

      <h2>Account</h2>
      <div className="card">
        <p className="muted" style={{ marginBottom: 12 }}>
          Signed in as {user?.email ?? settings.email}
        </p>
        <ChangePassword />
        <button type="button" className="btn-secondary btn-block" style={{ marginTop: 10 }} onClick={logout}>
          Sign out
        </button>
      </div>
    </>
  );
}

/**
 * Change your password.
 *
 * Matters most the first time this app is reachable from outside your house:
 * the demo account's password is printed in the project README, and a pantry
 * carried over from a laptop arrives still using it.
 */
function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/auth/password', { currentPassword: current, newPassword: next });
      toast('Password changed.');
      setOpen(false);
      setCurrent('');
      setNext('');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not change your password.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn-secondary btn-block" onClick={() => setOpen(true)}>
        Change password
      </button>
    );
  }

  return (
    <div>
      {error ? <div className="banner error">{error}</div> : null}
      <div className="field">
        <label htmlFor="current-password">Current password</label>
        <input
          id="current-password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="new-password">New password</label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          value={next}
          onChange={(event) => setNext(event.target.value)}
        />
      </div>
      <div className="btn-row">
        <button type="button" className="grow" onClick={save} disabled={busy || next.length < 8 || !current}>
          {busy ? 'Saving…' : 'Save password'}
        </button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * The numbers a calorie target is computed from, kept on file and editable.
 *
 * Weight is the one that actually moves, so it is first and it is the only
 * field that ever needs touching again. Changing it — or the goal, or how
 * active you are — recomputes the target, because a figure worked out from
 * last month's weight is quietly wrong in a way nobody thinks to check.
 */
function BodySection({
  settings,
  onSaved,
}: {
  settings: SettingsData;
  onSaved: (next: SettingsData) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const body = settings.body;
  const [heightCm, setHeightCm] = useState(body.heightCm ? String(body.heightCm) : '');
  const [weightKg, setWeightKg] = useState(body.weightKg ? String(body.weightKg) : '');
  const [birthYear, setBirthYear] = useState(body.birthYear ? String(body.birthYear) : '');
  const [sex, setSex] = useState(body.sex ?? 'unspecified');
  const [activityLevel, setActivityLevel] = useState(body.activityLevel ?? 'moderate');

  async function persist(update: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const data = await api.patch<{ settings: SettingsData & { recalculated?: boolean } }>(
        '/api/settings',
        update,
      );
      onSaved(data.settings);
      toast(
        data.settings.recalculated
          ? `Updated. Your target is now ${data.settings.dailyCalorieTarget} kcal a day.`
          : 'Updated.',
      );
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  }

  const summary = body.weightKg
    ? `${body.heightCm ?? '—'} cm · ${body.weightKg} kg${body.birthYear ? ` · born ${body.birthYear}` : ''}`
    : 'Not set — your target is a general default';

  return (
    <>
      <h2>Your measurements</h2>
      <div className="card">
        <div className="row">
          <div className="grow stack">
            <strong>{summary}</strong>
            <span className="muted">
              {settings.energy
                ? `Burning about ${settings.energy.tdee} kcal a day, target ${settings.energy.target}.`
                : 'Add these and the target is worked out for you.'}
            </span>
          </div>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen((was) => !was)}>
            {open ? 'Close' : body.weightKg ? 'Change' : 'Add'}
          </button>
        </div>

        {open ? (
          <div style={{ marginTop: 16 }}>
            {error ? <div className="banner error">{error}</div> : null}

            {/* weight first: it is the one that moves */}
            <div className="field">
              <label htmlFor="set-weight">Weight (kg)</label>
              <input
                id="set-weight" type="number" inputMode="decimal" min={30} max={350} step="any"
                value={weightKg} onChange={(event) => setWeightKg(event.target.value)}
              />
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="set-height">Height (cm)</label>
                <input
                  id="set-height" type="number" inputMode="numeric" min={120} max={250}
                  value={heightCm} onChange={(event) => setHeightCm(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="set-birth">Born</label>
                <input
                  id="set-birth" type="number" inputMode="numeric" min={1900}
                  max={new Date().getFullYear() - 12}
                  value={birthYear} onChange={(event) => setBirthYear(event.target.value)}
                />
              </div>
            </div>

            <label>Sex</label>
            <div className="segmented">
              {['male', 'female', 'unspecified'].map((option) => (
                <button
                  key={option} type="button"
                  className={sex === option ? 'active' : ''}
                  onClick={() => setSex(option)}
                >
                  {option === 'unspecified' ? 'Rather not say' : option === 'male' ? 'Male' : 'Female'}
                </button>
              ))}
            </div>

            <label>How active are you?</label>
            {ACTIVITY_LEVELS.map((option) => (
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

            <button
              type="button"
              className="btn-block"
              style={{ marginTop: 14 }}
              disabled={busy}
              onClick={() =>
                persist({
                  heightCm: Number(heightCm) || null,
                  weightKg: Number(weightKg) || null,
                  birthYear: Number(birthYear) || null,
                  sex,
                  activityLevel,
                })
              }
            >
              {busy ? 'Saving…' : 'Save and update my target'}
            </button>

            <p className="muted" style={{ margin: '10px 0 0' }}>
              Changing any of these, or your goal, recalculates the target. An estimate from a standard
              formula, not medical advice.
            </p>
          </div>
        ) : null}
      </div>
    </>
  );
}
