import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { handPhoto, photographMeal, snapStatus, type SnapStatus } from '../lib/snap';
import { LogActions } from './snap/SnapViews';
import type { DayDiary, DiaryEntry, EntryDetail, Grade, MealSlot } from '../lib/types';
import { formatAmount, formatServings } from '../lib/format';
import { FoodThumb } from '../fridge/Fridge';
import { Icon } from '../ui/Icon';
import { Page, Sheet, errorText, useToast } from '../ui/kit';
import { mealNow } from './ItemSheet';
import { useUnitSystem } from '../lib/unitSystem';
import { MealReceipt, WaterLine } from './eaten/DiaryParts';
import { FastingBar } from './eaten/BodyParts';
import { GradeBadge, QuietGrade } from '../ui/Grade';
import { dayActivity } from '../lib/health';
import { FastingReminder } from '../components/FastingReminder';

const BarcodeScanner = lazy(() => import('../components/BarcodeScanner').then((m) => ({ default: m.BarcodeScanner })));

const MEAL: Record<MealSlot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks' };

/** A local calendar day. A bare UTC date put entries on the wrong day after 5pm. */
function isoDate(d: Date) {
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
}


export default function Eaten() {
  const [snap, setSnap] = useState<SnapStatus | null>(null);
  useEffect(() => { void snapStatus().then(setSnap).catch(() => setSnap(null)); }, []);
  const toast = useToast();
  const navigate = useNavigate();

  /**
   * Nobody is assumed to have Pro: with no answer about the allowance, the
   * camera stays shut. Free photos used up: the paywall comes before the
   * camera, never after a photo is taken.
   */
  async function startSnap() {
    const now = (await snapStatus().catch(() => null)) ?? null;
    setSnap(now);
    if (!now || !now.available) {
      toast(now ? 'Photo reading is not set up yet. Try again soon.' : 'Snap a meal is not available right now. Try again in a moment.');
      return;
    }
    if (!now.plus && (now.freeLeft ?? 0) <= 0) {
      navigate('/snap', { state: { paywall: true } });
      return;
    }
    try {
      const photo = await photographMeal();
      if (!photo) return;
      handPhoto(photo);
      navigate('/snap');
    } catch (cause) {
      toast(errorText(cause, 'Could not open the camera. Check that Pantry2Plate is allowed to use it in Settings.'));
    }
  }
  const [day, setDay] = useState(() => new Date());
  const [diary, setDiary] = useState<DayDiary | null>(null);
  const [week, setWeek] = useState<Array<{ date: string; totalCalories: number }>>([]);
  const [open, setOpen] = useState<string | null>(null);
  const system = useUnitSystem();
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
  // exercise from Apple Health, read on this phone, and how much of it the person eats back
  const [exercise, setExercise] = useState<'all' | 'half' | 'none'>('all');
  // water is only for the people who switch it on in Settings
  const [trackWater, setTrackWater] = useState(false);
  const [moved, setMoved] = useState<{ activeKcal: number; steps: number } | null>(null);
  useEffect(() => {
    api
      .get<{ settings: { exerciseCalories?: 'all' | 'half' | 'none'; trackWater?: boolean } }>('/api/settings')
      .then((d) => {
        setExercise(d.settings.exerciseCalories ?? 'all');
        setTrackWater(d.settings.trackWater ?? false);
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    let live = true;
    void dayActivity(isoDate(day)).then((a) => { if (live) setMoved(a); });
    return () => { live = false; };
  }, [day]);

  const isToday = isoDate(day) === isoDate(new Date());
  const shift = (n: number) => setDay((d) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; });
  const target = diary?.targets.calories ?? 0;
  const added = moved && exercise !== 'none' ? Math.round(moved.activeKcal * (exercise === 'half' ? 0.5 : 1)) : 0;
  const budget = target + added;
  const eaten = Math.round(diary?.totalCalories ?? 0);
  const remaining = diary ? diary.caloriesRemaining + added : 0;
  const over = diary ? remaining < 0 : false;
  // headroom above the target, so the line never sits on the heading
  const maxWeek = Math.max(target * 1.25, ...week.map((w) => w.totalCalories), 1);

  return (
    <Page title="Eaten">
      <div className="daynav">
        <button type="button" className="icon-btn plain" aria-label="Previous day" onClick={() => shift(-1)}><Icon name="back" size={20} /></button>
        <span className="day">{isToday ? 'Today' : day.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</span>
        <button type="button" className="icon-btn plain" aria-label="Next day" onClick={() => shift(1)} disabled={isToday}><Icon name="chevron" size={20} /></button>
      </div>
      {error ? <div className="banner error">{error}</div> : null}
      {isToday ? <FastingBar /> : null}

      {!diary ? (
        <div className="skeleton" style={{ height: 190, marginTop: 8 }} />
      ) : (
        <section className="budget">
          <div className="budget-top">
            <span className="big num">{eaten.toLocaleString()}</span>
            <span className="of">of {budget.toLocaleString()} kcal</span>
            {diary.grade ? <QuietGrade grade={diary.grade} label="The day's food" /> : null}
          </div>
          {moved && (moved.activeKcal > 0 || moved.steps > 0) ? (
            <p className="fine moved">
              {added ? `+${added.toLocaleString()} kcal from exercise` : `${moved.activeKcal.toLocaleString()} kcal burned`} · {moved.steps.toLocaleString()} steps
            </p>
          ) : null}
          <div className={`meter${over ? ' over' : ''}`} role="img" aria-label={`${eaten} of ${budget} calories`}>
            <span style={{ width: `${Math.min(100, budget ? (eaten / budget) * 100 : 0)}%` }} />
          </div>
          <p className={`left${over ? ' danger-ink' : ''}`}>{over ? `${Math.abs(Math.round(remaining)).toLocaleString()} over` : `${Math.round(remaining).toLocaleString()} left`}</p>
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

      {trackWater ? <WaterLine day={isoDate(day)} today={isToday} system={system} /> : null}
      {isToday ? <LogActions status={snap} onSnap={() => void startSnap()} onOther={() => setEatingOut(true)} /> : null}

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
          <div className="week" role="img" aria-label={`Calories for the last seven days, against a target of ${target.toLocaleString()}`}>
            <div className="week-plot">
              {week.map((w) => (
                <div key={w.date} className={`wk${w.date === isoDate(day) ? ' on' : ''}`}>
                  <span className={w.totalCalories > target ? 'over' : ''} style={{ height: `${Math.max(2, (w.totalCalories / maxWeek) * 100)}%` }} />
                </div>
              ))}
              {/* drawn after the bars, so a day over target shows the line crossing it */}
              <span className="target-line" style={{ bottom: `${(target / maxWeek) * 100}%` }} />
            </div>
            <div className="week-days">
              {week.map((w) => (
                <span key={w.date} className={`d${w.date === isoDate(day) ? ' on' : ''}`}>{new Date(`${w.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
              ))}
            </div>
          </div>
        </>
      ) : null}

      {open ? <EntrySheet id={open} grade={diary?.meals.flatMap((m) => m.entries).find((e) => e.id === open)?.grade} onClose={() => setOpen(null)} onUndone={(m) => { setOpen(null); toast(m); void load(); }} onChanged={() => { setOpen(null); void load(); }} onUpdated={() => void load()} /> : null}
      {eatingOut ? <EatOutSheet onClose={() => setEatingOut(false)} onLogged={(m) => { setEatingOut(false); toast(m); void load(); }} /> : null}
    </Page>
  );
}

function EntryRow({ e, onOpen }: { e: DiaryEntry; onOpen: () => void }) {
  return (
    <button type="button" className="list-row" onClick={onOpen}>
      <span className="thumb">{e.kind === 'meal' ? <Icon name={e.source === 'eating_out' ? 'fork' : 'cook'} size={22} className="warm" /> : <FoodThumb name={e.name} category={null} quantity={e.quantity} unit={e.unit} size={32} />}</span>
      <span className="grow">
        <span className="t">{e.recipeName ?? e.name}</span>
        <span className="s">
          {e.kind === 'meal' ? (e.source === 'eating_out' ? `${e.ingredientCount} ${e.ingredientCount === 1 ? 'item' : 'items'}` : `Cooked · ${e.ingredientCount} ingredients`) : formatAmount(e.quantity, e.unit)}
          {e.source === 'eating_out' ? ' · not from pantry' : ''}
        </span>
      </span>
      {e.grade ? <QuietGrade grade={e.grade} /> : null}
      <span className="end num">{e.calories === null ? <span className="faint">–</span> : Math.round(e.calories)}</span>
    </button>
  );
}

const SHARES: Array<[number, string]> = [[0.25, 'A quarter'], [0.5, 'Half'], [0.75, 'Three quarters']];

function EntrySheet({ id, grade, onClose, onUndone, onChanged, onUpdated }: { id: string; grade?: Grade | null; onClose: () => void; onUndone: (message: string) => void; onChanged: () => void; onUpdated: () => void }) {
  const toast = useToast();
  const [entry, setEntry] = useState<EntryDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partial, setPartial] = useState(false);
  const [share, setShare] = useState<[number, string] | null>(null);

  const reload = useCallback(() => {
    api.getFresh<{ entry: EntryDetail }>(`/api/consumption/${id}`).then((d) => setEntry(d.entry)).catch(() => setError('Could not load that entry.'));
  }, [id]);
  useEffect(reload, [reload]);

  /** The rest of a cooked meal goes in the fridge, of a pantry food back where it came from, or either in the bin. */
  async function ateSome(ate: number, label: string, rest: 'keep' | 'bin') {
    setBusy(true);
    setError(null);
    try {
      const { result } = await api.post<{ result: { kind: 'meal' | 'food'; name: string; leftover: { inventoryItemId: string; servings: number } | null; binnedId: string | null } }>(`/api/consumption/${id}/save-rest`, { ate, rest });
      const after = rest === 'bin'
        ? `The rest of the ${result.name.toLowerCase()} went in the bin.`
        : result.leftover
          ? `${formatServings(result.leftover.servings)} of ${result.name} went in the fridge.`
          : `The rest of the ${result.name.toLowerCase()} is back in your pantry.`;
      toast(`Logged ${label.toLowerCase()} of it. ${after}`, {
        label: 'Undo',
        run: () => {
          void api
            .post(`/api/consumption/${id}/save-rest/undo`, { ate, leftoverItemId: result.leftover?.inventoryItemId ?? null, binnedId: result.binnedId })
            .then(() => { toast('Undone. All of it is back in your diary.'); onChanged(); })
            .catch((e) => toast(errorText(e, 'Could not undo that.')));
        },
      });
      onChanged();
    } catch (e) {
      setError(errorText(e, 'Could not change that.'));
      setBusy(false);
    }
  }

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

  const lines = entry?.lines ?? null;
  return (
    <Sheet title={entry?.name ?? ' '} sub={entry ? `${entry.kind === 'meal' ? (entry.source === 'eating_out' ? 'Eaten out' : 'Cooked') : formatAmount(entry.quantity, entry.unit)} · ${MEAL[entry.mealSlot].toLowerCase()}${entry.source === 'eating_out' && entry.kind !== 'meal' ? ' · not from your pantry' : ''}` : undefined} onClose={onClose}>
      {error ? <div className="banner error" style={{ marginTop: 10 }}>{error}</div> : null}
      {!entry ? <div className="skeleton" style={{ height: 120, marginTop: 12 }} /> : (
        <>
          <div className="entry-facts">
            <div><span className="num big">{entry.calories === null ? '–' : Math.round(entry.calories)}</span><span className="fine">kcal</span></div>
            <div><span className="num">{entry.macros.protein === null ? '–' : `${Math.round(entry.macros.protein)} g`}</span><span className="fine">protein</span></div>
            <div><span className="num">{entry.macros.carbs === null ? '–' : `${Math.round(entry.macros.carbs)} g`}</span><span className="fine">carbs</span></div>
            <div><span className="num">{entry.macros.fat === null ? '–' : `${Math.round(entry.macros.fat)} g`}</span><span className="fine">fat</span></div>
          </div>
          {grade ? (
            <p className="entry-grade">
              <GradeBadge grade={grade} small /> <span className="fine">Health grade, from what&rsquo;s in it per 100 g</span>
            </p>
          ) : null}
          {entry.nutritionBasis ? <p className="fine" style={{ marginTop: 8 }}>Worked out from {entry.nutritionBasis.replace(/^worked out from /i, '')}.</p> : null}

          {lines ? (
            <MealReceipt entry={{ ...entry, lines }} onChanged={() => { reload(); onUpdated(); }} />
          ) : null}

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

          {!lines && (entry.kind === 'meal' || entry.canUndo) ? (
            partial ? (
              <div className="partial">
                <div className="label" style={{ marginTop: 20 }}>How much did you eat?</div>
                <div className="chips" role="radiogroup" aria-label="How much you ate" style={{ marginTop: 8 }}>
                  {SHARES.map(([value, label]) => (
                    <button key={value} type="button" role="radio" aria-checked={share?.[0] === value} className={`chip${share?.[0] === value ? ' on' : ''}`} disabled={busy} onClick={() => setShare([value, label])}>{label}</button>
                  ))}
                </div>
                {share ? (
                  <div className="receipt-rest">
                    <span className="label">The rest</span>
                    <button type="button" className="btn secondary" disabled={busy} onClick={() => void ateSome(share[0], share[1], 'keep')}>
                      <Icon name={entry.kind === 'meal' ? 'snow' : 'pantry'} size={18} /> {entry.kind === 'meal' ? 'Fridge' : 'Pantry'}
                    </button>
                    <button type="button" className="btn secondary" disabled={busy} onClick={() => void ateSome(share[0], share[1], 'bin')}>
                      <Icon name="bin" size={18} /> Bin
                    </button>
                  </div>
                ) : (
                  <p className="fine" style={{ marginTop: 8 }}>Only what you ate counts today. Then say where the rest goes.</p>
                )}
              </div>
            ) : (
              <button type="button" className="btn secondary block" style={{ marginTop: 20 }} onClick={() => setPartial(true)} disabled={busy}>
                <Icon name="fork" size={18} /> I didn’t finish it
              </button>
            )
          ) : null}
          {entry.canUndo ? (
            <button type="button" className="btn ghost block" style={{ marginTop: 8 }} onClick={undo} disabled={busy}>
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
  const [manual, setManual] = useState(false);
  const [name, setName] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [scan, setScan] = useState(false);
  // past logs wait behind their own tab, so the sheet opens on an empty search, not a wall of history
  const [tab, setTab] = useState<'search' | 'recent'>('search');
  const grams = (v: string) => (v.trim() === '' ? null : Math.max(0, Number(v)));
  // macros alone are enough: four calories a gram of protein or carbohydrate, nine of fat
  const fromMacros = Math.round((grams(protein) ?? 0) * 4 + (grams(carbs) ?? 0) * 4 + (grams(fat) ?? 0) * 9);
  const calories = kcal.trim() !== '' ? Number(kcal) : fromMacros > 0 ? fromMacros : null;
  const canLog = name.trim().length > 0 && calories !== null && calories >= 0;
  const typeIt = () => { setName(q.trim()); setManual(true); };
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
    <Sheet title="Something not in your pantry" sub="It counts toward today. Nothing in your pantry changes." onClose={onClose}>
      <FastingReminder style={{ marginTop: 16 }} />
      <div className="chips" style={{ marginTop: 12 }}>
        {(['breakfast', 'lunch', 'dinner', 'snack'] as MealSlot[]).map((m) => <button key={m} type="button" className={`chip${meal === m ? ' on' : ''}`} onClick={() => setMeal(m)}>{MEAL[m]}</button>)}
      </div>
      {error ? <div className="banner error" style={{ marginTop: 12 }}>{error}</div> : null}
      <div className="seg" role="tablist" style={{ marginTop: 14 }}>
        <button type="button" role="tab" aria-selected={tab === 'search'} className={tab === 'search' ? 'on' : ''} onClick={() => setTab('search')}>Search</button>
        <button type="button" role="tab" aria-selected={tab === 'recent'} className={tab === 'recent' ? 'on' : ''} onClick={() => { setTab('recent'); setScan(false); }}>
          <span>Recent{recent.length ? <span className="count">{recent.length}</span> : null}</span>
        </button>
      </div>
      {tab === 'recent' ? (
        recent.length ? (
          <div className="list" style={{ marginTop: 10 }}>
            {recent.map((r) => (
              <button key={r.foodReferenceId} type="button" className="list-row" disabled={busy} onClick={() => void log({ foodReferenceId: r.foodReferenceId, quantity: r.quantity, unit: r.unit }, r.name)}>
                <span className="thumb"><FoodThumb name={r.name} category={null} size={30} /></span>
                <span className="grow"><span className="t">{r.name}</span><span className="s">{formatAmount(r.quantity, r.unit)}{r.calories !== null ? ` · ${Math.round(r.calories)} kcal` : ''}</span></span>
                <Icon name="plus" size={18} className="faint" />
              </button>
            ))}
          </div>
        ) : <p className="fine" style={{ marginTop: 14 }}>Nothing yet. What you log here shows up for one tap next time.</p>
      ) : scan ? (
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
            {hits.map((h) => ({ key: h.id, name: h.name, sub: [h.brand, h.caloriesPerUnit !== null ? `${Math.round(h.caloriesPerUnit * (h.defaultUnit === 'g' ? 100 : 1))} kcal per ${h.defaultUnit === 'g' ? '100 g' : h.defaultUnit}` : null].filter(Boolean).join(' · '), run: () => log({ foodReferenceId: h.id, quantity: 1 }, h.name) })
            ).map((row) => (
              <button key={row.key} type="button" className="list-row" disabled={busy} onClick={() => void row.run()}>
                <span className="thumb"><FoodThumb name={row.name} category={null} size={30} /></span>
                <span className="grow"><span className="t">{row.name}</span><span className="s">{row.sub}</span></span>
                <Icon name="plus" size={18} className="faint" />
              </button>
            ))}
          </div>
          {manual ? (
            <div className="manual">
              <div className="field"><label htmlFor="m-name">What was it?</label><input id="m-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Chicken burrito" /></div>
              <div className="macro-grid">
                <div className="field"><label htmlFor="m-kcal">Calories</label><input id="m-kcal" type="number" inputMode="numeric" min={0} value={kcal} onChange={(e) => setKcal(e.target.value)} placeholder={fromMacros > 0 ? String(fromMacros) : 'kcal'} /></div>
                <div className="field"><label htmlFor="m-p">Protein (g)</label><input id="m-p" type="number" inputMode="decimal" min={0} value={protein} onChange={(e) => setProtein(e.target.value)} placeholder="Optional" /></div>
                <div className="field"><label htmlFor="m-c">Carbs (g)</label><input id="m-c" type="number" inputMode="decimal" min={0} value={carbs} onChange={(e) => setCarbs(e.target.value)} placeholder="Optional" /></div>
                <div className="field"><label htmlFor="m-f">Fat (g)</label><input id="m-f" type="number" inputMode="decimal" min={0} value={fat} onChange={(e) => setFat(e.target.value)} placeholder="Optional" /></div>
              </div>
              {kcal.trim() === '' && fromMacros > 0 ? <p className="fine" style={{ marginTop: 8 }}>About {fromMacros} kcal from those macros.</p> : null}
              <button type="button" className="btn block" style={{ marginTop: 14 }} disabled={busy || !canLog} onClick={() => void log({ name: name.trim(), calories, protein: grams(protein), carbs: grams(carbs), fat: grams(fat) }, name.trim())}>Log it</button>
            </div>
          ) : (
            <>
              {q.trim().length >= 2 ? <p className="fine" style={{ marginTop: 12 }}>Not listed? <button type="button" className="link-btn" onClick={typeIt}>Enter “{q.trim()}” yourself</button></p> : null}
              <button type="button" className="btn ghost block" style={{ marginTop: 10 }} onClick={typeIt}><Icon name="edit" size={18} /> Enter calories and macros yourself</button>
            </>
          )}
          <button type="button" className="btn ghost block" onClick={() => setScan(true)}><Icon name="scan" size={18} /> Scan a packet instead</button>
        </>
      )}
    </Sheet>
  );
}
