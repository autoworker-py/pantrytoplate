import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { done } from '../../lib/native';
import { useUnitSystem } from '../../lib/unitSystem';
import type { WeightHistory } from '../../lib/types';
import type { UnitSystem } from '../../components/BodyInputs';
import { Icon } from '../../ui/Icon';
import { BackButton, Page, Sheet, errorText, useToast } from '../../ui/kit';
import './weight.css';

/*
 * Weight: the day's number, and the trend through the weigh-ins that says
 * where things are really heading. The scale moves a kilo either way with
 * water and salt; the trend moves a tenth of the way with each weigh-in.
 */

const KG_PER_LB = 0.45359237;
export const inUnits = (kg: number, system: UnitSystem) => Math.round((system === 'imperial' ? kg / KG_PER_LB : kg) * 10) / 10;
export const unitOf = (system: UnitSystem) => (system === 'imperial' ? 'lb' : 'kg');
const dayNumber = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
const dateSaid = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** "Down 1.2 lb this week", or level. */
export function weekSaid(changeKg: number | null, system: UnitSystem): string | null {
  if (changeKg === null) return null;
  const change = inUnits(Math.abs(changeKg), system);
  if (change < 0.1) return 'Level this week';
  return `${changeKg < 0 ? 'Down' : 'Up'} ${change} ${unitOf(system)} this week`;
}

export default function WeightPage() {
  const system = useUnitSystem();
  const toast = useToast();
  const [days, setDays] = useState(30);
  const [history, setHistory] = useState<WeightHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);

  const load = useCallback(async () => {
    try {
      setHistory(await api.getFresh<WeightHistory>(`/api/body/weight?days=${days}`));
      setError(null);
    } catch (e) {
      setError(errorText(e, 'Your weigh-ins could not be loaded.'));
    }
  }, [days]);
  useEffect(() => {
    void load();
  }, [load]);

  async function remove(day: string) {
    try {
      setHistory(await api.delete<WeightHistory>(`/api/body/weight/${day}`));
      toast(`The weigh-in for ${dateSaid(day)} is gone.`);
    } catch (e) {
      toast(errorText(e, 'That weigh-in could not be removed.'));
    }
  }

  const unit = unitOf(system);
  const latest = history?.latest ?? null;

  return (
    <Page left={<BackButton />} title="Weight">
      {error ? <div className="banner error">{error}</div> : null}
      {!history ? (
        <div className="skeleton" style={{ height: 280 }} />
      ) : (
        <>
          <section className="weight-hero">
            {latest ? (
              <>
                <span className="big num">{inUnits(latest.kg, system)}<small> {unit}</small></span>
                <span className="s">
                  {history.trendKg !== null ? `Trend ${inUnits(history.trendKg, system)} ${unit}` : null}
                  {weekSaid(history.weekChangeKg, system) ? ` · ${weekSaid(history.weekChangeKg, system)}` : null}
                </span>
              </>
            ) : (
              <>
                <span className="t">No weigh-ins yet</span>
                <span className="s">Weigh yourself in the morning, before eating, for the steadiest numbers.</span>
              </>
            )}
          </section>

          {history.entries.length ? (
            <>
              <div className="chips" role="radiogroup" aria-label="How far back" style={{ marginTop: 14 }}>
                {[30, 90, 365].map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={days === n} className={`chip${days === n ? ' on' : ''}`} onClick={() => setDays(n)}>
                    {n === 365 ? 'A year' : `${n} days`}
                  </button>
                ))}
              </div>
              <WeightChart history={history} system={system} days={days} />
            </>
          ) : null}

          <button type="button" className="btn block" style={{ marginTop: 18 }} onClick={() => setLogging(true)}>
            <Icon name="plus" size={18} /> Log today’s weight
          </button>
          <p className="fine" style={{ marginTop: 10 }}>
            The trend line smooths out day-to-day swings from water and salt, so it shows where you’re really heading. Your calorie target follows it.
          </p>

          {history.entries.length ? (
            <>
              <div className="section"><h2>Weigh-ins</h2><span className="aside">{history.entries.length}</span></div>
              <div className="group">
                {[...history.entries].reverse().slice(0, 30).map((entry) => (
                  <div key={entry.day} className="list-row">
                    <span className="grow">
                      <span className="t num">{inUnits(entry.kg, system)} {unit}</span>
                      <span className="s">{dateSaid(entry.day)}</span>
                    </span>
                    <button type="button" className="icon-btn" aria-label={`Remove the weigh-in for ${dateSaid(entry.day)}`} onClick={() => void remove(entry.day)}>
                      <Icon name="trash" size={18} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </>
      )}

      {logging ? (
        <LogWeightSheet
          system={system}
          last={latest?.kg ?? null}
          onClose={() => setLogging(false)}
          onLogged={(h) => {
            setHistory(h);
            setLogging(false);
            done();
            toast('Weighed in. Your target follows the trend.');
          }}
        />
      ) : null}
    </Page>
  );
}

/** Daily weigh-ins as dots, the trend as a line through them. */
function WeightChart({ history, system, days }: { history: WeightHistory; system: UnitSystem; days: number }) {
  const W = 340;
  const H = 180;
  const pad = { left: 38, right: 8, top: 10, bottom: 22 };
  const chart = useMemo(() => {
    const points = [...history.entries, ...history.trend];
    const values = points.map((p) => inUnits(p.kg, system));
    let low = Math.min(...values);
    let high = Math.max(...values);
    if (high - low < 2) {
      low -= 1;
      high += 1;
    }
    const spread = high - low;
    low -= spread * 0.1;
    high += spread * 0.1;
    const lastDay = history.trend[history.trend.length - 1]?.day ?? history.entries[history.entries.length - 1]!.day;
    const end = dayNumber(lastDay);
    const start = end - days;
    const x = (day: string) => pad.left + ((dayNumber(day) - start) / Math.max(1, end - start)) * (W - pad.left - pad.right);
    const y = (kg: number) => pad.top + (1 - (inUnits(kg, system) - low) / (high - low)) * (H - pad.top - pad.bottom);
    const ticks = [low + (high - low) * 0.15, (low + high) / 2, high - (high - low) * 0.15].map((v) => Math.round(v * 10) / 10);
    return {
      dots: history.entries.map((e) => ({ cx: x(e.day), cy: y(e.kg), key: e.day })),
      line: history.trend.map((t) => `${x(t.day).toFixed(1)},${y(t.kg).toFixed(1)}`).join(' '),
      ticks: ticks.map((v) => ({ v, at: pad.top + (1 - (v - low) / (high - low)) * (H - pad.top - pad.bottom) })),
      firstLabel: dateSaid(history.entries[0]!.day),
      lastLabel: dateSaid(lastDay),
    };
  }, [history, system, days]);

  return (
    <svg className="weight-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Weight over the last ${days} days`}>
      {chart.ticks.map((t) => (
        <g key={t.v}>
          <line x1={pad.left} x2={W - pad.right} y1={t.at} y2={t.at} className="grid" />
          <text x={pad.left - 6} y={t.at + 4} textAnchor="end" className="label">{t.v}</text>
        </g>
      ))}
      {chart.dots.map((d) => (
        <circle key={d.key} cx={d.cx} cy={d.cy} r={3} className="dot" />
      ))}
      <polyline points={chart.line} className="trend" />
      <text x={pad.left} y={H - 4} className="label">{chart.firstLabel}</text>
      <text x={W - pad.right} y={H - 4} textAnchor="end" className="label">{chart.lastLabel}</text>
    </svg>
  );
}

function LogWeightSheet({ system, last, onClose, onLogged }: { system: UnitSystem; last: number | null; onClose: () => void; onLogged: (h: WeightHistory) => void }) {
  const [value, setValue] = useState(last ? String(inUnits(last, system)) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kg = Number(value) > 0 ? Math.round((system === 'imperial' ? Number(value) * KG_PER_LB : Number(value)) * 100) / 100 : null;
  async function save() {
    if (!kg) return;
    setBusy(true);
    setError(null);
    try {
      onLogged(await api.post<WeightHistory>('/api/body/weight', { kg }));
    } catch (e) {
      setError(errorText(e, 'That weight could not be saved.'));
      setBusy(false);
    }
  }
  return (
    <Sheet title="Today’s weight" sub="Logging again today replaces this morning’s." onClose={onClose}>
      {error ? <div className="banner error" style={{ marginTop: 10 }}>{error}</div> : null}
      <div className="field">
        <label htmlFor="w-v">Weight</label>
        <div className="input-unit">
          <input id="w-v" type="number" inputMode="decimal" autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
          <span>{unitOf(system)}</span>
        </div>
      </div>
      <button type="button" className="btn block" style={{ marginTop: 18 }} disabled={busy || !kg} onClick={() => void save()}>
        {busy ? 'Saving…' : 'Save'}
      </button>
    </Sheet>
  );
}
