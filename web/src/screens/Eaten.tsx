import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { DayDiary, DiaryEntry, EntryDetail, MealSlot } from '../lib/types';
import { formatAmount } from '../lib/format';
import { FoodThumb } from '../fridge/Fridge';
import { Icon } from '../ui/Icon';
import { Page, Sheet, errorText, useToast } from '../ui/kit';
import { mealNow } from './ItemSheet';

const BarcodeScanner = lazy(() => import('../components/BarcodeScanner').then((m) => ({ default: m.BarcodeScanner })));

const MEAL: Record<MealSlot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks' };

/** A local calendar day. A bare UTC date put entries on the wrong day after 5pm. */
function isoDate(d: Date) {
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
}

interface Waste { wastedItems: number; perWeek: number; topWasted: Array<{ name: string; times: number }> }

export default function Eaten() {
  const toast = useToast();
  const [day, setDay] = useState(() => new Date());
  const [diary, setDiary] = useState<DayDiary | null>(null);
  const [week, setWeek] = useState<Array<{ date: string; totalCalories: number }>>([]);
  const [waste, setWaste] = useState<Waste | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [eatingOut, setEatingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, h] = await Promise.all([
        api.getFresh<DayDiary>(`/api/consumption/today?date=${isoDate(day)}`),
        api.get<{ days: Array<{ date: string; totalCalories: number }> }>('/api/consumption/history?days=7'),
      ]);
      setDiary(d);
      setWeek(h.days);
      setError(null);
    } catch (e) {
      setError(errorText(e, 'Could not load your diary.'));
    }
  }, [day]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    api.get<Waste>('/api/reports/waste?days=30').then(setWaste).catch(() => setWaste(null));
  }, []);

  const isToday = isoDate(day) === isoDate(new Date());
  const shift = (n: number) => setDay((d) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; });
  const target = diary?.targets.calories ?? 0;
  const eaten = Math.round(diary?.totalCalories ?? 0);
  const over = diary ? diary.caloriesRemaining < 0 : false;
  // headroom above the target, so the line never sits on the heading
  const maxWeek = Math.max(target * 1.25, ...week.map((w) => w.totalCalories), 1);

  return (
    <Page title="Eaten" right={<button type="button" className="pill-btn" onClick={() => setEatingOut(true)}><Icon name="plus" size={16} /> Ate out</button>}>
      <div className="daynav">
        <button type="button" className="icon-btn plain" aria-label="Previous day" onClick={() => shift(-1)}><Icon name="back" size={20} /></button>
        <span className="day">{isToday ? 'Today' : day.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</span>
        <button type="button" className="icon-btn plain" aria-label="Next day" onClick={() => shift(1)} disabled={isToday}><Icon name="chevron" size={20} /></button>
      </div>
      {error ? <div className="banner error">{error}</div> : null}

      {!diary ? (
        <div className="skeleton" style={{ height: 190, marginTop: 8 }} />
      ) : (
        <section className="budget">
          <div className="budget-top">
            <span className="big num">{eaten.toLocaleString()}</span>
            <span className="of">of {target.toLocaleString()} kcal</span>
          </div>
          <div className={`meter${over ? ' over' : ''}`} role="img" aria-label={`${eaten} of ${target} calories`}>
            <span style={{ width: `${Math.min(100, target ? (eaten / target) * 100 : 0)}%` }} />
          </div>
          <p className={`left${over ? ' danger-ink' : ''}`}>{over ? `${Math.abs(Math.round(diary.caloriesRemaining)).toLocaleString()} over` : `${Math.round(diary.caloriesRemaining).toLocaleString()} left`}</p>
          <div className="macros">
            {([['Protein', diary.macros.protein, diary.targets.protein], ['Carbs', diary.macros.carbs, diary.targets.carbs], ['Fat', diary.macros.fat, diary.targets.fat]] as const).map(([label, v, t]) => (
              <div key={label} className="macro">
                <span className="fine">{label}</span>
                <div className="meter thin"><span style={{ width: `${Math.min(100, t ? (v / t) * 100 : 0)}%` }} /></div>
                <span className="v num">{Math.round(v)}<span className="faint"> / {t} g</span></span>
              </div>
            ))}
          </div>
          {diary.unknownCalorieEntries > 0 ? <p className="fine" style={{ marginTop: 10 }}>{diary.unknownCalorieEntries} {diary.unknownCalorieEntries === 1 ? 'entry has' : 'entries have'} no nutrition data, so {diary.unknownCalorieEntries === 1 ? 'it is' : 'they are'} not counted.</p> : null}
        </section>
      )}

      {diary && diary.entryCount === 0 ? (
        <div className="empty" style={{ paddingTop: 30 }}>
          <h3>Nothing logged {isToday ? 'yet today' : 'that day'}</h3>
          <p>Cook something, or tap a food in your pantry and say you ate some. Calories follow on their own.</p>
          {isToday ? <Link to="/" className="btn small">See what to cook</Link> : null}
        </div>
      ) : null}

      {diary?.meals.filter((m) => m.entries.length).map((m) => (
        <section key={m.slot}>
          <div className="section"><h2>{MEAL[m.slot]}</h2><span className="aside">{Math.round(m.calories)} kcal</span></div>
          <div className="list">
            {m.entries.map((e) => <EntryRow key={e.id} e={e} onOpen={() => setOpen(e.id)} />)}
          </div>
        </section>
      ))}

      {week.length ? (
        <>
          <div className="section"><h2>This week</h2><span className="aside">target {target.toLocaleString()}</span></div>
          <div className="week" role="img" aria-label="Calories for the last seven days">
            <span className="target-line" style={{ bottom: `${(target / maxWeek) * 100}%` }} />
            {week.map((w) => {
              const d = new Date(`${w.date}T12:00:00`);
              return (
                <div key={w.date} className={`wk${w.date === isoDate(day) ? ' on' : ''}`}>
                  <div className="track"><span className={w.totalCalories > target ? 'over' : ''} style={{ height: `${Math.max(2, (w.totalCalories / maxWeek) * 100)}%` }} /></div>
                  <span className="d">{d.toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      {waste ? (
        <>
          <div className="section"><h2>Thrown away</h2><span className="aside">last 30 days</span></div>
          <div className="waste">
            <span className="big num">{waste.wastedItems}</span>
            <span className="grow">
              <span className="t">{waste.wastedItems === 0 ? 'Nothing wasted. Keep cooking what goes off first.' : `${waste.wastedItems === 1 ? 'thing' : 'things'} went in the bin, about ${waste.perWeek} a week.`}</span>
              {waste.topWasted.length ? <span className="s">Most often: {waste.topWasted.slice(0, 3).map((w) => w.name).join(', ')}</span> : null}
            </span>
          </div>
        </>
      ) : null}

      {open ? <EntrySheet id={open} onClose={() => setOpen(null)} onUndone={(m) => { setOpen(null); toast(m); void load(); }} /> : null}
      {eatingOut ? <EatOutSheet onClose={() => setEatingOut(false)} onLogged={(m) => { setEatingOut(false); toast(m); void load(); }} /> : null}
    </Page>
  );
}

function EntryRow({ e, onOpen }: { e: DiaryEntry; onOpen: () => void }) {
  return (
    <button type="button" className="list-row" onClick={onOpen}>
      <span className="thumb">{e.kind === 'meal' ? <Icon name="cook" size={22} className="warm" /> : <FoodThumb name={e.name} category={null} quantity={e.quantity} unit={e.unit} size={32} />}</span>
      <span className="grow">
        <span className="t">{e.recipeName ?? e.name}</span>
        <span className="s">{e.kind === 'meal' ? `Cooked · ${e.ingredientCount} ingredients` : formatAmount(e.quantity, e.unit)}{e.source === 'eating_out' ? ' · ate out' : ''}</span>
      </span>
      <span className="end num">{e.calories === null ? <span className="faint">–</span> : Math.round(e.calories)}</span>
    </button>
  );
}

function EntrySheet({ id, onClose, onUndone }: { id: string; onClose: () => void; onUndone: (message: string) => void }) {
  const [entry, setEntry] = useState<EntryDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ entry: EntryDetail }>(`/api/consumption/${id}`).then((d) => setEntry(d.entry)).catch(() => setError('Could not load that entry.'));
  }, [id]);

  async function undo() {
    setBusy(true);
    try {
      const { result } = await api.delete<{ result: { name: string; restoredToPantry: { quantity: number; unit: string } | null; restoredItems: Array<{ name: string }> } }>(`/api/consumption/${id}`);
      onUndone(result.restoredItems.length > 1 ? `Undone. ${result.restoredItems.length} ingredients are back in your pantry.` : result.restoredToPantry ? `Undone. ${result.name} is back to ${formatAmount(result.restoredToPantry.quantity, result.restoredToPantry.unit)}.` : `Undone. ${result.name} is out of your diary.`);
    } catch (e) {
      setError(errorText(e, 'Could not undo that.'));
      setBusy(false);
    }
  }

  return (
    <Sheet title={entry?.name ?? ' '} sub={entry ? `${entry.kind === 'meal' ? 'Cooked' : formatAmount(entry.quantity, entry.unit)} · ${MEAL[entry.mealSlot].toLowerCase()}${entry.source === 'eating_out' ? ' · not from your pantry' : ''}` : undefined} onClose={onClose}>
      {error ? <div className="banner error" style={{ marginTop: 10 }}>{error}</div> : null}
      {!entry ? <div className="skeleton" style={{ height: 120, marginTop: 12 }} /> : (
        <>
          <div className="entry-facts">
            <div><span className="num big">{entry.calories === null ? '–' : Math.round(entry.calories)}</span><span className="fine">kcal</span></div>
            <div><span className="num">{entry.macros.protein === null ? '–' : `${Math.round(entry.macros.protein)} g`}</span><span className="fine">protein</span></div>
            <div><span className="num">{entry.macros.carbs === null ? '–' : `${Math.round(entry.macros.carbs)} g`}</span><span className="fine">carbs</span></div>
            <div><span className="num">{entry.macros.fat === null ? '–' : `${Math.round(entry.macros.fat)} g`}</span><span className="fine">fat</span></div>
          </div>
          {entry.nutritionBasis ? <p className="fine" style={{ marginTop: 8 }}>Worked out from {entry.nutritionBasis.replace(/^worked out from /i, '')}.</p> : null}
          {entry.recipe ? (
            <>
              <div className="section"><h2>What went into it</h2><span className="aside">{entry.recipe.servings} {entry.recipe.servings === 1 ? 'serving' : 'servings'}</span></div>
              <div className="list">
                {entry.recipe.ingredients.map((i) => (
                  <div key={i.name} className="list-row">
                    <span className="thumb"><FoodThumb name={i.name} category={null} size={28} /></span>
                    <span className="grow"><span className="t">{i.name}</span><span className="s">{formatAmount(i.quantity, i.unit)}</span></span>
                    <span className="end num faint">{i.calories === null ? '–' : Math.round(i.calories)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : null}
          {entry.canUndo ? (
            <button type="button" className="btn secondary block" style={{ marginTop: 20 }} onClick={undo} disabled={busy}>
              <Icon name="undo" size={18} /> {entry.kind === 'meal' ? 'Undo, and put the ingredients back' : 'Undo, and put it back'}
            </button>
          ) : entry.source === 'eating_out' ? (
            <button type="button" className="btn secondary block" style={{ marginTop: 20 }} onClick={undo} disabled={busy}>Remove from diary</button>
          ) : null}
        </>
      )}
    </Sheet>
  );
}

interface Recent { foodReferenceId: string; name: string; brand: string | null; quantity: number; unit: string; calories: number | null }
interface Hit { id: string; name: string; brand: string | null; caloriesPerUnit: number | null; defaultUnit: string }

/**
 * Something you ate that never went through your pantry: a meal out, a coffee.
 * Only your calories change; nothing is added that you would have to delete.
 */
function EatOutSheet({ onClose, onLogged }: { onClose: () => void; onLogged: (m: string) => void }) {
  const [meal, setMeal] = useState<MealSlot>(mealNow);
  const [q, setQ] = useState('');
  const [recent, setRecent] = useState<Recent[]>([]);
  const [hits, setHits] = useState<Hit[]>([]);
  const [kcal, setKcal] = useState('');
  const [scan, setScan] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { api.get<{ recent: Recent[] }>('/api/consumption/eat-out/recent').then((d) => setRecent(d.recent ?? [])).catch(() => setRecent([])); }, []);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const t = window.setTimeout(() => {
      api.get<{ results: Hit[] }>(`/api/consumption/eat-out/search?q=${encodeURIComponent(q.trim())}`).then((d) => setHits(d.results ?? [])).catch(() => setHits([]));
    }, 220);
    return () => window.clearTimeout(t);
  }, [q]);

  async function log(payload: Record<string, unknown>, label: string) {
    setBusy(true);
    setError(null);
    try {
      const d = await api.post<{ entry: { calories: number | null } }>('/api/consumption/eat-out', { mealSlot: meal, ...payload });
      onLogged(d.entry.calories === null ? `Logged ${label}.` : `Logged ${label}, ${Math.round(d.entry.calories)} kcal.`);
    } catch (e) {
      setError(errorText(e, 'Could not log that.'));
      setBusy(false);
    }
  }

  async function scanned(code: string) {
    setBusy(true);
    try {
      const d = await api.get<{ food: { id: string; name: string } }>(`/api/foods/barcode/${code}`);
      await log({ foodReferenceId: d.food.id, quantity: 1 }, d.food.name);
    } catch (e) {
      setError(errorText(e, 'Could not look that up. Search for it instead, or type the calories.'));
      setBusy(false);
    }
  }

  return (
    <Sheet title="Ate out" sub="Only your calories change. Nothing goes into your pantry." onClose={onClose}>
      <div className="chips" style={{ marginTop: 12 }}>
        {(['breakfast', 'lunch', 'dinner', 'snack'] as MealSlot[]).map((m) => <button key={m} type="button" className={`chip${meal === m ? ' on' : ''}`} onClick={() => setMeal(m)}>{MEAL[m]}</button>)}
      </div>
      {error ? <div className="banner error" style={{ marginTop: 12 }}>{error}</div> : null}
      {scan ? (
        <div style={{ marginTop: 14 }}>
          <Suspense fallback={<div className="skeleton" style={{ aspectRatio: '4 / 3' }} />}><BarcodeScanner onDetected={scanned} /></Suspense>
          <button type="button" className="btn ghost block" onClick={() => setScan(false)}>Search instead</button>
        </div>
      ) : (
        <>
          <div className="search" style={{ marginTop: 14 }}>
            <Icon name="search" size={18} />
            <input className="input" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Burrito, latte, slice of pizza…" aria-label="What did you eat?" />
          </div>
          <div className="list" style={{ marginTop: 10 }}>
            {(q.trim().length < 2 ? recent.map((r) => ({ key: r.foodReferenceId, name: r.name, sub: `${formatAmount(r.quantity, r.unit)}${r.calories !== null ? ` · ${Math.round(r.calories)} kcal` : ''}`, run: () => log({ foodReferenceId: r.foodReferenceId, quantity: r.quantity, unit: r.unit }, r.name) }))
              : hits.map((h) => ({ key: h.id, name: h.name, sub: [h.brand, h.caloriesPerUnit !== null ? `${Math.round(h.caloriesPerUnit * (h.defaultUnit === 'g' ? 100 : 1))} kcal per ${h.defaultUnit === 'g' ? '100 g' : h.defaultUnit}` : null].filter(Boolean).join(' · '), run: () => log({ foodReferenceId: h.id, quantity: 1 }, h.name) }))
            ).map((row) => (
              <button key={row.key} type="button" className="list-row" disabled={busy} onClick={() => void row.run()}>
                <span className="thumb"><FoodThumb name={row.name} category={null} size={30} /></span>
                <span className="grow"><span className="t">{row.name}</span><span className="s">{row.sub}</span></span>
                <Icon name="plus" size={18} className="faint" />
              </button>
            ))}
          </div>
          {q.trim().length >= 2 ? (
            <div className="manual">
              <span className="fine">Not listed? Log “{q.trim()}” with the calories:</span>
              <div className="field-row" style={{ alignItems: 'flex-end' }}>
                <div className="field" style={{ marginTop: 8 }}><input type="number" inputMode="numeric" min={0} value={kcal} onChange={(e) => setKcal(e.target.value)} placeholder="kcal" aria-label="Calories" /></div>
                <button type="button" className="btn" style={{ flex: '0 0 auto' }} disabled={busy || !(Number(kcal) >= 0) || kcal === ''} onClick={() => void log({ name: q.trim(), calories: Number(kcal) }, q.trim())}>Log it</button>
              </div>
            </div>
          ) : null}
          <button type="button" className="btn ghost block" style={{ marginTop: 10 }} onClick={() => setScan(true)}><Icon name="scan" size={18} /> Scan a packet instead</button>
        </>
      )}
    </Sheet>
  );
}
