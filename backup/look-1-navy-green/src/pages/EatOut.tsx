import { Suspense, lazy, useEffect, useState } from 'react';
import { ApiError, api } from '../lib/api';
import type { MealSlot } from '../lib/types';
import { Sheet } from '../components/Sheet';

// the scanner pulls in the whole decoder; only load it if the tab is opened
const BarcodeScanner = lazy(() =>
  import('../components/BarcodeScanner').then((module) => ({ default: module.BarcodeScanner })),
);

interface Recent {
  foodReferenceId: string;
  name: string;
  brand: string | null;
  quantity: number;
  unit: string;
  calories: number | null;
}

interface SearchHit {
  id: string;
  name: string;
  brand: string | null;
  caloriesPerUnit: number | null;
  defaultUnit: string;
}

const MEALS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/**
 * Log something you ate that never passed through your pantry — a meal out, a
 * coffee, a snack from the corner shop. Nothing is added to inventory, so
 * logging it leaves nothing to delete later.
 *
 * Three ways in: search the catalog, scan the packet, or type a name and the
 * calories off the label.
 */
export function EatOutSheet({
  onClose,
  onLogged,
}: {
  onClose: () => void;
  onLogged: (message: string) => void;
}) {
  const [mealSlot, setMealSlot] = useState<MealSlot>(() => {
    const hour = new Date().getHours();
    if (hour < 11) return 'breakfast';
    if (hour < 15) return 'lunch';
    if (hour < 21) return 'dinner';
    return 'snack';
  });
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<Recent[]>([]);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [manualCalories, setManualCalories] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsCalories, setNeedsCalories] = useState(false);
  const [mode, setMode] = useState<'search' | 'scan'>('search');

  useEffect(() => {
    api
      .get<{ recent: Recent[] }>('/api/consumption/eat-out/recent')
      .then((data) => setRecent(data.recent))
      .catch(() => setRecent([]));
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([]);
      return;
    }
    const timer = window.setTimeout(() => {
      api
        .get<{ results: SearchHit[] }>(`/api/consumption/eat-out/search?q=${encodeURIComponent(query)}`)
        .then((data) => setHits(data.results))
        .catch(() => setHits([]));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  async function log(payload: Record<string, unknown>, label: string) {
    setBusy(true);
    setError(null);
    try {
      const data = await api.post<{ entry: { calories: number | null } }>('/api/consumption/eat-out', {
        mealSlot,
        ...payload,
      });
      onLogged(
        data.entry.calories === null
          ? `Logged ${label}.`
          : `Logged ${label} — ${data.entry.calories} kcal.`,
      );
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'calories_required') {
        setNeedsCalories(true);
        setError(cause.message);
      } else {
        setError(cause instanceof ApiError ? cause.message : 'Could not log that.');
      }
      setBusy(false);
    }
  }

  /** Scanned something: look it up, then log it without touching the pantry. */
  async function logScanned(barcode: string) {
    setBusy(true);
    setError(null);
    try {
      const data = await api.get<{ food: { id: string; name: string; defaultUnit: string } }>(
        `/api/foods/barcode/${barcode}`,
      );
      await log({ foodReferenceId: data.food.id, quantity: 1 }, data.food.name);
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? `${cause.message} Try searching for it, or add it with the calories.`
          : 'Could not look that up. Try searching instead.',
      );
      setBusy(false);
    }
  }

  return (
    <Sheet title="Add food" onClose={onClose}>
      <p className="muted">This only affects your calories — nothing goes into your pantry.</p>

      <div className="segmented">
        {MEALS.map((meal) => (
          <button
            key={meal}
            type="button"
            className={mealSlot === meal ? 'active' : ''}
            onClick={() => setMealSlot(meal)}
          >
            {meal[0]!.toUpperCase() + meal.slice(1)}
          </button>
        ))}
      </div>

      {error ? <div className="banner error">{error}</div> : null}

      <div className="segmented">
        <button type="button" className={mode === 'search' ? 'active' : ''} onClick={() => setMode('search')}>
          Search
        </button>
        <button type="button" className={mode === 'scan' ? 'active' : ''} onClick={() => setMode('scan')}>
          Scan a barcode
        </button>
      </div>

      {mode === 'scan' ? (
        <Suspense fallback={<p className="muted">Loading the scanner…</p>}>
          <BarcodeScanner onDetected={logScanned} />
        </Suspense>
      ) : null}

      <div className="field" style={{ display: mode === 'search' ? undefined : 'none' }}>
        <label htmlFor="eatout">What did you eat?</label>
        <input
          id="eatout"
          value={query}
          placeholder="Costco hot dog, burrito, latte…"
          onChange={(event) => {
            setQuery(event.target.value);
            setNeedsCalories(false);
          }}
        />
      </div>

      {mode === 'search' && hits.length > 0 ? (
        <div className="suggestions">
          {hits.map((hit) => (
            <button
              key={hit.id}
              type="button"
              disabled={busy}
              onClick={() => log({ foodReferenceId: hit.id, quantity: 1 }, hit.name)}
            >
              {hit.name}
              <span className="muted">
                {hit.brand ? ` · ${hit.brand}` : ''}
                {hit.caloriesPerUnit === null ? '' : ` · ${Math.round(hit.caloriesPerUnit)} kcal/${hit.defaultUnit}`}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {mode === 'search' && query.trim().length >= 2 ? (
        <div className="card tight" style={{ marginTop: 12 }}>
          <p className="muted" style={{ marginBottom: 8 }}>
            {needsCalories
              ? `We don't know "${query}". Add the calories and we'll remember it.`
              : 'Not in the list? Add it with the calories on the receipt or menu.'}
          </p>
          <div className="row" style={{ gap: 8 }}>
            <input
              inputMode="numeric"
              placeholder="kcal"
              value={manualCalories}
              onChange={(event) => setManualCalories(event.target.value)}
            />
            <button
              type="button"
              disabled={busy || !Number(manualCalories)}
              onClick={() => log({ name: query.trim(), calories: Number(manualCalories) }, query.trim())}
            >
              Log it
            </button>
          </div>
        </div>
      ) : null}

      {mode === 'search' && recent.length > 0 ? (
        <>
          <h3 style={{ marginTop: 18 }}>Again</h3>
          <ul className="list">
            {recent.map((item) => (
              <li key={item.foodReferenceId} className="row">
                <div className="grow">
                  <div className="truncate">{item.name}</div>
                  <div className="muted">{item.calories === null ? 'no data' : `${item.calories} kcal`}</div>
                </div>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  disabled={busy}
                  onClick={() => log({ foodReferenceId: item.foodReferenceId, quantity: item.quantity }, item.name)}
                >
                  Log
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Sheet>
  );
}
