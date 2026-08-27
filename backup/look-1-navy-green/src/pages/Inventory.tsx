import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../lib/api';
import type { Food, InventoryItem, MealSlot, RecipesForFood, RemovalReason } from '../lib/types';
import { expiryLabel, formatAmount } from '../lib/format';
import { ExpiryPill } from '../components/StatusPill';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';

type Sort = 'expiration' | 'category' | 'name' | 'recent';

export default function Inventory() {
  const [items, setItems] = useState<InventoryItem[] | null>(null);
  const [sort, setSort] = useState<Sort>('expiration');
  const [search, setSearch] = useState('');
  const [active, setActive] = useState<InventoryItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async (nextSort: Sort) => {
    try {
      const data = await api.get<{ items: InventoryItem[] }>(`/api/inventory?sort=${nextSort}`);
      setItems(data.items);
    } catch {
      setError('Could not load your pantry.');
    }
  }, []);

  useEffect(() => {
    void load(sort);
  }, [load, sort]);

  const visible = useMemo(() => {
    if (!items) return [];
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) => item.food.name.toLowerCase().includes(term));
  }, [items, search]);

  /** Group headers make the category sort actually useful in a store aisle. */
  const grouped = useMemo(() => {
    if (sort !== 'category') return null;
    const groups = new Map<string, InventoryItem[]>();
    for (const item of visible) {
      const key = item.food.category ?? 'Other';
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return [...groups.entries()];
  }, [visible, sort]);

  if (error) return <div className="banner error">{error}</div>;

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Pantry</h1>
        <Link className="btn btn-sm" to="/add">
          + Add
        </Link>
      </div>

      <div className="field">
        <input
          type="search"
          placeholder="Search your pantry"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <div className="segmented">
        {(['expiration', 'category', 'name', 'recent'] as const).map((option) => (
          <button
            key={option}
            type="button"
            className={sort === option ? 'active' : ''}
            onClick={() => setSort(option)}
          >
            {option === 'expiration' ? 'Expiry' : option === 'recent' ? 'Newest' : option[0]!.toUpperCase() + option.slice(1)}
          </button>
        ))}
      </div>

      {!items ? (
        <div className="empty">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="empty">
          <div className="big">🧺</div>
          <p>Nothing here yet.</p>
          <Link className="btn" to="/add">
            Add your first item
          </Link>
        </div>
      ) : grouped ? (
        grouped.map(([category, group]) => (
          <div key={category}>
            <h2 style={{ marginTop: 18 }}>{category}</h2>
            <div className="card">
              <ul className="list">
                {group.map((item) => (
                  <ItemRow key={item.id} item={item} onSelect={setActive} />
                ))}
              </ul>
            </div>
          </div>
        ))
      ) : (
        <div className="card">
          <ul className="list">
            {visible.map((item) => (
              <ItemRow key={item.id} item={item} onSelect={setActive} />
            ))}
          </ul>
        </div>
      )}

      {active ? (
        <ItemSheet
          item={active}
          onClose={() => setActive(null)}
          onDone={(message) => {
            setActive(null);
            toast(message);
            void load(sort);
          }}
          onCountsAsChanged={() => {
            setActive(null);
            void load(sort);
          }}
        />
      ) : null}
    </>
  );
}

function ItemRow({ item, onSelect }: { item: InventoryItem; onSelect: (item: InventoryItem) => void }) {
  return (
    <li>
      <button
        type="button"
        className="btn-ghost row"
        style={{ width: '100%', padding: 0, color: 'inherit' }}
        onClick={() => onSelect(item)}
      >
        <div className="grow stack" style={{ textAlign: 'left' }}>
          <div className="truncate">
            {item.isLeftover ? '🍲 ' : ''}
            {item.food.name}
            {item.food.brand ? <span className="muted"> · {item.food.brand}</span> : null}
          </div>
          <div className="muted">
            {formatAmount(item.quantity, item.unit)}
            {item.storageLocation !== 'pantry' ? ` · ${item.storageLocation}` : ''}
            {item.caloriesRemaining !== null ? ` · ${item.caloriesRemaining} kcal left` : ''}
          </div>
          {item.food.countsAs ? (
            <div className="reason-note">Counts as {item.food.countsAs.name}</div>
          ) : null}
          {item.isLowStock ? <div className="reason-note">Running low</div> : null}
        </div>
        <ExpiryPill status={item.expiryStatus} label={expiryLabel(item.daysUntilExpiration, item.expiryStatus)} />
      </button>
    </li>
  );
}

/**
 * Tap an item you already own. Three things can happen to food: you eat it
 * (calories), someone else deals with it (no calories), or it goes in the bin
 * (no calories, but it costs you money). They are deliberately separate.
 */
function ItemSheet({
  item,
  onClose,
  onDone,
  onCountsAsChanged,
}: {
  item: InventoryItem;
  onClose: () => void;
  onDone: (message: string) => void;
  onCountsAsChanged: () => void;
}) {
  const [mode, setMode] = useState<'ate' | 'gone'>('ate');
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState(item.unit);
  const [mealSlot, setMealSlot] = useState<MealSlot>(() => {
    const hour = new Date().getHours();
    if (hour < 11) return 'breakfast';
    if (hour < 15) return 'lunch';
    if (hour < 21) return 'dinner';
    return 'snack';
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fractions = [0.25, 0.5, 1, 2].filter((value) => value <= item.quantity || value <= 1);

  async function consume() {
    setBusy(true);
    setError(null);
    try {
      const data = await api.post<{
        result: { remaining: number; calories: number | null; lowStock: { added: boolean; name?: string } };
      }>(`/api/inventory/${item.id}/consume`, { quantity, unit, mealSlot });

      const { result } = data;
      const lowStockNote = result.lowStock.added ? ' Added to your shopping list.' : '';
      onDone(
        `Logged ${formatAmount(quantity, unit)} of ${item.food.name}` +
          `${result.calories === null ? '' : ` (${result.calories} kcal)`}. ` +
          `${formatAmount(result.remaining, item.unit)} left.${lowStockNote}`,
      );
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not log that.');
      setBusy(false);
    }
  }

  async function remove(reason: RemovalReason) {
    setBusy(true);
    setError(null);
    try {
      const data = await api.post<{
        result: {
          remaining: number;
          lowStock: { added: boolean };
        };
      }>(`/api/inventory/${item.id}/remove`, { reason, quantity, unit });

      const { result } = data;
      // no cash figure: prices move, and a wrong number is worse than none.
      // The waste log on the home tab is where this ends up instead.
      const wasteNote = reason === 'wasted' ? ' Logged as waste.' : '';
      const listNote = result.lowStock.added ? ' Added to your shopping list.' : '';
      onDone(
        `${formatAmount(quantity, unit)} of ${item.food.name} taken out. ` +
          `${formatAmount(result.remaining, item.unit)} left.${wasteNote}${listNote}`,
      );
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not update that.');
      setBusy(false);
    }
  }

  async function freeze() {
    setBusy(true);
    try {
      const data = await api.post<{ item: InventoryItem }>(`/api/inventory/${item.id}/freeze`);
      onDone(
        `${item.food.name} moved to the freezer — good for about ${data.item.daysUntilExpiration} more days.`,
      );
    } catch {
      setError('Could not freeze that.');
      setBusy(false);
    }
  }

  async function destroy() {
    setBusy(true);
    try {
      await api.delete(`/api/inventory/${item.id}`);
      onDone(`Removed ${item.food.name} from your pantry.`);
    } catch {
      setError('Could not remove that item.');
      setBusy(false);
    }
  }

  return (
    <Sheet title={item.food.name} onClose={onClose}>
      <p className="muted">
        You have {formatAmount(item.quantity, item.unit)}
        {item.expirationDate ? ` · ${expiryLabel(item.daysUntilExpiration, item.expiryStatus)}` : ''}
        {item.storageLocation !== 'pantry' ? ` · in the ${item.storageLocation}` : ''}
      </p>

      <CountsAs item={item} onChanged={onCountsAsChanged} />

      <UsedIn item={item} />

      {error ? <div className="banner error">{error}</div> : null}

      {/* about to go off, and freezing would save it */}
      {item.storageLocation !== 'freezer' &&
      item.daysUntilExpiration !== null &&
      item.daysUntilExpiration <= 2 &&
      item.daysUntilExpiration >= 0 ? (
        <div className="banner info">
          <strong>
            {item.daysUntilExpiration === 0 ? 'Goes off today.' : 'Goes off tomorrow.'}
          </strong>{' '}
          Freeze it and it keeps for months instead.
          <button
            type="button"
            className="btn-secondary btn-sm"
            style={{ marginTop: 8 }}
            onClick={freeze}
            disabled={busy}
          >
            🧊 Freeze it now
          </button>
        </div>
      ) : null}

      <div className="segmented">
        <button type="button" className={mode === 'ate' ? 'active' : ''} onClick={() => setMode('ate')}>
          I ate it
        </button>
        <button type="button" className={mode === 'gone' ? 'active' : ''} onClick={() => setMode('gone')}>
          It is gone
        </button>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="qty">How much</label>
          <input
            id="qty"
            type="number"
            min={0}
            step="any"
            value={quantity}
            onChange={(event) => setQuantity(Number(event.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="unit">Unit</label>
          <input id="unit" value={unit} onChange={(event) => setUnit(event.target.value)} />
        </div>
      </div>

      {/*
        * People estimate a jar fine and weigh it never. A slider over what is
        * actually in the item beats asking for grams.
        */}
      <div className="field">
        <input
          type="range"
          min={0}
          max={item.quantity}
          step={item.quantity / 20}
          value={Math.min(quantity, item.quantity)}
          onChange={(event) => {
            setQuantity(Number(event.target.value));
            setUnit(item.unit);
          }}
          aria-label="How much"
        />
        <div className="row">
          {[
            ['A quarter', 0.25],
            ['Half', 0.5],
            ['Most of it', 0.75],
            ['All of it', 1],
          ].map(([label, share]) => (
            <button
              key={label as string}
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => {
                setQuantity(
                  Math.round(item.quantity * (share as number) * 1000) / 1000,
                );
                setUnit(item.unit);
              }}
            >
              {label as string}
            </button>
          ))}
        </div>
      </div>

      <div className="btn-row" style={{ marginBottom: 12 }}>
        {fractions.map((amount) => (
          <button
            key={amount}
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => {
              setQuantity(amount);
              setUnit(item.unit);
            }}
          >
            {formatAmount(amount, item.unit)}
          </button>
        ))}
      </div>

      {mode === 'ate' ? (
        <>
          <label htmlFor="meal">Meal</label>
          <div className="segmented" id="meal">
            {(['breakfast', 'lunch', 'dinner', 'snack'] as MealSlot[]).map((meal) => (
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

          <button type="button" className="btn-block" onClick={consume} disabled={busy || !(quantity > 0)}>
            Log it
          </button>
        </>
      ) : (
        <>
          <p className="muted">
            None of these touch your calorie diary — you did not eat it.
          </p>
          <div className="btn-row">
            <button
              type="button"
              className="btn-secondary grow"
              onClick={() => remove('other_person')}
              disabled={busy}
            >
              Someone else ate it
            </button>
            <button type="button" className="btn-secondary grow" onClick={() => remove('used_up')} disabled={busy}>
              Used up
            </button>
          </div>
          <button
            type="button"
            className="btn-secondary btn-block"
            style={{ marginTop: 8 }}
            onClick={() => remove('wasted')}
            disabled={busy}
          >
            Threw it out
          </button>
        </>
      )}

      <button
        type="button"
        className="btn-ghost btn-block"
        style={{ marginTop: 6 }}
        onClick={async () => {
          setBusy(true);
          try {
            await api.patch(`/api/inventory/${item.id}`, { quantity, unit });
            onDone(`${item.food.name} corrected to ${formatAmount(quantity, unit)}.`);
          } catch (cause) {
            setError(cause instanceof ApiError ? cause.message : 'Could not update that.');
            setBusy(false);
          }
        }}
        disabled={busy || !(quantity > 0)}
      >
        Correct the amount to {formatAmount(quantity, unit)}
      </button>

      <div className="btn-row" style={{ marginTop: 14 }}>
        {item.storageLocation !== 'freezer' ? (
          <button type="button" className="btn-ghost btn-sm" onClick={freeze} disabled={busy}>
            🧊 Freeze it
          </button>
        ) : null}
        <button
          type="button"
          className="btn-ghost btn-sm"
          style={{ color: 'var(--red)' }}
          onClick={destroy}
          disabled={busy}
        >
          Delete item
        </button>
      </div>
    </Sheet>
  );
}

/**
 * "I have this — what can I make with it?"
 *
 * Two lists, deliberately separate. The first is dinner: recipes you have
 * everything for, right now, checked against real quantities rather than
 * whether the food is in the pantry at all. The second is everything else this
 * food is good for, so a jar you bought for one thing shows you the rest.
 */
function UsedIn({ item }: { item: InventoryItem }) {
  const [data, setData] = useState<RecipesForFood | null>(null);
  const [failed, setFailed] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .get<RecipesForFood>(`/api/recipes/for-food/${item.food.id}`)
      .then((result) => live && setData(result))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [item.food.id]);

  // a quiet failure here must not get in the way of logging what you ate
  if (failed) return null;
  if (!data) return <p className="muted">Looking for recipes…</p>;
  if (data.recipes.length === 0) {
    return <p className="muted">No recipes in the book use this yet.</p>;
  }

  const ready = data.recipes.filter((recipe) => recipe.canMakeNow);
  const others = data.recipes.filter((recipe) => !recipe.canMakeNow);
  const shown = showAll ? others : others.slice(0, 4);

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      {ready.length > 0 ? (
        <>
          <h3 style={{ margin: '0 0 6px' }}>
            You can make {ready.length === 1 ? 'this' : `${ready.length} of these`} now
          </h3>
          <ul className="list">
            {ready.map((recipe) => (
              <li key={recipe.id}>
                <Link to={`/recipes/${recipe.id}`} className="row" style={{ color: 'inherit', textDecoration: 'none' }}>
                  <div className="grow stack" style={{ textAlign: 'left' }}>
                    <div className="truncate">
                      {recipe.name}
                      {recipe.isMine ? <span className="pill mine" style={{ marginLeft: 6 }}>Yours</span> : null}
                    </div>
                    <div className="muted">
                      Uses {formatAmount(recipe.quantity, recipe.unit)}
                      {recipe.totalMinutes ? ` \u00b7 ${recipe.totalMinutes} min` : ''}
                    </div>
                  </div>
                  <span className="pill">Ready</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {others.length > 0 ? (
        <>
          <h3 style={{ margin: ready.length > 0 ? '14px 0 6px' : '0 0 6px' }}>
            {ready.length > 0 ? 'Also uses this' : 'Recipes that use this'}
          </h3>
          <ul className="list">
            {shown.map((recipe) => (
              <li key={recipe.id}>
                <Link to={`/recipes/${recipe.id}`} className="row" style={{ color: 'inherit', textDecoration: 'none' }}>
                  <div className="grow stack" style={{ textAlign: 'left' }}>
                    <div className="truncate">
                      {recipe.name}
                      {recipe.isMine ? <span className="pill mine" style={{ marginLeft: 6 }}>Yours</span> : null}
                    </div>
                    <div className="muted truncate">
                      Still need {recipe.missing.slice(0, 3).join(', ')}
                      {recipe.missing.length > 3 ? `, +${recipe.missing.length - 3}` : ''}
                    </div>
                  </div>
                  <span className={`pill ${recipe.gaps <= 2 ? 'warn' : 'danger'}`}>Need {recipe.gaps}</span>
                </Link>
              </li>
            ))}
          </ul>
          {!showAll && others.length > shown.length ? (
            <button type="button" className="btn-ghost btn-sm" onClick={() => setShowAll(true)}>
              Show {others.length - shown.length} more
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/**
 * What a branded product counts as.
 *
 * A scanned "ORGANIC EXTRA VIRGIN OLIVE OIL" has to be understood as olive oil,
 * or recipes will say you are missing something you own. The app guesses from
 * the name, but a guess can be wrong both ways — so it is always shown, and
 * always correctable.
 */
function CountsAs({ item, onChanged }: { item: InventoryItem; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<Food[]>([]);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  // only branded products need this; a generic catalog ingredient is itself.
  // Checked after the hooks, never before — bailing out early would change the
  // number of hooks between renders and crash on the next item opened.
  const isProduct = Boolean(item.food.barcode);

  useEffect(() => {
    if (!editing || query.trim().length < 2) {
      setOptions([]);
      return;
    }
    const timer = window.setTimeout(() => {
      api
        .get<{ foods: Food[] }>(`/api/foods/search?q=${encodeURIComponent(query)}`)
        .then((data) => setOptions(data.foods.filter((food) => !food.barcode).slice(0, 6)))
        .catch(() => setOptions([]));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [editing, query]);

  async function save(canonicalId: string | null, label: string) {
    setBusy(true);
    try {
      await api.put(`/api/foods/${item.food.id}/counts-as`, { canonicalId });
      toast(label);
      onChanged();
    } catch {
      toast('Could not update that.');
      setBusy(false);
    }
  }

  if (!isProduct) return null;

  if (!editing) {
    return (
      <div className="counts-as">
        <div className="row">
          <div className="grow">
            {item.food.countsAs ? (
              <>
                <strong>Counts as {item.food.countsAs.name}</strong>
                <div className="muted">
                  {item.food.countsAs.source === 'user'
                    ? 'You set this.'
                    : 'We worked this out from the name — recipes asking for it will use this.'}
                </div>
              </>
            ) : (
              <>
                <strong>Not linked to an ingredient</strong>
                <div className="muted">
                  Recipes will not count this towards anything until you say what it is.
                </div>
              </>
            )}
          </div>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(true)}>
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="counts-as">
      <label htmlFor="counts-as-search">This is really…</label>
      <input
        id="counts-as-search"
        value={query}
        placeholder="Olive oil, butter, cheddar…"
        onChange={(event) => setQuery(event.target.value)}
      />

      {options.length > 0 ? (
        <div className="suggestions">
          {options.map((food) => (
            <button
              key={food.id}
              type="button"
              disabled={busy}
              onClick={() => save(food.id, `${item.food.name} now counts as ${food.name}.`)}
            >
              {food.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="btn-row" style={{ marginTop: 8 }}>
        {item.food.countsAs ? (
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={busy}
            onClick={() => save(null, `${item.food.name} is no longer linked to an ingredient.`)}
          >
            Not an ingredient
          </button>
        ) : null}
        <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
