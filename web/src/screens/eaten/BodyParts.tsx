import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { PLANS, clockTime, fastingState, scheduleFasting, showFastOnLockScreen, span } from '../../lib/fasting';
import type { Settings, WeightHistory } from '../../lib/types';
import type { UnitSystem } from '../../components/BodyInputs';
import { inUnits, unitOf, weekSaid } from '../weight/WeightPage';
import './eaten.css';

/** Weight under water: the latest weigh-in, the week's change, and the trend as a line. */
export function WeightCard({ system }: { system: UnitSystem }) {
  const [history, setHistory] = useState<WeightHistory | null>(null);
  useEffect(() => {
    let live = true;
    api.getFresh<WeightHistory>('/api/body/weight?days=30').then((d) => live && setHistory(d)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  if (!history) return null;

  if (!history.latest) {
    return (
      <Link to="/weight" className="weight-card">
        <span className="t">Weight</span>
        <span className="s">Log a weigh-in to see your trend</span>
      </Link>
    );
  }

  const points = history.trend.slice(-30);
  const values = points.map((p) => p.kg);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const line = points
    .map((p, i) => `${((i / Math.max(1, points.length - 1)) * 116 + 2).toFixed(1)},${(26 - ((p.kg - low) / Math.max(0.3, high - low)) * 22).toFixed(1)}`)
    .join(' ');
  const week = weekSaid(history.weekChangeKg, system);
  return (
    <Link to="/weight" className="weight-card">
      <span className="grow">
        <span className="t">Weight</span>
        <span className="v num">{inUnits(history.latest.kg, system)} {unitOf(system)}</span>
        {week ? <span className="s">{week}</span> : null}
      </span>
      {points.length > 1 ? (
        <svg className="spark" viewBox="0 0 120 28" aria-hidden="true">
          <polyline points={line} />
        </svg>
      ) : null}
    </Link>
  );
}

let notificationsSet = false;

/** Above the day: fasting or eating, how long, and until when, filling as it goes. */
export function FastingBar() {
  const [fasting, setFasting] = useState<Settings['fasting'] | null>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let live = true;
    api
      .get<{ settings: Settings }>('/api/settings')
      .then((d) => {
        if (!live) return;
        setFasting(d.settings.fasting ?? null);
        // once a launch, the window's notifications are set again from the plan, so they never drift
        if (!notificationsSet && d.settings.fasting?.plan) {
          notificationsSet = true;
          void scheduleFasting(d.settings.fasting.plan, d.settings.fasting.start, d.settings.fasting.notify);
        }
      })
      .catch(() => undefined);
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, []);
  const phase = fasting?.plan && fasting.start ? fastingState(fasting.plan, fasting.start, now).phase : null;
  // on the Lock Screen too, started again as each phase begins
  useEffect(() => {
    if (fasting?.plan && fasting.start && phase) void showFastOnLockScreen(fasting.plan, fasting.start);
  }, [fasting?.plan, fasting?.start, phase]);
  if (!fasting?.plan || !fasting.start) return null;

  const state = fastingState(fasting.plan, fasting.start, now);
  const total = state.until.getTime() - state.since.getTime();
  const gone = now.getTime() - state.since.getTime();
  const hours = PLANS.find((p) => p.plan === fasting.plan)?.[state.phase === 'fasting' ? 'fast' : 'eat'] ?? 0;
  return (
    <Link to="/settings/fasting" className={`fasting-bar ${state.phase}`}>
      <span className="row">
        <span className="t">
          {state.phase === 'fasting' ? <>Fasting <b className="num">{span(gone)}</b> of {hours} h</> : <>Eating window · <b className="num">{span(total - gone)}</b> left</>}
        </span>
        <span className="s">{state.phase === 'fasting' ? `eat at ${clockTime(state.until)}` : `until ${clockTime(state.until)}`}</span>
      </span>
      <span className="meter thin" role="img" aria-label={state.phase === 'fasting' ? 'How far through the fast' : 'How far through the eating window'}>
        <span style={{ width: `${Math.min(100, (gone / total) * 100)}%` }} />
      </span>
    </Link>
  );
}
