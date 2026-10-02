import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, tokenStore } from '../../lib/api';
import type { Settings as SettingsData } from '../../lib/types';
import { useAuth } from '../../lib/auth';
import { forgetReceipts } from '../../lib/receiptMemory';
import { BodyInputs, type UnitSystem } from '../../components/BodyInputs';
import { Icon } from '../../ui/Icon';
import { Sheet, errorText, useToast } from '../../ui/kit';

/* The sheets and rows the Settings pages share. */

export const ACTIVITY = [
  { value: 'sedentary', label: 'Not much', note: 'Desk job, little exercise' },
  { value: 'light', label: 'A little', note: 'Light exercise 1–3 days a week' },
  { value: 'moderate', label: 'Moderate', note: 'Exercise 3–5 days a week' },
  { value: 'active', label: 'A lot', note: 'Hard exercise 6–7 days a week' },
  { value: 'very_active', label: 'Very high', note: 'Physical job, or training twice a day' },
];
export const DIETS = ['vegetarian', 'gluten-free', 'low-carb', 'high-protein', 'quick'];

export function Row({ title, sub, children, onClick }: { title: string; sub?: ReactNode; children?: ReactNode; onClick?: () => void }) {
  const body = (
    <>
      <span className="grow"><span className="t">{title}</span>{sub ? <span className="s">{sub}</span> : null}</span>
      {children}
    </>
  );
  return onClick ? <button type="button" className="list-row" onClick={onClick}>{body}</button> : <div className="list-row">{body}</div>;
}

/** A row that opens a page of its own, with its current value. */
export function NavRow({ to, title, value }: { to: string; title: string; value?: ReactNode }) {
  return (
    <Link to={to} className="list-row nav-row">
      <span className="grow"><span className="t">{title}</span></span>
      {value !== undefined ? <span className="nav-value">{value}</span> : null}
      <Icon name="chevron" size={18} className="faint" />
    </Link>
  );
}

export function BodySheet({ s, onClose, onSave }: { s: SettingsData; onClose: () => void; onSave: (u: Record<string, unknown>) => void }) {
  const [system, setSystem] = useState<UnitSystem>(s.unitSystem);
  const [heightCm, setHeightCm] = useState<number | null>(s.body.heightCm ?? null);
  const [weightKg, setWeightKg] = useState<number | null>(s.body.weightKg ?? null);
  const [born, setBorn] = useState(s.body.birthYear ? String(s.body.birthYear) : '');
  const [sex, setSex] = useState(s.body.sex ?? 'unspecified');
  const [activity, setActivity] = useState(s.body.activityLevel ?? 'moderate');
  const num = (v: string) => (v.trim() ? Number(v) : null);
  return (
    <Sheet title="Your measurements" sub="Change any of these and your calorie target is worked out again." onClose={onClose}>
      <BodyInputs system={system} onSystem={setSystem} heightCm={heightCm} weightKg={weightKg} onChange={(h, w) => { setHeightCm(h); setWeightKg(w); }} />
      <div className="field"><label htmlFor="b-y">Year you were born</label><input id="b-y" type="number" inputMode="numeric" placeholder="1990" value={born} onChange={(e) => setBorn(e.target.value)} /></div>
      <div className="label" style={{ marginTop: 16 }}>Sex</div>
      <div className="chips" style={{ marginTop: 8 }}>
        {[['female', 'Female'], ['male', 'Male'], ['unspecified', 'Rather not say']].map(([v, l]) => <button key={v} type="button" className={`chip${sex === v ? ' on' : ''}`} onClick={() => setSex(v)}>{l}</button>)}
      </div>
      <div className="label" style={{ marginTop: 16 }}>How active are you?</div>
      <div className="choice-list">
        {ACTIVITY.map((a) => (
          <button key={a.value} type="button" className={`choice${activity === a.value ? ' on' : ''}`} onClick={() => setActivity(a.value)}>
            <span className="t">{a.label}</span><span className="s">{a.note}</span>
          </button>
        ))}
      </div>
      <button type="button" className="btn block" style={{ marginTop: 20 }} onClick={() => onSave({ weightKg, heightCm, birthYear: num(born), sex, activityLevel: activity, unitSystem: system })}>Save</button>
    </Sheet>
  );
}

export function TargetsSheet({ s, onClose, onSave }: { s: SettingsData; onClose: () => void; onSave: (u: Record<string, unknown>) => void }) {
  const [kcal, setKcal] = useState(String(s.dailyCalorieTarget));
  const [p, setP] = useState(String(s.proteinTargetGrams));
  const [c, setC] = useState(String(s.carbsTargetGrams));
  const [f, setF] = useState(String(s.fatTargetGrams));
  return (
    <Sheet title="Daily targets" sub={s.energy ? `Worked out from your measurements: ${s.energy.target.toLocaleString()} kcal. Set your own and it wins.` : 'Round starting points. Set them to whatever your own plan says.'} onClose={onClose}>
      <div className="field"><label htmlFor="t-k">Calories</label><input id="t-k" type="number" inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} /></div>
      <div className="field-row">
        <div className="field"><label htmlFor="t-p">Protein g</label><input id="t-p" type="number" inputMode="numeric" value={p} onChange={(e) => setP(e.target.value)} /></div>
        <div className="field"><label htmlFor="t-c">Carbs g</label><input id="t-c" type="number" inputMode="numeric" value={c} onChange={(e) => setC(e.target.value)} /></div>
        <div className="field"><label htmlFor="t-f">Fat g</label><input id="t-f" type="number" inputMode="numeric" value={f} onChange={(e) => setF(e.target.value)} /></div>
      </div>
      <button type="button" className="btn block" style={{ marginTop: 20 }} onClick={() => onSave({ dailyCalorieTarget: Number(kcal), proteinTargetGrams: Number(p), carbsTargetGrams: Number(c), fatTargetGrams: Number(f) })} disabled={!(Number(kcal) >= 800)}>Save targets</button>
    </Sheet>
  );
}

export function PasswordSheet({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setBusy(true);
    setError(null);
    try {
      // a new password signs out every other device; this one keeps going on the token it is handed back
      const { token } = await api.post<{ token?: string }>('/api/auth/password', { currentPassword: current, newPassword: next });
      if (token) tokenStore.set(token);
      toast('Password changed. Any other device you were signed in on is now signed out.');
      onClose();
    } catch (e) {
      setError(errorText(e, 'Could not change your password.'));
      setBusy(false);
    }
  }
  return (
    <Sheet title="Change password" onClose={onClose}>
      {error ? <div className="banner error" style={{ marginTop: 10 }}>{error}</div> : null}
      <div className="field"><label htmlFor="pw-c">Current password</label><input id="pw-c" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
      <div className="field"><label htmlFor="pw-n">New password</label><input id="pw-n" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /><span className="hint">At least 8 characters.</span></div>
      <button type="button" className="btn block" style={{ marginTop: 20 }} onClick={save} disabled={busy || next.length < 8 || !current}>{busy ? 'Saving…' : 'Save password'}</button>
    </Sheet>
  );
}

/** A real cascade: nothing is kept. So it says so, and asks for the password. */
export function DeleteSheet({ onClose }: { onClose: () => void }) {
  const { user, logout } = useAuth();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function destroy() {
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/auth/delete-account', { password });
      // what this phone learned from receipts goes with the account
      if (user) await forgetReceipts(user.id);
      logout();
    } catch (e) {
      setError(errorText(e, 'Could not delete your account.'));
      setBusy(false);
    }
  }
  return (
    <Sheet title="Delete your account?" sub="Your pantry, diary, recipes and shopping list are deleted for good. Nothing is kept, and it cannot be undone." onClose={onClose}>
      {error ? <div className="banner error" style={{ marginTop: 10 }}>{error}</div> : null}
      <div className="field"><label htmlFor="del-pw">Your password, to confirm</label><input id="del-pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
      <button type="button" className="btn danger block" style={{ marginTop: 20 }} onClick={destroy} disabled={busy || !password}>{busy ? 'Deleting…' : 'Delete everything'}</button>
      <button type="button" className="btn ghost block" onClick={onClose} disabled={busy}>Keep my account</button>
    </Sheet>
  );
}
