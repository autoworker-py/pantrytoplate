import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { rememberFoods } from '../lib/receiptMemory';
import { canReadReceipts } from '../lib/receiptText';
import type { ExternalHit, Food, StorageLocation } from '../lib/types';
import { dateInputToISO, formatDateInput } from '../lib/format';
import { CountsAs } from '../components/CountsAs';
import { PackSize, usePack, type Pack } from '../components/PackSize';
import { UnitSelect } from '../components/UnitSelect';
import { FoodThumb } from '../fridge/Fridge';
import { Icon } from '../ui/Icon';
import { BackButton, Page, Sheet, errorText, useToast } from '../ui/kit';
import { ReceiptFlow } from './receipt/ReceiptFlow';

// the decoder is heavy; only load it when someone scans
const BarcodeScanner = lazy(() => import('../components/BarcodeScanner').then((m) => ({ default: m.BarcodeScanner })));

export const CATEGORIES = [
  'Produce', 'Fruit', 'Herbs', 'Dairy & Eggs', 'Cheese', 'Meat & Seafood', 'Bakery', 'Frozen', 'Grains', 'Pasta',
  'Legumes', 'Baking', 'Canned Goods', 'Condiments', 'Sauces', 'Oils & Vinegars', 'Spices', 'Nuts & Seeds', 'Snacks', 'Beverages',
] as const;

/** where a thing usually lives, so the question is a confirmation rather than a chore */
export function homeFor(category: string | null | undefined): StorageLocation {
  if (!category) return 'pantry';
  if (category === 'Frozen') return 'freezer';
  if (['Dairy & Eggs', 'Cheese', 'Meat & Seafood', 'Produce', 'Herbs'].includes(category)) return 'fridge';
  return 'pantry';
}

const WHERE: Array<{ key: StorageLocation; label: string }> = [
  { key: 'fridge', label: 'Fridge' },
  { key: 'pantry', label: 'Cupboard' },
  { key: 'freezer', label: 'Freezer' },
];

type Picked = { food: Food; packageGrams?: number | null };

export default function AddFood() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'type' | 'scan' | 'receipt'>('type');
  const [picked, setPicked] = useState<Picked | null>(null);
  const [creating, setCreating] = useState<{ name: string; barcode?: string } | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const [resetKey, setResetKey] = useState(0);

  const tabs = (
    <div className="seg" role="tablist" style={{ marginBottom: 14 }}>
      <button type="button" role="tab" aria-selected={mode === 'type'} className={mode === 'type' ? 'on' : ''} onClick={() => setMode('type')}>Type it</button>
      <button type="button" role="tab" aria-selected={mode === 'scan'} className={mode === 'scan' ? 'on' : ''} onClick={() => setMode('scan')}>Scan it</button>
      {/* receipts are read with Apple's text recognition: the iPhone app, or a sample shop in development */}
      {canReadReceipts || import.meta.env.DEV ? (
        <button type="button" role="tab" aria-selected={mode === 'receipt'} className={mode === 'receipt' ? 'on' : ''} onClick={() => setMode('receipt')}>Receipt</button>
      ) : null}
    </div>
  );

  if (mode === 'receipt') {
    return (
      <ReceiptFlow
        tabs={tabs}
        back={<BackButton fallback="/pantry" />}
        homeFor={homeFor}
        finder={(how, found, unknown) =>
          how === 'scan' ? (
            <ScanFlow onPick={(p) => found(p.food)} onUnknown={(barcode) => unknown('', barcode)} />
          ) : (
            <TypeFlow onPick={(p) => found(p.food)} onCreate={(name) => unknown(name)} />
          )
        }
        newFood={(name, barcode, created, close) => <NewFoodSheet initialName={name} barcode={barcode} onClose={close} onCreated={(food) => created(food)} />}
      />
    );
  }

  return (
    <Page left={<BackButton fallback="/pantry" />} title="Put food away" right={added.length ? <button type="button" className="pill-btn" onClick={() => navigate('/pantry')}>Done</button> : null}>
      {tabs}

      {mode === 'type' ? (
        <TypeFlow key={resetKey} onPick={setPicked} onCreate={(name) => setCreating({ name })} />
      ) : (
        <ScanFlow onPick={setPicked} onUnknown={(barcode) => setCreating({ name: '', barcode })} />
      )}

      {added.length ? (
        <div className="put-away">
          <span className="fine">Put away this time</span>
          <p>{added.join(', ')}</p>
        </div>
      ) : null}

      {creating ? (
        <NewFoodSheet
          initialName={creating.name}
          barcode={creating.barcode}
          onClose={() => setCreating(null)}
          onCreated={(food, packageGrams) => { setCreating(null); setPicked({ food, packageGrams }); }}
        />
      ) : null}

      {picked ? (
        <DetailsSheet
          picked={picked}
          onClose={() => setPicked(null)}
          onAdded={(name) => {
            setPicked(null);
            setAdded((a) => [...a, name]);
            setResetKey((k) => k + 1);
          }}
        />
      ) : null}
    </Page>
  );
}

/* ---------- typing ---------- */

function TypeFlow({ onPick, onCreate }: { onPick: (p: Picked) => void; onCreate: (name: string) => void }) {
  const [q, setQ] = useState('');
  const [local, setLocal] = useState<Food[]>([]);
  const [external, setExternal] = useState<ExternalHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const term = q.trim();

  useEffect(() => {
    if (term.length < 2) { setLocal([]); setExternal([]); return; }
    let live = true;
    const t = window.setTimeout(() => {
      api.get<{ foods: Food[] }>(`/api/foods/search?q=${encodeURIComponent(term)}&limit=12`).then((d) => live && setLocal(d.foods.slice(0, 8))).catch(() => live && setLocal([]));
      // the wider database too, always: a few local matches are not proof we found it
      if (term.length >= 3) {
        setSearching(true);
        api.get<{ results: ExternalHit[] }>(`/api/foods/search/external?q=${encodeURIComponent(term)}&limit=8`)
          .then((d) => live && setExternal(d.results ?? []))
          .catch(() => live && setExternal([]))
          .finally(() => live && setSearching(false));
      }
    }, 240);
    return () => { live = false; window.clearTimeout(t); };
  }, [term]);

  async function pickExternal(hit: ExternalHit) {
    setResolving(hit.code);
    setError(null);
    try {
      const found = await api.get<{ food: Food; packageGrams?: number | null }>(`/api/foods/barcode/${encodeURIComponent(hit.code)}`);
      onPick({ food: found.food, packageGrams: found.packageGrams });
    } catch (cause) {
      setError(errorText(cause, 'Could not add that product. Try again, or add it by name.'));
    } finally {
      setResolving(null);
    }
  }

  const exact = local.some((f) => f.name.toLowerCase() === term.toLowerCase());

  return (
    <>
      <div className="search">
        <Icon name="search" size={19} />
        <input className="input big-input" autoFocus value={q} placeholder="What did you buy?" onChange={(e) => setQ(e.target.value)} aria-label="What did you buy?" autoComplete="off" />
      </div>
      {error ? <div className="banner error" style={{ marginTop: 12 }}>{error}</div> : null}

      {term.length < 2 ? (
        <p className="fine" style={{ marginTop: 14 }}>Type a food, or switch to Scan it and point the camera at a barcode. You only ever add something once.</p>
      ) : (
        <div className="list results">
          {local.map((f) => (
            <button key={f.id} type="button" className="list-row" onClick={() => onPick({ food: f })}>
              <span className="thumb"><FoodThumb name={f.name} category={f.category} unit={f.defaultUnit} size={34} /></span>
              <span className="grow">
                <span className="t">{f.name}</span>
                <span className="s">{[f.brand, f.category].filter(Boolean).join(' · ') || 'Your food'}</span>
              </span>
              <Icon name="plus" size={18} className="faint" />
            </button>
          ))}
          {!exact ? (
            <button type="button" className="list-row new-food" onClick={() => onCreate(term)}>
              <span className="thumb"><FoodThumb name={term} category={null} size={34} /></span>
              <span className="grow">
                <span className="t">Add “{term}” as a new food</span>
                <span className="s">For something the app does not know yet. It stays private to you.</span>
              </span>
              <Icon name="chevron" size={18} className="faint" />
            </button>
          ) : null}
          {external.length ? <div className="list-label">From the product database</div> : null}
          {external.map((hit) => (
            <button key={hit.code} type="button" className="list-row" onClick={() => void pickExternal(hit)} disabled={resolving !== null}>
              <span className="thumb"><FoodThumb name={hit.name} category={null} size={34} /></span>
              <span className="grow">
                <span className="t">{hit.name}</span>
                <span className="s">{[hit.brand, hit.quantity, hit.caloriesPer100g !== null ? `${Math.round(hit.caloriesPer100g)} kcal per 100 g` : null].filter(Boolean).join(' · ')}</span>
              </span>
              {resolving === hit.code ? <span className="fine">Adding…</span> : <Icon name="plus" size={18} className="faint" />}
            </button>
          ))}
          {searching && !external.length ? <p className="fine" style={{ padding: '14px 0' }}>Searching the product database…</p> : null}
        </div>
      )}
    </>
  );
}

/* ---------- scanning ---------- */

function ScanFlow({ onPick, onUnknown }: { onPick: (p: Picked) => void; onUnknown: (barcode: string) => void }) {
  const [seen, setSeen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function lookup(barcode: string) {
    setBusy(true);
    setError(null);
    setMissing(null);
    try {
      const d = await api.get<{ food: Food; packageGrams: number | null }>(`/api/foods/barcode/${barcode}`);
      setSeen((s) => [...s, barcode]);
      onPick({ food: d.food, packageGrams: d.packageGrams });
    } catch (cause) {
      const status = (cause as { status?: number }).status;
      if (status === 404) setMissing(barcode);
      else setError(errorText(cause, 'Lookup failed. You can still type the name.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="scan">
      {missing ? (
        <div className="banner warm" style={{ marginBottom: 12 }}>
          <strong>No product has barcode {missing} yet.</strong> Describe it once and every later scan finds it instantly.
          <div style={{ marginTop: 10 }}><button type="button" className="btn small" onClick={() => onUnknown(missing)}>Describe it</button></div>
        </div>
      ) : null}
      {error ? <div className="banner error" style={{ marginBottom: 12 }}>{error}</div> : null}
      {busy ? <p className="fine" style={{ marginBottom: 8 }}>Looking it up…</p> : null}
      <Suspense fallback={<div className="skeleton" style={{ aspectRatio: '4 / 3' }} />}>
        <BarcodeScanner onDetected={lookup} seen={seen} />
      </Suspense>
      <p className="fine" style={{ marginTop: 10 }}>Each barcode is read once. Keep scanning and confirm each thing as it comes up.</p>
    </div>
  );
}

/* ---------- a food the app does not know ---------- */

function NewFoodSheet({ initialName, barcode, onClose, onCreated }: { initialName: string; barcode?: string; onClose: () => void; onCreated: (food: Food, packageGrams?: number | null) => void }) {
  const [name, setName] = useState(initialName);
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [kcal, setKcal] = useState('');
  const [packG, setPackG] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const countable = category === 'Produce' || category === 'Fruit' || category === 'Bakery';
  const defaultUnit = barcode ? 'g' : countable ? 'count' : 'g';

  async function save() {
    setBusy(true);
    setError(null);
    const per100 = Number(kcal);
    const body = {
      name: name.trim(),
      category,
      defaultUnit,
      caloriesPerUnit: per100 > 0 ? (defaultUnit === 'g' ? per100 / 100 : per100) : null,
    };
    try {
      if (barcode) {
        const d = await api.post<{ food: Food }>(`/api/foods/barcode/${barcode}`, { ...body, brand: brand.trim() || null, packageGrams: Number(packG) > 0 ? Number(packG) : null });
        onCreated(d.food, Number(packG) > 0 ? Number(packG) : null);
      } else {
        const d = await api.post<{ food: Food; created: boolean }>('/api/foods', body);
        onCreated(d.food);
      }
    } catch (cause) {
      setError(errorText(cause, 'Could not save that food.'));
      setBusy(false);
    }
  }

  return (
    <Sheet title={barcode ? 'Describe this product' : 'A new food'} sub={barcode ? `Barcode ${barcode}. Once described, every later scan finds it.` : 'It stays private to you. Pick what kind of food it is so it looks right on your shelf.'} onClose={onClose} wide>
      {error ? <div className="banner error" style={{ marginTop: 10 }}>{error}</div> : null}
      <div className="new-preview">
        <FoodThumb name={name || 'food'} category={category} unit={defaultUnit} size={84} />
        <span className="fine">{category ? 'How it will look on the shelf' : 'Pick a kind to see it'}</span>
      </div>
      <div className="field">
        <label htmlFor="nf-name">Name</label>
        <input id="nf-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Gochujang, oat cream, Mum’s soup…" />
      </div>
      {barcode ? (
        <div className="field">
          <label htmlFor="nf-brand">Brand (optional)</label>
          <input id="nf-brand" value={brand} onChange={(e) => setBrand(e.target.value)} />
        </div>
      ) : null}
      <div className="label" style={{ marginTop: 18 }}>What kind of food?</div>
      <div className="kinds">
        {CATEGORIES.map((c) => (
          <button key={c} type="button" className={`kind${category === c ? ' on' : ''}`} onClick={() => setCategory(c)} aria-pressed={category === c}>
            <FoodThumb name={name && category === c ? name : c} category={c} size={30} />
            <span>{c}</span>
          </button>
        ))}
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="nf-kcal">{defaultUnit === 'g' ? 'Calories per 100 g' : 'Calories each'} (optional)</label>
          <input id="nf-kcal" type="number" inputMode="decimal" min={0} value={kcal} onChange={(e) => setKcal(e.target.value)} placeholder="From the label" />
        </div>
        {barcode ? (
          <div className="field">
            <label htmlFor="nf-pack">One pack weighs (g)</label>
            <input id="nf-pack" type="number" inputMode="decimal" min={0} value={packG} onChange={(e) => setPackG(e.target.value)} placeholder="e.g. 400" />
          </div>
        ) : null}
      </div>
      <p className="fine" style={{ marginTop: 8 }}>Without calories it still counts in your pantry and recipes; it just adds nothing to your diary.</p>
      <button type="button" className="btn block" style={{ marginTop: 18 }} onClick={save} disabled={busy || name.trim().length < 2 || !category}>
        {busy ? 'Saving…' : 'Save and continue'}
      </button>
    </Sheet>
  );
}

/* ---------- how much, and where ---------- */

function DetailsSheet({ picked, onClose, onAdded }: { picked: Picked; onClose: () => void; onAdded: (name: string) => void }) {
  const toast = useToast();
  const { user } = useAuth();
  const [food, setFood] = useState(picked.food);
  const whole = (picked.packageGrams ?? 0) > 0;
  const [quantity, setQuantity] = useState(whole ? picked.packageGrams! : 1);
  const [unit, setUnit] = useState(whole ? 'g' : food.defaultUnit);
  const [where, setWhere] = useState<StorageLocation>(homeFor(food.category));
  const [expiry, setExpiry] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loaded = usePack(food.id);
  const [pack, setPack] = useState<Pack | null>(null);
  useEffect(() => setPack(loaded), [loaded]);
  const sub = useMemo(() => [food.brand, food.caloriesPerUnit !== null ? `${Math.round(food.caloriesPerUnit * (food.defaultUnit === 'g' ? 100 : 1))} kcal per ${food.defaultUnit === 'g' ? '100 g' : food.defaultUnit}` : 'No nutrition data'].filter(Boolean).join(' · '), [food]);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      // a pack size someone adjusted is worth remembering for next time
      if (whole && unit === 'g' && quantity > 0 && quantity !== picked.packageGrams) {
        await api.post(`/api/foods/${food.id}/conversions`, { fromUnit: 'package', toUnit: 'g', multiplier: Math.round(quantity) }).catch(() => undefined);
      }
      await api.post('/api/inventory', { foodReferenceId: food.id, quantity, unit, storageLocation: where, expirationDate: expiry ? dateInputToISO(expiry) : null });
      toast(`${food.name} is in the ${where === 'pantry' ? 'cupboard' : where}.`);
      if (user) void rememberFoods(user.id, [{ id: food.id, name: food.name, category: food.category, quantity, unit, where }]);
      onAdded(food.name);
    } catch (cause) {
      setError(errorText(cause, 'Could not add that.'));
      setBusy(false);
    }
  }

  return (
    <Sheet title={food.name} sub={sub} onClose={onClose}>
      <div className="item-hero">
        <FoodThumb name={food.name} category={food.category} quantity={quantity} unit={unit} size={84} />
        <div className="facts">
          <span className="fine">{food.category ?? 'Uncategorised'}</span>
          {food.barcode ? <span className="fine">Scanned product</span> : null}
        </div>
      </div>
      {error ? <div className="banner error" style={{ marginTop: 12 }}>{error}</div> : null}

      {food.barcode ? (
        <div style={{ marginTop: 14 }}>
          <CountsAs food={food} autoOpen onChanged={(next) => setFood((f) => ({ ...f, countsAs: next ? { ...next, source: 'user' } : null }))} />
        </div>
      ) : null}

      <PackSize pack={pack} quantity={quantity} unit={unit} onPick={(q, u) => { setQuantity(q); setUnit(u); }} onSaved={(g) => setPack((p) => (p ? { ...p, grams: g, estimated: false, known: true } : p))} />

      <div className="field-row">
        <div className="field">
          <label htmlFor="d-qty">How much</label>
          <input id="d-qty" type="number" inputMode="decimal" min={0} step="any" value={Number.isFinite(quantity) ? quantity : ''} onChange={(e) => setQuantity(Number(e.target.value))} />
        </div>
        <div className="field">
          <label htmlFor="d-unit">Unit</label>
          <UnitSelect id="d-unit" value={unit} onChange={setUnit} suggested={food.defaultUnit} />
        </div>
      </div>

      <div className="label" style={{ marginTop: 18 }}>Where does it go?</div>
      <div className="chips" style={{ marginTop: 8 }}>
        {WHERE.map((w) => (
          <button key={w.key} type="button" className={`chip${where === w.key ? ' on' : ''}`} onClick={() => setWhere(w.key)}>{w.label}</button>
        ))}
      </div>

      <div className="field">
        <label htmlFor="d-exp">Use by (optional)</label>
        <input id="d-exp" type="date" min={formatDateInput(new Date())} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        <span className="hint">Leave it blank and the app estimates it from how long this usually keeps.</span>
      </div>

      <button type="button" className="btn block" style={{ marginTop: 22 }} onClick={add} disabled={busy || !(quantity > 0)}>
        {busy ? 'Putting it away…' : `Put it in the ${where === 'pantry' ? 'cupboard' : where}`}
      </button>
    </Sheet>
  );
}
