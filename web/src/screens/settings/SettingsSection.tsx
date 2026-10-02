import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { api } from '../../lib/api';
import type { FastingPlan, GoalPlan, Settings, WeightGoal } from '../../lib/types';
import { useAuth } from '../../lib/auth';
import { PLANS, clockTime, scheduleFasting, showFastOnLockScreen } from '../../lib/fasting';
import { PrivacyNotice } from '../../components/PrivacyNotice';
import { describeBody } from '../../components/BodyInputs';
import { Icon } from '../../ui/Icon';
import { BackButton, Page, Switch, errorText, useToast } from '../../ui/kit';
import { formatWater } from '../eaten/DiaryParts';
import { ACTIVITY, BodySheet, DIETS, DeleteSheet, NavRow, PasswordSheet, Row, TargetsSheet } from './sheets';
import { useSettings } from './useSettings';
import './settings.css';

const TITLES = {
  goals: 'Goals',
  body: 'Body & weight',
  fasting: 'Fasting',
  diet: 'Diet',
  water: 'Water',
  pantry: 'Pantry & reminders',
  data: 'Your data',
  about: 'About',
  account: 'Account',
} as const;
type Section = keyof typeof TITLES;

interface SectionProps {
  s: Settings;
  save: (update: Partial<Settings> & Record<string, unknown>, message?: string) => Promise<boolean>;
  reload: () => Promise<void>;
}

/** One section of Settings, on its own page. */
export default function SettingsSection() {
  const { section = '' } = useParams();
  const { s, error, save, reload } = useSettings();
  if (!(section in TITLES)) return <Navigate to="/settings" replace />;
  const which = section as Section;
  const props = s ? { s, save, reload } : null;
  return (
    <Page left={<BackButton />} title={TITLES[which]}>
      {error ? <div className="banner error">{error}</div> : null}
      {!props ? (
        <div className="skeleton" style={{ height: 240 }} />
      ) : which === 'goals' ? (
        <GoalsSection {...props} />
      ) : which === 'body' ? (
        <BodySection {...props} />
      ) : which === 'fasting' ? (
        <FastingSection {...props} />
      ) : which === 'diet' ? (
        <DietSection {...props} />
      ) : which === 'water' ? (
        <WaterSection {...props} />
      ) : which === 'pantry' ? (
        <PantrySection {...props} />
      ) : which === 'data' ? (
        <DataSection />
      ) : which === 'about' ? (
        <AboutSection />
      ) : (
        <AccountSection s={props.s} />
      )}
    </Page>
  );
}

/* ---------- goals: a weight by a date, and the target that follows ---------- */

const KG_PER_LB = 0.45359237;
const PACE: Record<string, string> = { gentle: 'Gentle', steady: 'Steady', faster: 'Faster' };
const DIRECTIONS: Array<{ value: WeightGoal; label: string }> = [
  { value: 'lose', label: 'Lose' },
  { value: 'maintain', label: 'Maintain' },
  { value: 'gain', label: 'Gain' },
];

/** the person's own calendar day */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function plusDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10);
}
const dateSaid = (day: string, month: 'long' | 'short' = 'long') =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { month, day: 'numeric', ...(month === 'long' ? { year: 'numeric' } : {}), timeZone: 'UTC' });

interface Preview {
  plan: GoalPlan | null;
  target: number | null;
  flooredAt: number | null;
}

function GoalsSection({ s, save, reload }: SectionProps) {
  const toast = useToast();
  const imperial = s.unitSystem === 'imperial';
  const unit = imperial ? 'lb' : 'kg';
  const shown = (kg: number) => Math.round((imperial ? kg / KG_PER_LB : kg) * 10) / 10;
  const now = s.body.weightKg ?? null;
  const [direction, setDirection] = useState<WeightGoal>(
    s.goal && now ? (s.goal.weightKg < now ? 'lose' : s.goal.weightKg > now ? 'gain' : 'maintain') : s.weightGoal,
  );
  const [weight, setWeight] = useState(s.goal ? String(shown(s.goal.weightKg)) : '');
  const [date, setDate] = useState(s.goal?.date ?? plusDays(today(), 84));
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [ownTargets, setOwnTargets] = useState(false);
  const goalKg = Number(weight) > 0 ? Math.round((imperial ? Number(weight) * KG_PER_LB : Number(weight)) * 10) / 10 : null;

  // what the goal would mean, worked out on the server as it is typed
  useEffect(() => {
    if (direction === 'maintain' || !goalKg || !date || !now) {
      setPreview(null);
      return;
    }
    let live = true;
    const timer = window.setTimeout(() => {
      api
        .post<Preview>('/api/body/goal/preview', { weightKg: goalKg, date })
        .then((d) => live && setPreview(d))
        .catch(() => live && setPreview(null));
    }, 300);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [direction, goalKg, date, now]);

  const plan = preview?.plan ?? null;
  const wrongWay = Boolean(plan && plan.direction !== 'maintain' && plan.direction !== direction);

  async function setGoal() {
    if (!goalKg) return;
    setBusy(true);
    try {
      const d = await api.put<{ settings: { dailyCalorieTarget: number } }>('/api/body/goal', { weightKg: goalKg, date });
      await reload();
      toast(`Goal set. Your target is ${d.settings.dailyCalorieTarget.toLocaleString()} kcal a day.`);
    } catch (e) {
      toast(errorText(e, 'The goal could not be set.'));
    } finally {
      setBusy(false);
    }
  }

  async function keepSteady() {
    setDirection('maintain');
    if (s.goal) {
      try {
        await api.delete('/api/body/goal');
        await reload();
        toast('Goal removed. Your target now keeps your weight steady.');
      } catch (e) {
        toast(errorText(e, 'The goal could not be removed.'));
      }
    } else if (s.weightGoal !== 'maintain') {
      await save({ weightGoal: 'maintain' }, 'Your target now keeps your weight steady.');
    }
  }

  const who =
    s.targetSetBy === 'person'
      ? 'You set this yourself, so the app leaves it alone.'
      : s.goal
        ? 'Worked out from your goal, and adjusted each week from your weight trend and your diary.'
        : s.energy
          ? 'Worked out from your measurements.'
          : 'A general starting point. Add your measurements for one that fits you.';

  return (
    <>
      <div className="target-card">
        <span className="fine">Daily target</span>
        <span className="big num">{s.dailyCalorieTarget.toLocaleString()}<small> kcal</small></span>
        <span className="s">{s.proteinTargetGrams} g protein · {s.carbsTargetGrams} g carbs · {s.fatTargetGrams} g fat</span>
        <p className="fine">{who}</p>
        <div className="btn-row">
          <button type="button" className="btn secondary small" onClick={() => setOwnTargets(true)}>Set my own</button>
          {s.targetSetBy === 'person' ? (
            <button type="button" className="btn ghost small" onClick={() => void save({ targetSetBy: 'app' }, 'The app works out your target again.')}>Let the app set it</button>
          ) : null}
        </div>
      </div>

      <div className="section"><h2>Your goal</h2></div>
      <div className="goal-seg">
        {DIRECTIONS.map((d) => (
          <button key={d.value} type="button" className={direction === d.value ? 'on' : ''} onClick={() => (d.value === 'maintain' ? void keepSteady() : setDirection(d.value))}>
            {d.label}
          </button>
        ))}
      </div>

      {direction === 'maintain' ? (
        <p className="fine" style={{ marginTop: 10 }}>Your target keeps your weight where it is.</p>
      ) : !now ? (
        <p className="fine" style={{ marginTop: 10 }}>
          Add your weight first, so the app knows how far the goal is. <Link to="/weight">Log your weight</Link>
        </p>
      ) : (
        <>
          <div className="field-row goal-fields">
            <div className="field">
              <label htmlFor="g-w">Goal weight</label>
              <div className="input-unit">
                <input id="g-w" type="number" inputMode="decimal" placeholder={String(shown(now))} value={weight} onChange={(e) => setWeight(e.target.value)} />
                <span>{unit}</span>
              </div>
            </div>
            <div className="field">
              <label htmlFor="g-d">By</label>
              <input id="g-d" type="date" min={plusDays(today(), 7)} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="goal-read" aria-live="polite">
            {!plan ? (
              <p className="fine">You weigh {shown(now)} {unit} now. Say where you’d like to be, and by when.</p>
            ) : wrongWay ? (
              <p className="fine">That’s {plan.direction === 'gain' ? 'more' : 'less'} than you weigh now ({shown(now)} {unit}). Choose {plan.direction === 'gain' ? 'Gain' : 'Lose'} instead.</p>
            ) : plan.ok ? (
              <>
                <p className="t">{shown(plan.weeklyRateKg)} {unit} a week · {PACE[plan.pace ?? 'steady']}</p>
                {preview?.target ? <p className="t">Eat about {preview.target.toLocaleString()} kcal a day</p> : null}
                {preview?.flooredAt ? <p className="fine">Held at {preview.flooredAt.toLocaleString()} kcal: the app won’t suggest less, so it may take a little longer.</p> : null}
              </>
            ) : plan.problem === 'too_fast' && plan.earliestSafeDate ? (
              <div className="goal-warn">
                <p className="t"><Icon name="alert" size={16} /> Too fast to be safe: {shown(plan.weeklyRateKg)} {unit} a week.</p>
                <p className="fine">More than about 1% of your weight a week comes off muscle as well as fat, and rarely stays off. The earliest safe date is {dateSaid(plan.earliestSafeDate)}.</p>
                <button type="button" className="btn secondary small" onClick={() => setDate(plan.earliestSafeDate!)}>Use {dateSaid(plan.earliestSafeDate, 'short')}</button>
              </div>
            ) : plan.problem === 'below_healthy' ? (
              <div className="goal-warn">
                <p className="t"><Icon name="alert" size={16} /> That’s under a healthy weight for your height.</p>
                <p className="fine">The lowest goal the app will set is {shown(plan.lowestGoalKg ?? 0)} {unit}.</p>
              </div>
            ) : plan.problem === 'too_young' ? (
              <div className="goal-warn">
                <p className="t"><Icon name="alert" size={16} /> Weight-loss goals are for adults.</p>
                <p className="fine">A doctor can help set one safely.</p>
              </div>
            ) : (
              <p className="fine">Pick a date at least a week away.</p>
            )}
          </div>

          <button type="button" className="btn block" style={{ marginTop: 16 }} disabled={busy || !plan?.ok || wrongWay} onClick={() => void setGoal()}>
            {busy ? 'Setting…' : s.goal ? 'Update goal' : 'Set goal'}
          </button>
          <p className="fine" style={{ marginTop: 8, textAlign: 'center' }}>Adjusts each week from your weight trend and your diary.</p>
          {s.goal ? (
            <button type="button" className="btn ghost block" onClick={() => void keepSteady()}>Remove goal</button>
          ) : null}
        </>
      )}

      {ownTargets ? (
        <TargetsSheet
          s={s}
          onClose={() => setOwnTargets(false)}
          onSave={async (u) => {
            if (await save(u, 'Targets saved. The app leaves them alone now.')) setOwnTargets(false);
          }}
        />
      ) : null}
    </>
  );
}

/* ---------- body ---------- */

function BodySection({ s, save }: SectionProps) {
  const [open, setOpen] = useState(false);
  const activity = ACTIVITY.find((a) => a.value === s.body.activityLevel)?.label;
  const facts = [s.body.heightCm ? describeBody(s.unitSystem, s.body.heightCm, null) : null, s.body.birthYear ? `born ${s.body.birthYear}` : null, activity ? `${activity} active` : null].filter(Boolean);
  return (
    <>
      <div className="group settings-group">
        <NavRow to="/weight" title="Weight" value={s.body.weightKg ? describeBody(s.unitSystem, null, s.body.weightKg) : 'Log a weigh-in'} />
        <Row title="Measurements" sub={facts.length ? facts.join(' · ') : 'Not set. Your target is a general default.'} onClick={() => setOpen(true)}>
          <Icon name="chevron" size={18} className="faint" />
        </Row>
      </div>
      <p className="fine" style={{ marginTop: 10 }}>Used only to work out your calorie target, and private to you.</p>
      {open ? (
        <BodySheet
          s={s}
          onClose={() => setOpen(false)}
          onSave={async (u) => {
            if (await save(u, 'Updated.')) setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

/* ---------- fasting ---------- */

function FastingSection({ s, save }: SectionProps) {
  const f = s.fasting ?? { plan: null, start: null, notify: true };
  const [start, setStart] = useState(f.start ?? '12:00');
  const native = Capacitor.isNativePlatform();

  async function choose(plan: FastingPlan | null) {
    if (await save({ fastingPlan: plan, fastingStart: plan ? start : f.start }, plan ? `${plan} it is.` : 'Fasting is off.')) {
      void scheduleFasting(plan, start, f.notify);
      void showFastOnLockScreen(plan, start);
    }
  }
  async function opensAt(value: string) {
    setStart(value);
    if (f.plan && value && (await save({ fastingStart: value }))) {
      void scheduleFasting(f.plan, value, f.notify);
      void showFastOnLockScreen(f.plan, value);
    }
  }
  async function tell(notify: boolean) {
    if (await save({ fastingNotify: notify }, notify ? 'You’ll be told when the window opens and closes.' : 'No fasting notifications.')) {
      void scheduleFasting(f.plan, f.start ?? start, notify);
    }
  }

  // today's window, from when it opens and how long it lasts
  const eatHours = PLANS.find((p) => p.plan === f.plan)?.eat ?? 8;
  const [h, m] = start.split(':').map(Number);
  const opens = new Date();
  opens.setHours(h ?? 12, m ?? 0, 0, 0);
  const closes = new Date(opens.getTime() + eatHours * 3_600_000);

  return (
    <>
      <div className="fasting-intro">
        <p>
          Intermittent fasting is eating within a set window each day, and not outside it. With 16:8 you might eat between noon and 8 pm, then only water,
          tea or black coffee until noon the next day.
        </p>
        <p className="fine">
          What it can do: with fewer chances to eat, many people find eating less easier. Studies find it works about as well as other ways of cutting
          calories, not better, so it’s worth it if the rhythm suits you.
        </p>
        <p className="fine">
          Talk to a doctor first if you’re pregnant or breastfeeding, under 18, have diabetes or take medicine that lowers blood sugar, or have had an
          eating disorder.
        </p>
      </div>

      <div className="section"><h2>Your plan</h2></div>
      <div className="choice-list">
        <button type="button" className={`choice${!f.plan ? ' on' : ''}`} onClick={() => void choose(null)}>
          <span className="t">Off</span>
          <span className="s">No eating window</span>
        </button>
        {PLANS.map((p) => (
          <button key={p.plan} type="button" className={`choice${f.plan === p.plan ? ' on' : ''}`} onClick={() => void choose(p.plan)}>
            <span className="t">{p.plan}</span>
            <span className="s">{p.fast} hours fasting, {p.eat} to eat · {p.note}</span>
          </button>
        ))}
      </div>

      {f.plan ? (
        <>
          <div className="group settings-group" style={{ marginTop: 16 }}>
            <Row title="Eating window opens">
              <input className="time-input" type="time" value={start} aria-label="Eating window opens" onChange={(e) => void opensAt(e.target.value)} />
            </Row>
            <Row title="Tell me when it opens and closes" sub={native ? undefined : 'Works in the iPhone app.'}>
              <Switch on={f.notify} label="Tell me when it opens and closes" onChange={(v) => void tell(v)} />
            </Row>
          </div>
          <p className="fine" style={{ marginTop: 10 }}>
            You eat from {clockTime(opens)} to {clockTime(closes)} and fast the rest of the day. The bar on Eaten counts it down.
          </p>
        </>
      ) : null}
    </>
  );
}

/* ---------- the rest ---------- */

function DietSection({ s, save }: SectionProps) {
  return (
    <>
      <p className="fine">A diet is a filter, not a preference: anything that does not fit is left out of suggestions. Recipes you add yourself always show.</p>
      <div className="chips wrap" style={{ marginTop: 12 }}>
        {DIETS.map((tag) => {
          const on = s.dietTags.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              className={`chip${on ? ' on' : ''}`}
              onClick={() => void save({ dietTags: on ? s.dietTags.filter((t) => t !== tag) : [...s.dietTags, tag] }, on ? `No longer only ${tag}.` : `Only ${tag} suggestions now.`)}
            >
              {tag[0]!.toUpperCase() + tag.slice(1)}
            </button>
          );
        })}
      </div>
    </>
  );
}

function WaterSection({ s, save }: SectionProps) {
  const goal = s.waterGoalMl ?? 2500;
  return (
    <>
      <div className="group settings-group">
        <Row title="Daily goal" sub={formatWater(goal, s.unitSystem)}>
          <div className="stepper">
            <button type="button" className="icon-btn" aria-label="Lower the goal" disabled={goal <= 500} onClick={() => void save({ waterGoalMl: goal - 250 })}>
              <Icon name="minus" size={18} />
            </button>
            <button type="button" className="icon-btn" aria-label="Raise the goal" disabled={goal >= 6000} onClick={() => void save({ waterGoalMl: goal + 250 })}>
              <Icon name="plus" size={18} />
            </button>
          </div>
        </Row>
      </div>
      <p className="fine" style={{ marginTop: 10 }}>Most adults need about 2 to 3 litres a day from drinks, more in the heat or after exercise. Log glasses from the Eaten tab.</p>
    </>
  );
}

function PantrySection({ s, save }: SectionProps) {
  return (
    <div className="group settings-group">
      <Row title="Warn me before food goes off" sub={`${s.expiryWarningDays} ${s.expiryWarningDays === 1 ? 'day' : 'days'} ahead`}>
        <div className="mini-seg">
          {[1, 2, 3, 5, 7].map((n) => (
            <button key={n} type="button" className={s.expiryWarningDays === n ? 'on' : ''} onClick={() => void save({ expiryWarningDays: n })}>{n}</button>
          ))}
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
  );
}

function DataSection() {
  const toast = useToast();
  const [privacy, setPrivacy] = useState(false);
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
    <>
      <div className="group settings-group">
        <Row title="Export everything" sub="Your pantry, diary, weigh-ins and recipes as one file." onClick={() => void exportAll()}>
          <Icon name="chevron" size={18} className="faint" />
        </Row>
        <Row title="Privacy notice" onClick={() => setPrivacy(true)}>
          <Icon name="chevron" size={18} className="faint" />
        </Row>
      </div>
      {privacy ? <PrivacyNotice onClose={() => setPrivacy(false)} /> : null}
    </>
  );
}

function AboutSection() {
  return (
    <div className="group settings-group">
      <Row
        title="Where the food data comes from"
        sub={
          <>
            Packaged products from <a href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer">Open Food Facts</a>, under the{' '}
            <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">Open Database License</a>. Nutrition for everyday foods from{' '}
            <a href="https://fdc.nal.usda.gov" target="_blank" rel="noreferrer">USDA FoodData Central</a>. Calories from a meal photo are an estimate by AI, and every
            number here is a guide, not medical advice.
          </>
        }
      />
    </div>
  );
}

function AccountSection({ s }: { s: Settings }) {
  const { user, logout } = useAuth();
  const [sheet, setSheet] = useState<null | 'password' | 'delete'>(null);
  return (
    <>
      <div className="group settings-group">
        <Row title="Email" sub={user?.email ?? s.email} />
        <Row title="Change password" onClick={() => setSheet('password')}>
          <Icon name="chevron" size={18} className="faint" />
        </Row>
        <Row title="Sign out" onClick={logout}>
          <Icon name="logout" size={18} className="faint" />
        </Row>
      </div>
      <button type="button" className="btn ghost danger-ink" style={{ marginTop: 14 }} onClick={() => setSheet('delete')}>Delete my account</button>
      {sheet === 'password' ? <PasswordSheet onClose={() => setSheet(null)} /> : null}
      {sheet === 'delete' ? <DeleteSheet onClose={() => setSheet(null)} /> : null}
    </>
  );
}
