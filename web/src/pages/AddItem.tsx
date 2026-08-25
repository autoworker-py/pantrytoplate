import { Suspense, lazy, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, api } from '../lib/api';
import type { Food } from '../lib/types';
import { formatDateInput } from '../lib/format';
import { useToast } from '../components/Toast';
import { UnitSelect } from '../components/UnitSelect';
import { Sheet } from '../components/Sheet';
import { PackSize, usePack, type Pack } from '../components/PackSize';

// the scanner pulls in the whole decoder; only load it on the scan tab
const BarcodeScanner = lazy(() =>
  import('../components/BarcodeScanner').then((module) => ({ default: module.BarcodeScanner })),
);

type Mode = 'manual' | 'scan';

export default function AddItem() {
  const [mode, setMode] = useState<Mode>('manual');

  return (
    <>
      <h1>Add to pantry</h1>
      <div className="segmented">
        <button type="button" className={mode === 'manual' ? 'active' : ''} onClick={() => setMode('manual')}>
          Type it
        </button>
        <button type="button" className={mode === 'scan' ? 'active' : ''} onClick={() => setMode('scan')}>
          Scan a barcode
        </button>
      </div>
      {mode === 'manual' ? <ManualForm /> : <ScanForm />}
    </>
  );
}

/**
 * How much, in what unit, and — behind a toggle — the details most people skip.
 *
 * Expiry, storage and serving size all matter, but showing five fields at once
 * turns "add the shopping" into paperwork. The two that always matter are up
 * front; the rest are one tap away.
 */
function QuantityFields({
  quantity,
  unit,
  expiration,
  suggestedUnit,
  onQuantity,
  onUnit,
  onExpiration,
  extra,
}: {
  quantity: number;
  unit: string;
  expiration: string;
  suggestedUnit?: string;
  onQuantity: (value: number) => void;
  onUnit: (value: string) => void;
  onExpiration: (value: string) => void;
  /** anything else that belongs behind the More toggle */
  extra?: React.ReactNode;
}) {
  const [showMore, setShowMore] = useState(false);

  return (
    <>
      <div className="field-row">
        <div className="field">
          <label htmlFor="quantity">Quantity</label>
          <input
            id="quantity"
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            value={quantity}
            onChange={(event) => onQuantity(Number(event.target.value))}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="unit">Unit</label>
          <UnitSelect id="unit" value={unit} onChange={onUnit} suggested={suggestedUnit} />
        </div>
      </div>

      <button type="button" className="more-toggle" onClick={() => setShowMore((open) => !open)}>
        {showMore ? '− Less' : '+ More'}
        <span className="muted"> — expiry date{extra ? ' and more' : ''}</span>
      </button>

      {showMore ? (
        <div className="more-panel">
          <div className="field">
            <label htmlFor="expiration">Expires</label>
            <input
              id="expiration"
              type="date"
              min={formatDateInput(new Date())}
              value={expiration}
              onChange={(event) => onExpiration(event.target.value)}
            />
            <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
              Leave blank and we will estimate it from how long this food usually keeps.
            </p>
          </div>
          {extra}
        </div>
      ) : null}
    </>
  );
}

function ManualForm() {
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = useState('');
  const [suggestions, setSuggestions] = useState<Food[]>([]);
  const [linked, setLinked] = useState<Food | null>(null);
  // asked once per food, the first time it is added
  const loadedPack = usePack(linked?.id);
  const [pack, setPack] = useState<Pack | null>(null);
  useEffect(() => setPack(loadedPack), [loadedPack]);
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState('count');
  const [category, setCategory] = useState('');
  const [expiration, setExpiration] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Autocomplete against the local catalog: matching an existing entry is what
  // keeps "eggs" from becoming four different foods.
  useEffect(() => {
    if (linked || name.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = window.setTimeout(() => {
      api
        .get<{ foods: Food[] }>(`/api/foods/search?q=${encodeURIComponent(name)}`)
        .then((data) => setSuggestions(data.foods.slice(0, 5)))
        .catch(() => setSuggestions([]));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [name, linked]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/inventory', {
        ...(linked ? { foodReferenceId: linked.id } : { name }),
        quantity,
        unit,
        category: category || null,
        expirationDate: expiration || null,
      });
      toast(`Added ${name || linked?.name} to your pantry.`);
      navigate('/inventory');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not add that item.');
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      {error ? <div className="banner error">{error}</div> : null}

      <div className="field">
        <label htmlFor="name">What is it?</label>
        <input
          id="name"
          value={linked ? linked.name : name}
          placeholder="Eggs, flour, chicken breast…"
          onChange={(event) => {
            setLinked(null);
            setName(event.target.value);
          }}
          required
        />
        {linked ? (
          <p className="muted" style={{ marginTop: 6 }}>
            Linked to <strong>{linked.name}</strong> in your catalog
            {linked.caloriesPerUnit !== null ? ` · ${linked.caloriesPerUnit} kcal per ${linked.defaultUnit}` : ' · no nutrition data'}
            .{' '}
            <button type="button" className="btn-ghost btn-sm" onClick={() => setLinked(null)}>
              change
            </button>
          </p>
        ) : suggestions.length > 0 ? (
          <div className="suggestions">
            {suggestions.map((food) => (
              <button
                key={food.id}
                type="button"
                onClick={() => {
                  setLinked(food);
                  setName(food.name);
                  setUnit(food.defaultUnit === 'g' ? 'g' : food.defaultUnit);
                }}
              >
                {food.name}
                {food.brand ? <span className="muted"> · {food.brand}</span> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <PackSize
        pack={pack}
        quantity={quantity}
        unit={unit}
        onPick={(nextQuantity, nextUnit) => {
          setQuantity(nextQuantity);
          setUnit(nextUnit);
        }}
        onSaved={(grams) =>
          setPack((current) => (current ? { ...current, grams, estimated: false, known: true } : current))
        }
      />

      <QuantityFields
        quantity={quantity}
        unit={unit}
        expiration={expiration}
        suggestedUnit={linked?.defaultUnit}
        onQuantity={setQuantity}
        onUnit={setUnit}
        onExpiration={setExpiration}
        extra={
          !linked ? (
            <div className="field">
              <label htmlFor="category">Category</label>
              <input
                id="category"
                list="category-options"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder="Produce, Dairy & Eggs, Grains…"
              />
              <datalist id="category-options">
                {[
                  'Produce',
                  'Fruit',
                  'Dairy & Eggs',
                  'Cheese',
                  'Meat & Seafood',
                  'Grains',
                  'Pasta',
                  'Bakery',
                  'Baking',
                  'Canned Goods',
                  'Snacks',
                  'Spices',
                  'Herbs',
                  'Condiments',
                  'Oils & Vinegars',
                ].map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
              <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
                Helps us guess how long it keeps.
              </p>
            </div>
          ) : null
        }
      />

      <button type="submit" className="btn-block" disabled={busy || !(quantity > 0)}>
        Add to pantry
      </button>
    </form>
  );
}

interface Scanned {
  food: Food;
  cached: boolean;
  packageGrams: number | null;
  packageEstimated: boolean;
}

/**
 * Scan flow, one item at a time.
 *
 * The camera stays live and each scan opens a short confirmation for that
 * product alone — quantity, unit, and the details behind More. Saving drops you
 * straight back to the camera with the barcode remembered, so a bag of shopping
 * goes in as a rhythm rather than a form to fill in at the end.
 */
function ScanForm() {
  const navigate = useNavigate();
  const toast = useToast();
  const [pending, setPending] = useState<Scanned | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const [seen, setSeen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function lookup(barcode: string) {
    setError(null);
    setBusy(true);
    try {
      const data = await api.get<{
        food: Food;
        cached: boolean;
        packageGrams: number | null;
        packageEstimated: boolean;
      }>(`/api/foods/barcode/${barcode}`);

      setSeen((current) => [...current, barcode]);
      setPending({
        food: data.food,
        cached: data.cached,
        packageGrams: data.packageGrams ?? null,
        packageEstimated: data.packageEstimated ?? false,
      });
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? `${cause.message} You can still add it by typing the name.`
          : 'Lookup failed. You can still add it by typing the name.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="card">
        {error ? <div className="banner error">{error}</div> : null}
        {busy ? <p className="muted">Looking it up…</p> : null}

        <Suspense fallback={<p className="muted">Loading the scanner…</p>}>
          <BarcodeScanner onDetected={lookup} seen={seen} />
        </Suspense>

        <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
          Each barcode is only read once — keep scanning and confirm each item as it pops up.
        </p>
      </div>

      {added.length > 0 ? (
        <div className="card tight">
          <div className="row">
            <div className="grow">
              <strong>
                {added.length} item{added.length === 1 ? '' : 's'} added
              </strong>
              <div className="muted truncate">{added.join(', ')}</div>
            </div>
            <button type="button" className="btn-sm" onClick={() => navigate('/inventory')}>
              Done
            </button>
          </div>
        </div>
      ) : null}

      {pending ? (
        <ConfirmScanned
          scanned={pending}
          onCancel={() => setPending(null)}
          onAdded={(name) => {
            setAdded((current) => [...current, name]);
            setPending(null);
            toast(`${name} added — keep scanning.`);
          }}
        />
      ) : null}
    </>
  );
}

/** One scanned product, confirmed on its own. */
function ConfirmScanned({
  scanned,
  onCancel,
  onAdded,
}: {
  scanned: Scanned;
  onCancel: () => void;
  onAdded: (name: string) => void;
}) {
  // a whole pack is what people actually put away, so default to it
  const wholePack = (scanned.packageGrams ?? 0) > 0;
  const [quantity, setQuantity] = useState(wholePack ? scanned.packageGrams! : 1);
  const [unit, setUnit] = useState(wholePack ? 'g' : scanned.food.defaultUnit);
  const [expiration, setExpiration] = useState('');
  const [perServing, setPerServing] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loaded = usePack(scanned.food.id);
  const [pack, setPack] = useState<Pack | null>(null);
  useEffect(() => setPack(loaded), [loaded]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      // a pack size the user adjusted is worth remembering for next time
      if (unit === 'g' && quantity > 0 && quantity !== scanned.packageGrams) {
        await api
          .post(`/api/foods/${scanned.food.id}/conversions`, {
            fromUnit: 'package',
            toUnit: 'g',
            multiplier: Math.round(quantity),
          })
          .catch(() => undefined);
      }

      const perServingValue = Number(perServing);
      if (perServingValue > 0 && scanned.food.defaultUnit === 'serving') {
        await api
          .post(`/api/foods/${scanned.food.id}/conversions`, {
            fromUnit: 'serving',
            toUnit: 'count',
            multiplier: perServingValue,
          })
          .catch(() => undefined);
      }

      await api.post('/api/inventory', {
        foodReferenceId: scanned.food.id,
        quantity,
        unit,
        expirationDate: expiration || null,
      });
      onAdded(scanned.food.name);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not add that item.');
      setBusy(false);
    }
  }

  return (
    <Sheet title={scanned.food.name} onClose={onCancel}>
      <p className="muted">
        {scanned.food.brand ?? 'Unbranded'}
        {scanned.food.caloriesPerUnit !== null
          ? ` · ${Math.round(scanned.food.caloriesPerUnit)} kcal per ${scanned.food.defaultUnit}`
          : ' · no nutrition data'}
      </p>

      {error ? <div className="banner error">{error}</div> : null}

      <PackSize
        pack={pack}
        quantity={quantity}
        unit={unit}
        onPick={(nextQuantity, nextUnit) => {
          setQuantity(nextQuantity);
          setUnit(nextUnit);
        }}
        onSaved={(grams) => setPack((current) => (current ? { ...current, grams, estimated: false, known: true } : current))}
      />

      <QuantityFields
        quantity={quantity}
        unit={unit}
        expiration={expiration}
        suggestedUnit={scanned.food.defaultUnit}
        onQuantity={setQuantity}
        onUnit={setUnit}
        onExpiration={setExpiration}
        extra={
          scanned.food.defaultUnit === 'serving' ? (
            <div className="field">
              <label htmlFor="per-serving">How many in one serving?</label>
              <input
                id="per-serving"
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                placeholder="e.g. 2 pastries"
                value={perServing}
                onChange={(event) => setPerServing(event.target.value)}
              />
              <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
                Its calories are listed per serving. Tell us once and we can count them however you stock it.
              </p>
            </div>
          ) : null
        }
      />

      <button type="button" className="btn-block" onClick={save} disabled={busy || !(quantity > 0)}>
        {busy ? 'Adding…' : 'Add and keep scanning'}
      </button>
      <button type="button" className="btn-ghost btn-block" onClick={onCancel} disabled={busy}>
        Skip this one
      </button>
    </Sheet>
  );
}
