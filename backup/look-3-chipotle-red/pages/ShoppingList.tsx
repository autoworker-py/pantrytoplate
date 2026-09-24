import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../lib/api';
import type { Ad, IngredientUse, ShoppingItem } from '../lib/types';
import { AdCard } from '../components/AdCard';
import { formatAmount, formatDateInput } from '../lib/format';
import { Sheet } from '../components/Sheet';
import { Icon } from '../components/Icon';
import { Suspense, lazy } from 'react';

// only pulled in if someone actually scans in a shop
const BarcodeScanner = lazy(() =>
  import('../components/BarcodeScanner').then((module) => ({ default: module.BarcodeScanner })),
);
import { useToast } from '../components/Toast';

export default function ShoppingList() {
  const [items, setItems] = useState<ShoppingItem[] | null>(null);
  const [ads, setAds] = useState<Ad[]>([]);
  const [openItem, setOpenItem] = useState<ShoppingItem | null>(null);
  const [scanning, setScanning] = useState(false);
  const [stocking, setStocking] = useState<ShoppingItem | null>(null);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState('count');
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ items: ShoppingItem[]; ads: Ad[] }>('/api/shopping-list');
      setItems(data.items);
      setAds(data.ads);
    } catch {
      setError('Could not load your shopping list.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      await api.post('/api/shopping-list', { name, quantityNeeded: quantity, unit });
      setName('');
      setQuantity(1);
      setUnit('count');
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not add that item.');
    }
  }

  async function remove(item: ShoppingItem) {
    await api.delete(`/api/shopping-list/${item.id}`);
    await load();
  }

  async function toggle(item: ShoppingItem) {
    if (!item.isChecked) {
      // Checking something off is the moment to put it in the pantry.
      setStocking(item);
      return;
    }
    await api.patch(`/api/shopping-list/${item.id}`, { isChecked: false });
    await load();
  }

  if (error) return <div className="banner error">{error}</div>;

  const open = items?.filter((item) => !item.isChecked) ?? [];
  const done = items?.filter((item) => item.isChecked) ?? [];

  return (
    <>
      <div className="row" style={{ marginBottom: 10 }}>
        <h1 style={{ margin: 0 }}>Shopping list</h1>
        <button type="button" className="btn-secondary btn-sm" onClick={() => setScanning(true)}>
          Scan in store
        </button>
      </div>

      <form className="card" onSubmit={add}>
        <div className="field">
          <label htmlFor="item">Add an item</label>
          <input
            id="item"
            value={name}
            placeholder="Coffee beans"
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="q">Quantity</label>
            <input id="q" type="number" min={0} step="any" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
          </div>
          <div className="field">
            <label htmlFor="u">Unit</label>
            <input id="u" value={unit} onChange={(event) => setUnit(event.target.value)} />
          </div>
        </div>
        <button type="submit" className="btn-block" disabled={!name.trim()}>
          Add
        </button>
      </form>

      {!items ? (
        <div className="empty">Loading…</div>
      ) : items.length === 0 ? (
        <div className="empty">
          <div className="big"><Icon name="cart" size={40} /></div>
          <p>Your list is empty. Recipe gaps land here in one tap.</p>
        </div>
      ) : (
        <>
          <div className="card">
            {open.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                Everything is checked off.
              </p>
            ) : (
              <ul className="list">
                {/*
                  * The name gets the room. Everything else that used to sit on
                  * this line — a source pill, an info button — squeezed a
                  * shopping list down to "Parmesan C…", which is no use in a
                  * shop. Why it is on the list goes underneath, and the row
                  * itself is the tap target for what it is for.
                  */}
                {open.map((item) => (
                  <li key={item.id} className="shop-row">
                    <label className="shop-check">
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={() => toggle(item)}
                        aria-label={`Tick off ${item.name}`}
                      />
                    </label>
                    <button
                      type="button"
                      className="shop-name"
                      onClick={() => setOpenItem(item)}
                      aria-label={`What is ${item.name} for?`}
                    >
                      <span className="truncate">{item.name}</span>
                      {item.addedFrom === 'recipe_gap' ? <span className="shop-why">for a recipe</span> : null}
                      {item.addedFrom === 'low_stock' ? <span className="shop-why warn">you ran out</span> : null}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => remove(item)}
                      aria-label={`Remove ${item.name}`}
                    >
                      <Icon name="close" size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {ads.map((ad) => (
            <AdCard key={ad.id} ad={ad} />
          ))}

          {done.length > 0 ? (
            <>
              <h2>In the cart</h2>
              <div className="card">
                <ul className="list">
                  {done.map((item) => (
                    <li key={item.id} className="row">
                      <label
                        className="row grow"
                        style={{
                          margin: 0,
                          fontWeight: 400,
                          fontSize: '1rem',
                          textTransform: 'none',
                          letterSpacing: 'normal',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked
                          onChange={() => toggle(item)}
                          style={{ width: 20, height: 20, marginRight: 10 }}
                        />
                        <span className="grow muted" style={{ textDecoration: 'line-through' }}>
                          {item.name}
                        </span>
                      </label>
                      <button type="button" className="btn-ghost btn-sm" onClick={() => remove(item)} aria-label={`Remove ${item.name}`}>
                        <Icon name="close" size={15} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : null}
        </>
      )}

      {openItem ? <ItemUses item={openItem} onClose={() => setOpenItem(null)} /> : null}
      {scanning ? <StoreScan onClose={() => setScanning(false)} /> : null}

      {stocking ? (
        <StockSheet
          item={stocking}
          onClose={() => setStocking(null)}
          onDone={async (message) => {
            setStocking(null);
            toast(message);
            await load();
          }}
          onJustCheck={async () => {
            await api.patch(`/api/shopping-list/${stocking.id}`, { isChecked: true });
            setStocking(null);
            await load();
          }}
        />
      ) : null}
    </>
  );
}

function StockSheet({
  item,
  onClose,
  onDone,
  onJustCheck,
}: {
  item: ShoppingItem;
  onClose: () => void;
  onDone: (message: string) => void;
  onJustCheck: () => Promise<void>;
}) {
  const [quantity, setQuantity] = useState(item.quantityNeeded);
  const [unit, setUnit] = useState(item.unit);
  const [expiration, setExpiration] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function stock() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/shopping-list/${item.id}/stock`, {
        quantity,
        unit,
        expirationDate: expiration || null,
      });
      onDone(`${item.name} is in your pantry.`);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not add that to your pantry.');
      setBusy(false);
    }
  }

  return (
    <Sheet title={`Bought ${item.name}?`} onClose={onClose}>
      <p className="muted">Add it to your pantry now so you never have to type it again.</p>

      {error ? <div className="banner error">{error}</div> : null}

      <div className="field-row">
        <div className="field">
          <label htmlFor="sq">Quantity</label>
          <input id="sq" type="number" min={0} step="any" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
        </div>
        <div className="field">
          <label htmlFor="su">Unit</label>
          <input id="su" value={unit} onChange={(event) => setUnit(event.target.value)} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="se">Expires (optional)</label>
        <input
          id="se"
          type="date"
          min={formatDateInput(new Date())}
          value={expiration}
          onChange={(event) => setExpiration(event.target.value)}
        />
      </div>

      <button type="button" className="btn-block" onClick={stock} disabled={busy || !(quantity > 0)}>
        Add to pantry
      </button>
      <button type="button" className="btn-ghost btn-block" onClick={onJustCheck} disabled={busy}>
        Just check it off
      </button>
    </Sheet>
  );
}

/**
 * What a line on the list is actually for.
 *
 * "Unsalted Butter — 1.4 tbsp" is precise and useless in a shop: you buy a pack,
 * not a tablespoon. Knowing it is there for scrambled eggs, and that it also
 * unlocks four other things, is what helps you decide.
 */
function ItemUses({ item, onClose }: { item: ShoppingItem; onClose: () => void }) {
  const [uses, setUses] = useState<IngredientUse[] | null>(null);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    api
      .get<{ uses: IngredientUse[]; totalRecipes: number }>(`/api/shopping-list/${item.id}/uses`)
      .then((data) => {
        setUses(data.uses);
        setTotal(data.totalRecipes);
      })
      .catch(() => setUses([]));
  }, [item.id]);

  return (
    <Sheet title={item.name} onClose={onClose}>
      {!uses ? (
        <p className="muted">Loading…</p>
      ) : uses.length === 0 ? (
        <p className="muted">
          No recipes in your book use this yet — it is on the list because you added it or ran out.
        </p>
      ) : (
        <>
          <p className="muted">
            You need this for {total} recipe{total === 1 ? '' : 's'}
            {uses[0] && uses[0].canMakeWithThis ? ' — and buying it completes the first one' : ''}.
          </p>
          <ul className="list">
            {uses.map((use) => (
              <li key={use.recipeId} className="row">
                <div className="grow">
                  <Link to={`/recipes/${use.recipeId}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                    <div className="truncate">{use.recipeName}</div>
                  </Link>
                  <div className="muted">
                    {formatAmount(use.quantity, use.unit)}
                    {use.totalMinutes ? ` · ${use.totalMinutes} min` : ''}
                  </div>
                </div>
                {use.canMakeWithThis ? (
                  <span className="pill">Ready after this</span>
                ) : (
                  <span className="pill neutral">+{use.otherGaps} more</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </Sheet>
  );
}

/**
 * Standing in a shop holding something: scan it and see what it is good for
 * before deciding to buy. Nothing is added to the pantry.
 */
function StoreScan({ onClose }: { onClose: () => void }) {
  const [result, setResult] = useState<{
    food: { name: string; brand: string | null };
    countsAs: string | null;
    uses: IngredientUse[];
    totalRecipes: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function lookup(barcode: string) {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.get(`/api/shopping-list/scan/${barcode}`));
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : 'Could not look that up. Try another product.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="What can I make with this?" onClose={onClose}>
      {error ? <div className="banner error">{error}</div> : null}

      {!result ? (
        <>
          <p className="muted">Scan something on the shelf — nothing is added to your pantry.</p>
          {busy ? <p className="muted">Looking it up…</p> : null}
          <Suspense fallback={<p className="muted">Loading the scanner…</p>}>
            <BarcodeScanner onDetected={lookup} />
          </Suspense>
        </>
      ) : (
        <>
          <h3 style={{ marginBottom: 2 }}>{result.food.name}</h3>
          <p className="muted">
            {result.food.brand ?? 'Unbranded'}
            {result.countsAs ? ` · counts as ${result.countsAs}` : ''}
          </p>

          {result.uses.length === 0 ? (
            <div className="banner info">
              Nothing in your recipe book uses this. That is not a reason not to buy it — but it will not
              unlock a meal tonight.
            </div>
          ) : (
            <>
              <p className="muted">
                Used in {result.totalRecipes} recipe{result.totalRecipes === 1 ? '' : 's'}:
              </p>
              <ul className="list">
                {result.uses.map((use) => (
                  <li key={use.recipeId} className="row">
                    <div className="grow">
                      <Link to={`/recipes/${use.recipeId}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                        <div className="truncate">{use.recipeName}</div>
                      </Link>
                      <div className="muted">
                        {formatAmount(use.quantity, use.unit)}
                        {use.totalMinutes ? ` · ${use.totalMinutes} min` : ''}
                      </div>
                    </div>
                    {use.canMakeWithThis ? (
                      <span className="pill">Ready after this</span>
                    ) : (
                      <span className="pill neutral">+{use.otherGaps} more</span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          <button type="button" className="btn-secondary btn-block" onClick={() => setResult(null)}>
            Scan something else
          </button>
        </>
      )}
    </Sheet>
  );
}
