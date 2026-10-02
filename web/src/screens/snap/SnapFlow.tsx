import { proOnOffer } from '../../lib/native';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, type ApiError } from '../../lib/api';
import type { MealSlot } from '../../lib/types';
import { clearHandedPhoto, earnAdPhoto, handedPhoto, photographMeal, readMeal, redeemPlus, snapStatus, type MealPhoto, type SnapStatus } from '../../lib/snap';
import { adsOnThisDevice, watchAd } from '../../lib/ads';
import { useAuth } from '../../lib/auth';
import { Icon } from '../../ui/Icon';
import { Page, Sheet, errorText, useToast } from '../../ui/kit';
import { mealNow } from '../ItemSheet';
import { Paywall, SnapDescribe, SnapReading, SnapReview, SnapStage, type SnapItem } from './SnapViews';

/*
 * Snap a meal, from the photo Eaten hands over to the entry in the diary:
 * say what it is if you like, read, check, log. Free photos run out into the Pro paywall; a code unlocks
 * Pro while payments are off. Everything logged can be undone from the toast.
 */

type Stage = 'describe' | 'reading' | 'review' | 'paywall' | 'problem';

const PORTIONS: Array<[number, string]> = [[0.5, 'Half that'], [1, 'As shown'], [1.5, 'Half as much again'], [2, 'Twice that']];
const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const tenth = (n: number) => Math.round(n * 10) / 10;

/** "Grilled chicken, white rice and broccoli", or "... and 2 more". */
function mealName(items: SnapItem[]): string {
  const names = items.map((item, i) => (i === 0 ? item.name : item.name.toLowerCase()));
  if (names.length <= 1) return names[0] ?? 'A meal';
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}

export default function SnapFlow() {
  const navigate = useNavigate();
  const toast = useToast();
  const { refresh } = useAuth();
  const startOnPaywall = Boolean((useLocation().state as { paywall?: boolean } | null)?.paywall);
  const [photo, setPhoto] = useState<MealPhoto | null>(handedPhoto);
  const [stage, setStage] = useState<Stage>(startOnPaywall ? 'paywall' : 'describe');
  /** the person's own words for what is in the photo; empty leaves it to the reader */
  const [hint, setHint] = useState('');
  const [status, setStatus] = useState<SnapStatus | null>(null);
  const [base, setBase] = useState<SnapItem[]>([]);
  const [factor, setFactor] = useState<Record<string, number>>({});
  const [kept, setKept] = useState<Set<string>>(() => new Set());
  const [found, setFound] = useState(0);
  const [meal, setMeal] = useState<MealSlot>(mealNow);
  const [problem, setProblem] = useState<{ title: string; text: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const [watching, setWatching] = useState(false);
  const [adNote, setAdNote] = useState<string | null>(null);
  // one read per photo, however many times React starts the effect: each read is an AI request
  const reading = useRef<{ photo: MealPhoto; hint: string; answer: ReturnType<typeof readMeal> } | null>(null);

  useEffect(() => {
    clearHandedPhoto();
    void snapStatus().then(setStatus).catch(() => undefined);
  }, []);

  // each item at the portion the person set: the model's estimate times their correction
  const items = base.map((item) => {
    const f = factor[item.id] ?? 1;
    if (f === 1) return item;
    const times = (value: number | null | undefined) => (value === null || value === undefined ? value : tenth(value * f));
    return {
      ...item,
      grams: Math.round(item.grams * f),
      calories: item.calories * f,
      protein: tenth(item.protein * f),
      carbs: tenth(item.carbs * f),
      fat: tenth(item.fat * f),
      fiber: times(item.fiber),
      sugar: times(item.sugar),
      satFat: times(item.satFat),
      sodium: times(item.sodium),
      portion: `About ${Math.round(item.grams * f)} g`,
    };
  });

  // a read that takes a while is the reader being busy and the server trying again
  useEffect(() => {
    if (stage !== 'reading') { setSlow(false); return; }
    const t = window.setTimeout(() => setSlow(true), 9000);
    return () => window.clearTimeout(t);
  }, [stage]);

  useEffect(() => {
    if (stage === 'describe' && !photo) navigate('/eaten', { replace: true });
  }, [stage, photo, navigate]);

  useEffect(() => {
    if (stage !== 'reading') return;
    if (!photo) { navigate('/eaten', { replace: true }); return; }
    let live = true;
    void (async () => {
      try {
        if (reading.current?.photo !== photo || reading.current.hint !== hint) reading.current = { photo, hint, answer: readMeal(photo, hint) };
        const read = await reading.current.answer;
        if (!live) return;
        setStatus(read);
        const plate: SnapItem[] = read.items.map((item) => ({ ...item, foodName: item.name }));
        if (!plate.length) {
          setProblem({ title: 'No food in that photo', text: 'Try again with the whole plate in frame, from a little above.' });
          setStage('problem');
          return;
        }
        setBase(plate);
        setFactor({});
        setKept(new Set(plate.map((item) => item.id)));
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          for (let n = 1; n <= plate.length; n++) { if (!live) return; setFound(n); await wait(360); }
          await wait(300);
        }
        if (live) setStage('review');
      } catch (cause) {
        if (!live) return;
        const { status: code, code: reason } = cause as ApiError;
        if (code === 402) { setStage('paywall'); return; }
        setProblem(
          reason === 'snap_off' ? { title: 'Photo reading is not set up yet', text: 'The server needs its AI key before it can read photos.' }
            : reason === 'snap_busy' || code === 429 ? { title: 'The photo reader is busy', text: 'It was tried a few times. Give it a minute, then try again. This photo was not counted.' }
            : { title: 'That photo could not be read', text: errorText(cause, 'Try again, or take another photo.') },
        );
        setStage('problem');
      }
    })();
    return () => { live = false; };
  }, [stage, photo, hint, navigate]);

  async function retake() {
    const next = await photographMeal().catch(() => null);
    if (!next) return;
    setPhoto(next);
    setBase([]);
    setFound(0);
    setStage('describe');
  }

  async function log() {
    const on = items.filter((item) => kept.has(item.id));
    if (!on.length) return;
    const total = (k: 'calories' | 'protein' | 'carbs' | 'fat') => tenth(on.reduce((sum, item) => sum + item[k], 0));
    const name = mealName(on);
    setBusy(true);
    try {
      // item by item under one name, so the diary can show what was left on the plate
      const { meal: logged } = await api.post<{ meal: { id: string } }>('/api/consumption/eat-out/meal', {
        name,
        mealSlot: meal,
        items: on.map((item) => ({
          name: item.name,
          grams: item.grams,
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat,
          fiber: item.fiber ?? null,
          sugar: item.sugar ?? null,
          satFat: item.satFat ?? null,
          sodium: item.sodium ?? null,
        })),
      });
      toast(`Logged ${name.toLowerCase()}, ${Math.round(total('calories'))} kcal.`, {
        label: 'Undo',
        run: () => { void api.delete(`/api/consumption/${logged.id}`).then(() => toast('Undone. That meal is out of your diary.')).catch((e) => toast(errorText(e, 'Could not undo that.'))); },
      });
      navigate('/eaten');
    } catch (cause) {
      toast(errorText(cause, 'Could not log that.'));
      setBusy(false);
    }
  }

  async function redeem(code: string) {
    setBusy(true);
    setPayError(null);
    try {
      setStatus(await redeemPlus(code));
      void refresh(); // Pro for the whole app now: no more banner
      toast('Pro is on for this account.');
      setBusy(false);
      // straight back to the photo that was waiting (read afresh, now with Pro), or to taking one
      reading.current = null;
      if (photo && !base.length) { setStage('reading'); return; }
      const next = await photographMeal().catch(() => null);
      if (next) { setPhoto(next); setStage('describe'); } else navigate('/eaten');
    } catch (cause) {
      setPayError(errorText(cause, 'That code did not work.'));
      setBusy(false);
    }
  }

  /** A short ad, chosen, for one more photo: then on to the photo that was waiting, or a new one. */
  async function watchAdForPhoto() {
    setWatching(true);
    setAdNote(null);
    try {
      if (!(await watchAd())) {
        setAdNote('No ad played through, so no photo was added. Try again in a minute.');
        return;
      }
      setStatus(await earnAdPhoto());
      setWatching(false);
      toast('One more photo, thanks to that ad.');
      reading.current = null;
      if (photo && !base.length) { setStage('reading'); return; }
      const next = await photographMeal().catch(() => null);
      if (next) { setPhoto(next); setStage('describe'); } else navigate('/eaten');
    } catch (cause) {
      setAdNote(errorText(cause, 'That did not work. Try again.'));
    } finally {
      setWatching(false);
    }
  }

  const close = <button type="button" className="icon-btn" aria-label="Close" onClick={() => navigate('/eaten')} disabled={busy}><Icon name="close" size={20} /></button>;
  const editingItem = items.find((item) => item.id === editing) ?? null;

  return (
    <Page left={close} title={stage === 'paywall' && proOnOffer ? 'Pantry2Plate Pro' : 'Snap a meal'}>
      {stage === 'describe' ? (
        <SnapDescribe photo={photo?.dataUrl || undefined} hint={hint} onHint={setHint} onRead={() => setStage('reading')} onRetake={() => void retake()} />
      ) : null}
      {stage === 'reading' ? <SnapReading found={found} photo={photo?.dataUrl || undefined} slow={slow} /> : null}
      {stage === 'review' ? (
        <SnapReview
          items={items}
          kept={kept}
          photo={photo?.dataUrl || undefined}
          meal={meal}
          busy={busy}
          onToggle={(id) => setKept((k) => { const next = new Set(k); if (next.has(id)) next.delete(id); else next.add(id); return next; })}
          onEdit={setEditing}
          onAdd={() => setAdding(true)}
          onMeal={setMeal}
          onLog={() => void log()}
          onRetake={() => void retake()}
        />
      ) : null}
      {stage === 'paywall' ? <Paywall
          usedFree={status?.freeTotal ?? 3}
          busy={busy}
          error={payError}
          onRedeem={(code) => void redeem(code)}
          adPhotosLeft={status?.adPhotosLeft ?? 0}
          watching={watching}
          adNote={adNote}
          onWatchAd={adsOnThisDevice() ? () => void watchAdForPhoto() : undefined}
        /> : null}
      {stage === 'problem' && problem ? (
        <div>
          <SnapStage photo={photo?.dataUrl || undefined} />
          <div className="snap-problem">
            <h2>{problem.title}</h2>
            <p>{problem.text}</p>
            <button type="button" className="btn block" style={{ marginTop: 18 }} onClick={() => void retake()}><Icon name="camera" size={18} /> Take another photo</button>
            <button type="button" className="btn ghost block" onClick={() => navigate('/eaten')}>Back to Eaten</button>
          </div>
        </div>
      ) : null}

      {editingItem ? (
        <Sheet title={editingItem.name} sub={`The photo looked like ${base.find((b) => b.id === editingItem.id)?.portion.toLowerCase() ?? 'this much'}. How much was there really?`} onClose={() => setEditing(null)}>
          <div className="choice-list portion-chips">
            {PORTIONS.map(([f, label]) => {
              const original = base.find((b) => b.id === editingItem.id)!;
              return (
                <button key={f} type="button" className={`choice${(factor[editingItem.id] ?? 1) === f ? ' on' : ''}`} onClick={() => { setFactor((all) => ({ ...all, [editingItem.id]: f })); setEditing(null); }}>
                  <span className="t">{label}</span>
                  <span className="s">About {Math.round(original.grams * f)} g · {Math.round(original.calories * f)} kcal</span>
                </button>
              );
            })}
          </div>
        </Sheet>
      ) : null}
      {adding ? (
        <AddItemSheet
          onClose={() => setAdding(false)}
          onAdd={(item) => {
            setBase((all) => [...all, item]);
            setKept((k) => new Set(k).add(item.id));
            setAdding(false);
          }}
        />
      ) : null}
    </Page>
  );
}

/** Something the photo missed: a name and what it adds. */
function AddItemSheet({ onClose, onAdd }: { onClose: () => void; onAdd: (item: SnapItem) => void }) {
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const grams = (v: string) => Math.max(0, Number(v) || 0);
  const fromMacros = Math.round(grams(protein) * 4 + grams(carbs) * 4 + grams(fat) * 9);
  const calories = kcal.trim() !== '' ? Number(kcal) : fromMacros;
  return (
    <Sheet title="Add something it missed" onClose={onClose}>
      <div className="field"><label htmlFor="add-name">What was it?</label><input id="add-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Side salad" /></div>
      <div className="macro-grid">
        <div className="field"><label htmlFor="add-kcal">Calories</label><input id="add-kcal" type="number" inputMode="numeric" min={0} value={kcal} onChange={(e) => setKcal(e.target.value)} placeholder={fromMacros > 0 ? String(fromMacros) : 'kcal'} /></div>
        <div className="field"><label htmlFor="add-p">Protein (g)</label><input id="add-p" type="number" inputMode="decimal" min={0} value={protein} onChange={(e) => setProtein(e.target.value)} placeholder="Optional" /></div>
        <div className="field"><label htmlFor="add-c">Carbs (g)</label><input id="add-c" type="number" inputMode="decimal" min={0} value={carbs} onChange={(e) => setCarbs(e.target.value)} placeholder="Optional" /></div>
        <div className="field"><label htmlFor="add-f">Fat (g)</label><input id="add-f" type="number" inputMode="decimal" min={0} value={fat} onChange={(e) => setFat(e.target.value)} placeholder="Optional" /></div>
      </div>
      <button
        type="button"
        className="btn block"
        style={{ marginTop: 18 }}
        disabled={!name.trim() || !(calories > 0)}
        onClick={() => onAdd({ id: `added-${Date.now()}`, name: name.trim(), foodName: name.trim(), grams: 0, portion: 'Added by you', calories, protein: grams(protein), carbs: grams(carbs), fat: grams(fat) })}
      >
        Add it
      </button>
    </Sheet>
  );
}
