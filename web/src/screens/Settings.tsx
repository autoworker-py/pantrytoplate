import { useEffect, useState, type ReactNode } from 'react';
import { api, tokenStore } from '../lib/api';
import type { Settings as SettingsData, WeightGoal } from '../lib/types';
import { useAuth } from '../lib/auth';
import { forgetReceipts } from '../lib/receiptMemory';
import { PrivacyNotice } from '../components/PrivacyNotice';
import { BodyInputs, describeBody, type UnitSystem } from '../components/BodyInputs';
import { Icon } from '../ui/Icon';
import { BackButton, Page, Sheet, Switch, errorText, useToast } from '../ui/kit';

const GOALS: Array<{ value: WeightGoal; label: string; note: string }> = [
  { value: 'lose', label: 'Lose', note: 'Lighter, higher-protein recipes come first.' },
  { value: 'maintain', label: 'Maintain', note: 'No calorie preference in what comes first.' },
  { value: 'gain', label: 'Gain', note: 'More filling recipes come first.' },
];
const ACTIVITY = [
  { value: 'sedentary', label: 'Not much', note: 'Desk job, little exercise' },
  { value: 'light', label: 'A little', note: 'Light exercise 1–3 days a week' },
  { value: 'moderate', label: 'Moderate', note: 'Exercise 3–5 days a week' },
  { value: 'active', label: 'A lot', note: 'Hard exercise 6–7 days a week' },
  { value: 'very_active', label: 'Very high', note: 'Physical job, or training twice a day' },
];
const DIETS = ['vegetarian', 'gluten-free', 'low-carb', 'high-protein', 'quick'];

function Row({ title, sub, children, onClick }: { title: string; sub?: ReactNode; children?: ReactNode; onClick?: () => void }) {
  const body = (
    <>
      <span className="grow"><span className="t">{title}</span>{sub ? <span className="s">{sub}</span> : null}</span>
      {children}
    </>
  );
  return onClick ? <button type="button" className="list-row" onClick={onClick}>{body}</button> : <div className="list-row">{body}</div>;
}

export default function Settings() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const [s, setS] = useState<SettingsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | 'body' | 'targets' | 'password' | 'delete' | 'privacy'>(null);

  useEffect(() => {
    api.getFresh<{ settings: SettingsData }>('/api/settings').then((d) => setS(d.settings)).catch((e) => setError(errorText(e, 'Could not load your settings.')));
  }, []);

  async function save(update: Partial<SettingsData> & Record<string, unknown>, message?: string) {
    try {
      const d = await api.patch<{ settings: SettingsData & { recalculated?: boolean } }>('/api/settings', update);
      setS(d.settings);
      if (d.settings.recalculated) toast(`Your target is now ${d.settings.dailyCalorieTarget.toLocaleString()} kcal a day.`);
      else if (message) toast(message);
      return true;
    } catch (e) {
      toast(errorText(e, 'Could not save that.'));
      return false;
    }
  }

  async function exportAll() {
    try {
      const data = await api.getFresh<unknown>('/api/reports/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pantry-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast(errorText(e, 'Could not export your data.'));
    }
  }

  return (
    <Page left={<BackButton />} title="Settings">
      {error ? <div className="banner error">{error}</div> : null}
      {!s ? <div className="skeleton" style={{ height: 300 }} /> : (
        <>
          <div className="section" style={{ marginTop: 6 }}><h2>Your goal</h2></div>
          <div className="goal-seg">
            {GOALS.map((g) => (
              <button key={g.value} type="button" className={s.weightGoal === g.value ? 'on' : ''} onClick={() => void save({ weightGoal: g.value }, `Recipes now favour ${g.label.toLowerCase()}.`)}>{g.label}</button>
            ))}
          </div>
          <p className="fine" style={{ marginTop: 8 }}>{GOALS.find((g) => g.value === s.weightGoal)?.note}</p>

          <div className="group" style={{ marginTop: 16 }}>
            <Row title="Your measurements" sub={s.body.weightKg ? `${describeBody(s.unitSystem, s.body.heightCm, s.body.weightKg)}${s.body.birthYear ? ` · born ${s.body.birthYear}` : ''}` : 'Not set. Your target is a general default.'} onClick={() => setSheet('body')}><Icon name="chevron" size={18} className="faint" /></Row>
            <Row title="Daily targets" sub={`${s.dailyCalorieTarget.toLocaleString()} kcal · ${s.proteinTargetGrams} g protein · ${s.carbsTargetGrams} g carbs · ${s.fatTargetGrams} g fat`} onClick={() => setSheet('targets')}><Icon name="chevron" size={18} className="faint" /></Row>
            <Row title="Units">
              <div className="mini-seg">
                {(['metric', 'imperial'] as const).map((u) => <button key={u} type="button" className={s.unitSystem === u ? 'on' : ''} onClick={() => void save({ unitSystem: u })}>{u === 'metric' ? 'Metric' : 'Imperial'}</button>)}
              </div>
            </Row>
          </div>

          <div className="section"><h2>Diet</h2></div>
          <p className="fine">A diet is a filter, not a preference: anything that does not fit is left out of suggestions. Recipes you add yourself always show.</p>
          <div className="chips wrap" style={{ marginTop: 10 }}>
            {DIETS.map((tag) => {
              const on = s.dietTags.includes(tag);
              return <button key={tag} type="button" className={`chip${on ? ' on' : ''}`} onClick={() => void save({ dietTags: on ? s.dietTags.filter((t) => t !== tag) : [...s.dietTags, tag] }, on ? `No longer only ${tag}.` : `Only ${tag} suggestions now.`)}>{tag[0].toUpperCase() + tag.slice(1)}</button>;
            })}
          </div>

          <div className="section"><h2>Pantry</h2></div>
          <div className="group">
            <Row title="Warn me before food goes off" sub={`${s.expiryWarningDays} ${s.expiryWarningDays === 1 ? 'day' : 'days'} ahead`}>
              <div className="mini-seg">
                {[1, 2, 3, 5, 7].map((n) => <button key={n} type="button" className={s.expiryWarningDays === n ? 'on' : ''} onClick={() => void save({ expiryWarningDays: n })}>{n}</button>)}
              </div>
            </Row>
            <Row title="Put low things on my list" sub="When something drops below its level, it goes on the shopping list by itself.">
              <Switch on={s.autoShoppingEnabled} label="Put low things on my list" onChange={(v) => void save({ autoShoppingEnabled: v }, v ? 'Low things go on your list now.' : 'Low things stay off your list.')} />
            </Row>
            <Row title="Daily reminder" sub="What goes off tomorrow, and what you could cook to save it.">
              <Switch
                on={s.notifyExpiry}
                label="Daily reminder"
                onChange={async (v) => {
                  if (v && 'Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
                  void save({ notifyExpiry: v }, v ? 'Reminders on.' : 'Reminders off.');
                }}
              />
            </Row>
          </div>

          <div className="section"><h2>Your data</h2></div>
          <div className="group">
            <Row title="Export everything" sub="Your pantry, diary and recipes as one file." onClick={() => void exportAll()}><Icon name="chevron" size={18} className="faint" /></Row>
            <Row title="Privacy notice" onClick={() => setSheet('privacy')}><Icon name="chevron" size={18} className="faint" /></Row>
          </div>

          <div className="section"><h2>Account</h2><span className="aside">{user?.email ?? s.email}</span></div>
          <div className="group">
            <Row title="Change password" onClick={() => setSheet('password')}><Icon name="chevron" size={18} className="faint" /></Row>
            <Row title="Sign out" onClick={logout}><Icon name="logout" size={18} className="faint" /></Row>
          </div>
          <button type="button" className="btn ghost danger-ink" style={{ marginTop: 14 }} onClick={() => setSheet('delete')}>Delete my account</button>
        </>
      )}

      {s && sheet === 'body' ? <BodySheet s={s} onClose={() => setSheet(null)} onSave={async (u) => { if (await save(u, 'Updated.')) setSheet(null); }} /> : null}
      {s && sheet === 'targets' ? <TargetsSheet s={s} onClose={() => setSheet(null)} onSave={async (u) => { if (await save(u, 'Targets saved.')) setSheet(null); }} /> : null}
      {sheet === 'password' ? <PasswordSheet onClose={() => setSheet(null)} /> : null}
      {sheet === 'delete' ? <DeleteSheet onClose={() => setSheet(null)} /> : null}
      {sheet === 'privacy' ? <PrivacyNotice onClose={() => setSheet(null)} /> : null}
    </Page>
  );
}

function BodySheet({ s, onClose, onSave }: { s: SettingsData; onClose: () => void; onSave: (u: Record<string, unknown>) => void }) {
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

function TargetsSheet({ s, onClose, onSave }: { s: SettingsData; onClose: () => void; onSave: (u: Record<string, unknown>) => void }) {
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

function PasswordSheet({ onClose }: { onClose: () => void }) {
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
function DeleteSheet({ onClose }: { onClose: () => void }) {
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
