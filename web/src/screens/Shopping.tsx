import { Suspense, lazy, useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { IngredientUse, RunOutPrediction, ShoppingItem } from '../lib/types';
import { dateInputToISO, formatAmount, formatDateInput } from '../lib/format';
import { FoodThumb } from '../fridge/Fridge';
import { UnitSelect } from '../components/UnitSelect';
import { Icon } from '../ui/Icon';
import { Empty, Page, Sheet, errorText, useToast } from '../ui/kit';

const BarcodeScanner = lazy(() => import('../components/BarcodeScanner').then((m) => ({ default: m.BarcodeScanner })));

const UNITS = /^(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l|lb|lbs|oz|bags?|jars?|cans?|tins?|bottles?|boxes?|packs?|packets?|cartons?|loaves|loaf|bunch(?:es)?|dozen)?\s+(.+)$/i;

/** "2 bags rice", "500 g mince", "milk": say it the way you would write it */
export function parseQuick(text: string): { name: string; quantity: number; unit: string } {
  const m = text.trim().match(UNITS);
  if (!m) return { name: text.trim(), quantity: 1, unit: 'count' };
  const quantity = Number(m[1].replace(',', '.'));
  let unit = (m[2] ?? 'count').toLowerCase();
  const singular: Record<string, string> = { lbs: 'lb', bags: 'bag', jars: 'jar', cans: 'can', tins: 'can', tin: 'can', bottles: 'bottle', boxes: 'box', packs: 'pack', packets: 'packet', cartons: 'carton', loaves: 'loaf', bunches: 'bunch' };
  unit = singular[unit] ?? unit;
  return { name: m[3].trim(), quantity, unit };
}

const FROM: Record<string, string> = { recipe_gap: 'For a recipe', low_stock: 'Running low', manual: '' };

export default function Shopping() {
  const toast = useToast();
  const [items, setItems] = useState<ShoppingItem[] | null>(null);
  const [soon, setSoon] = useState<RunOutPrediction[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [stocking, setStocking] = useState<ShoppingItem | null>(null);
  const [scanning, setScanning] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.getFresh<{ items: ShoppingItem[] }>('/api/shopping-list');
      setItems(d.items);
      setError(null);
    } catch (e) {
      setError(errorText(e, 'Could not load your list.'));
    }
    api.get<{ predictions: RunOutPrediction[] }>('/api/planning/run-out').then((d) => setSoon((d.predictions ?? []).filter((p) => !p.alreadyOnList).slice(0, 4))).catch(() => setSoon([]));
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function add(event?: FormEvent, preset?: { name: string; quantity: number; unit: string }) {
    event?.preventDefault();
    const entry = preset ?? parseQuick(text);
    if (!entry.name) return;
    try {
      await api.post('/api/shopping-list', { name: entry.name, quantityNeeded: entry.quantity, unit: entry.unit });
      setText('');
      void load();
    } catch (e) {
      toast(errorText(e, 'Could not add that.'));
    }
  }

  async function uncheck(item: ShoppingItem) {
    await api.patch(`/api/shopping-list/${item.id}`, { isChecked: false }).catch(() => undefined);
    void load();
  }

  async function remove(item: ShoppingItem) {
    try {
      await api.delete(`/api/shopping-list/${item.id}`);
      toast(`${item.name} taken off the list.`, { label: 'Undo', run: () => void add(undefined, { name: item.name, quantity: item.quantityNeeded, unit: item.unit }) });
      void load();
    } catch (e) {
      toast(errorText(e, 'Could not remove that.'));
    }
  }

  async function clearDone() {
    try {
      await api.delete('/api/shopping-list/checked');
      void load();
    } catch (e) {
      toast(errorText(e, 'Could not clear those.'));
    }
  }

  const open = items?.filter((i) => !i.isChecked) ?? [];
  const done = items?.filter((i) => i.isChecked) ?? [];

  return (
    <Page title="Shopping" right={<button type="button" className="icon-btn" aria-label="Scan something in the shop" onClick={() => setScanning(true)}><Icon name="scan" size={20} /></button>}>
      <form className="quick-add" onSubmit={add}>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add something, like “2 bags rice”" aria-label="Add to your list" enterKeyHint="done" />
        <button type="submit" className="icon-btn add" aria-label="Add" disabled={!text.trim()}><Icon name="plus" size={20} /></button>
      </form>
      {error ? <div className="banner error" style={{ marginTop: 12 }}>{error}</div> : null}

      {!items ? (
        <div style={{ marginTop: 18 }}>{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 58, marginBottom: 10 }} />)}</div>
      ) : items.length === 0 && soon.length === 0 ? (
        <Empty title="Nothing on the list">Missing ingredients from a recipe land here in one tap, and so does anything running low.</Empty>
      ) : (
        <>
          {open.length ? (
            <>
              <div className="section"><h2>To buy</h2><span className="aside">{open.length}</span></div>
              <div className="list">
                {open.map((item) => (
                  <div key={item.id} className="list-row shop-row">
                    <button type="button" className="tick" aria-label={`Bought ${item.name}`} onClick={() => setStocking(item)} />
                    <span className="thumb"><FoodThumb name={item.name} category={null} quantity={item.quantityNeeded} unit={item.unit} size={32} /></span>
                    <span className="grow">
                      <span className="t">{item.name}</span>
                      <span className="s">{[formatAmount(item.quantityNeeded, item.unit), FROM[item.addedFrom]].filter(Boolean).join(' · ')}</span>
                    </span>
                    <button type="button" className="icon-btn plain faint" aria-label={`Remove ${item.name}`} onClick={() => void remove(item)}><Icon name="close" size={16} /></button>
                  </div>
                ))}
              </div>
            </>
          ) : items.length ? <p className="fine" style={{ marginTop: 18 }}>Everything is in the basket.</p> : null}

          {soon.length ? (
            <>
              <div className="section"><h2>Probably need soon</h2></div>
              <div className="list">
                {soon.map((p) => (
                  <div key={p.foodReferenceId} className="list-row">
                    <span className="thumb"><FoodThumb name={p.name} category={null} quantity={p.remaining} unit={p.unit} size={32} /></span>
                    <span className="grow">
                      <span className="t">{p.name}</span>
                      <span className="s">{formatAmount(p.remaining, p.unit)} left, runs out in about {p.daysLeft} {p.daysLeft === 1 ? 'day' : 'days'}</span>
                    </span>
                    <button type="button" className="btn small secondary" onClick={() => void add(undefined, { name: p.name, quantity: 1, unit: 'count' })}>Add</button>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {done.length ? (
            <>
              <div className="section">
                <button type="button" className="done-toggle" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}>
                  <h2>In the basket</h2><span className="aside">{done.length}</span><Icon name="down" size={16} className={showDone ? 'flip' : ''} />
                </button>
                <button type="button" className="link-btn" onClick={() => void clearDone()}>Clear</button>
              </div>
              {showDone ? (
                <div className="list">
                  {done.map((item) => (
                    <div key={item.id} className="list-row shop-row done">
                      <button type="button" className="tick on" aria-label={`Put ${item.name} back on the list`} onClick={() => void uncheck(item)}><Icon name="check" size={15} stroke={2.4} /></button>
                      <span className="grow"><span className="t">{item.name}</span></span>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </>
      )}

      {stocking ? (
        <StockSheet
          item={stocking}
          onClose={() => setStocking(null)}
          onDone={(message) => { setStocking(null); toast(message); void load(); }}
        />
      ) : null}
      {scanning ? <ShopScanSheet onClose={() => setScanning(false)} /> : null}
    </Page>
  );
}

/** Ticking it off is the moment to put it away, so you never type it twice. */
function StockSheet({ item, onClose, onDone }: { item: ShoppingItem; onClose: () => void; onDone: (message: string) => void }) {
  const [quantity, setQuantity] = useState(item.quantityNeeded);
  const [unit, setUnit] = useState(item.unit);
  const [expiry, setExpiry] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function stock() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/shopping-list/${item.id}/stock`, { quantity, unit, expirationDate: expiry ? dateInputToISO(expiry) : null });
      onDone(`${item.name} is in your pantry.`);
    } catch (e) {
      setError(errorText(e, 'Could not put that away.'));
      setBusy(false);
    }
  }

  async function justTick() {
    setBusy(true);
    try {
      await api.patch(`/api/shopping-list/${item.id}`, { isChecked: true });
      onDone(`${item.name} ticked off.`);
    } catch (e) {
      setError(errorText(e, 'Could not tick that off.'));
      setBusy(false);
    }
  }

  return (
    <Sheet title={`Bought ${item.name}?`} sub="Put it away now and you never type it again." onClose={onClose}>
      <div className="item-hero">
        <FoodThumb name={item.name} category={null} quantity={quantity} unit={unit} size={80} />
      </div>
      {error ? <div className="banner error" style={{ marginTop: 12 }}>{error}</div> : null}
      <div className="field-row">
        <div className="field">
          <label htmlFor="st-q">How much</label>
          <input id="st-q" type="number" inputMode="decimal" min={0} step="any" value={Number.isFinite(quantity) ? quantity : ''} onChange={(e) => setQuantity(Number(e.target.value))} />
        </div>
        <div className="field">
          <label htmlFor="st-u">Unit</label>
          <UnitSelect id="st-u" value={unit} onChange={setUnit} suggested={item.unit} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="st-e">Use by (optional)</label>
        <input id="st-e" type="date" min={formatDateInput(new Date())} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
      </div>
      <button type="button" className="btn block" style={{ marginTop: 20 }} onClick={stock} disabled={busy || !(quantity > 0)}>Put it in the pantry</button>
      <button type="button" className="btn ghost block" onClick={justTick} disabled={busy}>Just tick it off</button>
    </Sheet>
  );
}

/** In the shop: scan something on the shelf to see what it would unlock. Nothing is added. */
function ShopScanSheet({ onClose }: { onClose: () => void }) {
  const [result, setResult] = useState<{ food: { name: string; brand: string | null }; countsAs: string | null; uses: IngredientUse[]; totalRecipes: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function lookup(code: string) {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.get(`/api/shopping-list/scan/${code}`));
    } catch (e) {
      setError(errorText(e, 'Could not look that up. Try another product.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={result ? result.food.name : 'What would this unlock?'} sub={result ? [result.food.brand, result.countsAs ? `counts as ${result.countsAs}` : null].filter(Boolean).join(' · ') || undefined : 'Scan something on the shelf. Nothing is added to your pantry.'} onClose={onClose}>
      {error ? <div className="banner error" style={{ marginTop: 10 }}>{error}</div> : null}
      {!result ? (
        <div style={{ marginTop: 12 }}>
          {busy ? <p className="fine" style={{ marginBottom: 8 }}>Looking it up…</p> : null}
          <Suspense fallback={<div className="skeleton" style={{ aspectRatio: '4 / 3' }} />}>
            <BarcodeScanner onDetected={lookup} />
          </Suspense>
        </div>
      ) : (
        <>
          {result.uses.length === 0 ? (
            <div className="banner" style={{ marginTop: 12 }}>Nothing in your recipe book uses this. It will not unlock a meal tonight.</div>
          ) : (
            <>
              <div className="section"><h2>Used in {result.totalRecipes} {result.totalRecipes === 1 ? 'recipe' : 'recipes'}</h2></div>
              <div className="list">
                {result.uses.map((u) => (
                  <Link key={u.recipeId} to={`/recipes/${u.recipeId}`} className="list-row">
                    <span className="grow"><span className="t">{u.recipeName}</span><span className="s">{formatAmount(u.quantity, u.unit)}{u.totalMinutes ? ` · ${u.totalMinutes} min` : ''}</span></span>
                    {u.canMakeWithThis ? <span className="tag ok">Ready after this</span> : <span className="tag neutral">+{u.otherGaps} more</span>}
                  </Link>
                ))}
              </div>
            </>
          )}
          <button type="button" className="btn secondary block" style={{ marginTop: 18 }} onClick={() => setResult(null)}>Scan something else</button>
        </>
      )}
    </Sheet>
  );
}
