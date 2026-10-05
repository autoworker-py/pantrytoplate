import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { InventoryItem, MealSlot, RecipesForFood, RemovalReason, StorageLocation } from '../lib/types';
import { dateInputToISO, expiryLabel, formatAmount, formatDateInput } from '../lib/format';
import { FoodThumb, LinkBadge, drawnAs, expiryTag } from '../fridge/Fridge';
import { ZONES } from '../fridge/ZonePager';
import { CountsAs, needsLink } from '../components/CountsAs';
import { UnitSelect } from '../components/UnitSelect';
import { Icon, type IconName } from '../ui/Icon';
import { Sheet, Switch, errorText, useToast } from '../ui/kit';
import { FastingReminder } from '../components/FastingReminder';

const WHERE = { fridge: 'the fridge', pantry: 'the cupboard', freezer: 'the freezer' } as const;
const ZONE_ICON: Record<StorageLocation, IconName> = { fridge: 'pantry', pantry: 'box', freezer: 'snow' };
const ZONE_HINT: Record<StorageLocation, string> = {
  fridge: 'Cold, for what goes off.',
  pantry: 'Dry, at room temperature.',
  freezer: 'Keeps for months. The date moves out to match.',
};
/** Thawed food keeps about two days. */
const THAW_DAYS = 2;

/** A local calendar day n days from today, sent as local noon like every date the app sends. */
function dayFromToday(n: number): { iso: string; name: string } {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return { iso: dateInputToISO(formatDateInput(d)) ?? d.toISOString(), name: d.toLocaleDateString(undefined, { weekday: 'long' }) };
}

export function mealNow(): MealSlot {
  const hour = new Date().getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snack';
}

/**
 * Tap something you own. Three things happen to food and they stay separate:
 * you eat it (it goes in your diary), someone else has it (it does not), or it
 * goes in the bin (it goes in the waste log). First say which, then how much.
 */
export function ItemSheet({ item, onClose, onChanged }: { item: InventoryItem; onClose: () => void; onChanged: () => void }) {
  const [step, setStep] = useState<'home' | 'ate' | 'gone' | 'edit' | 'move'>('home');
  const [quantity, setQuantity] = useState(() => defaultAmount(item));
  const [unit, setUnit] = useState(item.unit);
  const [meal, setMeal] = useState<MealSlot>(mealNow);
  const [expiry, setExpiry] = useState(() => (item.expirationDate ? formatDateInput(new Date(item.expirationDate)) : ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const tag = expiryTag(item);
  const soon = item.storageLocation !== 'freezer' && item.daysUntilExpiration !== null && item.daysUntilExpiration >= 0 && item.daysUntilExpiration <= 2;

  async function run(action: () => Promise<string | { message: string; logId?: string; undo?: { run: () => Promise<unknown>; done: string } }>) {
    setBusy(true);
    setError(null);
    try {
      const out = await action();
      const message = typeof out === 'string' ? out : out.message;
      const logId = typeof out === 'string' ? undefined : out.logId;
      const undo = typeof out === 'string' ? undefined : out.undo;
      const reverse = logId
        ? { run: () => api.delete(`/api/consumption/${logId}`), done: `Undone. ${item.food.name} is back in your pantry.` }
        : undo;
      toast(
        message,
        reverse
          ? {
              label: 'Undo',
              run: () => {
                void reverse
                  .run()
                  .then(() => { toast(reverse.done); onChanged(); })
                  .catch((e) => toast(errorText(e, 'Could not undo that.')));
              },
            }
          : undefined,
      );
      onChanged();
    } catch (cause) {
      setError(errorText(cause));
      setBusy(false);
    }
  }

  const consume = () =>
    run(async () => {
      const { result } = await api.post<{ result: { remaining: number; calories: number | null; lowStock: { added: boolean }; consumptionLogId?: string } }>(
        `/api/inventory/${item.id}/consume`,
        { quantity, unit, mealSlot: meal },
      );
      return {
        message: `Logged ${formatAmount(quantity, unit)} ${item.food.name}${result.calories === null ? '' : `, ${Math.round(result.calories)} kcal`}. ${formatAmount(result.remaining, item.unit)} left.${result.lowStock.added ? ' Added to your shopping list.' : ''}`,
        logId: result.consumptionLogId,
      };
    });

  const remove = (reason: RemovalReason) =>
    run(async () => {
      const { result } = await api.post<{ result: { remaining: number; lowStock: { added: boolean } } }>(`/api/inventory/${item.id}/remove`, { reason, quantity, unit });
      const why = reason === 'wasted' ? ' Logged as waste.' : '';
      return `${formatAmount(quantity, unit)} ${item.food.name} taken out. ${formatAmount(result.remaining, item.unit)} left.${why}${result.lowStock.added ? ' Added to your shopping list.' : ''}`;
    });

  // where it was, so a move can be put back exactly
  const putBack = {
    run: () => api.patch(`/api/inventory/${item.id}`, { storageLocation: item.storageLocation, expirationDate: item.expirationDate }),
    done: `Undone. ${item.food.name} is back in ${WHERE[item.storageLocation]}.`,
  };

  const freeze = () =>
    run(async () => {
      const data = await api.post<{ item: InventoryItem }>(`/api/inventory/${item.id}/freeze`);
      return { message: `${item.food.name} is in the freezer now, good for about ${data.item.daysUntilExpiration} more days.`, undo: putBack };
    });

  /** Out of the freezer and thawing, it keeps about two days; a date already sooner stays. */
  const move = (to: StorageLocation, thawing: boolean) =>
    to === 'freezer'
      ? freeze()
      : run(async () => {
          const d = item.daysUntilExpiration;
          const thaw = thawing && (d === null || d > THAW_DAYS) ? dayFromToday(THAW_DAYS) : null;
          await api.patch(`/api/inventory/${item.id}`, thaw ? { storageLocation: to, expirationDate: thaw.iso } : { storageLocation: to });
          return { message: `${item.food.name} moved to ${WHERE[to]}.${thaw ? ` Thawing, so use it by ${thaw.name}.` : ''}`, undo: putBack };
        });

  const correct = () =>
    run(async () => {
      await api.patch(`/api/inventory/${item.id}`, { quantity, unit, expirationDate: expiry ? dateInputToISO(expiry) : null });
      const until = expiry ? `, use by ${new Date(`${expiry}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}` : '';
      return `${item.food.name}: ${formatAmount(quantity, unit)}${until}.`;
    });

  const destroy = () =>
    run(async () => {
      await api.delete(`/api/inventory/${item.id}`);
      return `${item.food.name} removed from your pantry.`;
    });

  const sub = [formatAmount(item.quantity, item.unit), item.expirationDate ? expiryLabel(item.daysUntilExpiration, item.expiryStatus) : null, `in ${WHERE[item.storageLocation]}`]
    .filter(Boolean)
    .join(' · ');

  return (
    <Sheet title={item.isLeftover ? `${item.food.name} (leftovers)` : item.food.name} sub={sub} onClose={onClose}>
      <div className="item-hero">
        <span className="thumb-wrap">
          <FoodThumb {...drawnAs(item.food)} quantity={item.quantity} unit={item.unit} isLeftover={item.isLeftover} size={96} />
          {needsLink(item.food) ? <LinkBadge /> : null}
        </span>
        <div className="facts">
          {tag ? <span className={`tag ${tag.tone}`}>{tag.text}</span> : null}
          {item.isLowStock ? <span className="tag soon">Running low</span> : null}
          {item.caloriesRemaining !== null ? <span className="fine">{Math.round(item.caloriesRemaining)} kcal in total</span> : null}
          {item.food.brand ? <span className="fine">{item.food.brand}</span> : null}
        </div>
      </div>

      {error ? <div className="banner error" style={{ marginTop: 12 }}>{error}</div> : null}

      {step === 'home' ? (
        <>
          {soon ? (
            <div className="banner warm" style={{ marginTop: 14 }}>
              <strong>{item.daysUntilExpiration === 0 ? 'Goes off today.' : item.daysUntilExpiration === 1 ? 'Goes off tomorrow.' : 'Goes off in 2 days.'}</strong> Freeze it and it keeps for months instead.
              <div style={{ marginTop: 10 }}>
                <button type="button" className="btn small secondary" onClick={freeze} disabled={busy}><Icon name="snow" size={17} /> Freeze it</button>
              </div>
            </div>
          ) : null}

          <div className="action-grid">
            <button type="button" className="action" onClick={() => setStep('ate')}>
              <Icon name="fork" size={22} />
              <span>I ate some</span>
            </button>
            <button type="button" className="action" onClick={() => setStep('gone')}>
              <Icon name="bin" size={22} />
              <span>It's gone</span>
            </button>
            <button type="button" className="action" onClick={() => setStep('move')}>
              <Icon name="move" size={22} />
              <span>Move it</span>
            </button>
            <button type="button" className="action" onClick={() => { setQuantity(item.quantity); setUnit(item.unit); setStep('edit'); }}>
              <Icon name="edit" size={22} />
              <span>Edit</span>
            </button>
          </div>

          <UsedIn foodId={item.food.id} name={item.food.name} />

          {item.food.barcode ? (
            <div style={{ marginTop: 18 }}>
              <CountsAs food={item.food} onChanged={onChanged} />
            </div>
          ) : null}
          {item.food.source === 'openfoodfacts' ? (
            <p className="fine source-credit">
              Product details from <a href={`https://world.openfoodfacts.org/product/${item.food.barcode ?? ''}`} target="_blank" rel="noreferrer">Open Food Facts</a>, under the{' '}
              <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">Open Database License</a>.
            </p>
          ) : null}

          <button type="button" className="btn ghost danger-ink" style={{ marginTop: 16 }} onClick={destroy} disabled={busy}>
            <Icon name="trash" size={18} /> Remove from pantry
          </button>
        </>
      ) : step === 'move' ? (
        <MoveStep item={item} busy={busy} onBack={() => { setStep('home'); setError(null); }} onMove={move} />
      ) : (
        <AmountStep
          item={item}
          step={step}
          quantity={quantity}
          unit={unit}
          onQuantity={setQuantity}
          onUnit={setUnit}
          meal={meal}
          onMeal={setMeal}
          busy={busy}
          onBack={() => { setStep('home'); setError(null); }}
          onConsume={consume}
          onRemove={remove}
          onCorrect={correct}
          expiry={expiry}
          onExpiry={setExpiry}
        />
      )}
    </Sheet>
  );
}

/** Fridge, cupboard or freezer: put wherever it really is. */
function MoveStep({ item, busy, onBack, onMove }: { item: InventoryItem; busy: boolean; onBack: () => void; onMove: (to: StorageLocation, thawing: boolean) => void }) {
  const [thawing, setThawing] = useState(true);
  const fromFreezer = item.storageLocation === 'freezer';
  const d = item.daysUntilExpiration;
  const dateMoves = d === null || d > THAW_DAYS;
  return (
    <div className="amount-step">
      <button type="button" className="btn ghost" style={{ paddingLeft: 0 }} onClick={onBack}>
        <Icon name="back" size={18} /> Back
      </button>
      <h3 className="title-m" style={{ marginTop: 4 }}>Where does it live now?</h3>
      <div className="list move-list" style={{ marginTop: 12 }}>
        {ZONES.map((z) => {
          const here = z.key === item.storageLocation;
          return (
            <button key={z.key} type="button" className="list-row" disabled={busy || here} onClick={() => onMove(z.key, fromFreezer && thawing)}>
              <span className="thumb"><Icon name={ZONE_ICON[z.key]} size={22} /></span>
              <span className="grow">
                <span className="t">{z.label}</span>
                <span className="s">{ZONE_HINT[z.key]}</span>
              </span>
              {here ? <span className="tag neutral">Here now</span> : <Icon name="chevron" size={16} />}
            </button>
          );
        })}
      </div>
      {fromFreezer ? (
        <div className="thaw-row">
          <span className="grow">
            <span className="t">It’s thawing</span>
            <span className="s">
              {!thawing ? 'The date stays as it is.' : dateMoves ? `Thawed food keeps about ${THAW_DAYS} days, so the date moves to ${dayFromToday(THAW_DAYS).name}.` : 'Its date is already sooner than that, so it stays.'}
            </span>
          </span>
          <Switch on={thawing} onChange={setThawing} label="It’s thawing" />
        </div>
      ) : null}
    </div>
  );
}

function defaultAmount(item: InventoryItem): number {
  // one of whatever it is counted in, or all of it when there is less than one
  if (item.quantity <= 1) return item.quantity;
  return ['g', 'ml', 'kg', 'l', 'oz', 'lb', 'cup'].includes(item.unit) ? Math.round(item.quantity * 0.25 * 100) / 100 : 1;
}

function AmountStep({
  item, step, quantity, unit, onQuantity, onUnit, meal, onMeal, busy, onBack, onConsume, onRemove, onCorrect, expiry, onExpiry,
}: {
  item: InventoryItem;
  step: 'ate' | 'gone' | 'edit';
  quantity: number;
  unit: string;
  onQuantity: (q: number) => void;
  onUnit: (u: string) => void;
  meal: MealSlot;
  onMeal: (m: MealSlot) => void;
  busy: boolean;
  onBack: () => void;
  onConsume: () => void;
  onRemove: (reason: RemovalReason) => void;
  onCorrect: () => void;
  expiry: string;
  onExpiry: (day: string) => void;
}) {
  const shares: Array<[string, number]> = [['A quarter', 0.25], ['Half', 0.5], ['All of it', 1]];
  const heading = step === 'ate' ? 'How much did you eat?' : step === 'gone' ? 'How much is gone?' : 'Amount and use-by date';
  const sameUnit = unit === item.unit;
  const ok = quantity > 0 && (step === 'edit' || !sameUnit || quantity <= item.quantity + 1e-9);

  return (
    <div className="amount-step">
      <button type="button" className="btn ghost" style={{ paddingLeft: 0 }} onClick={onBack}>
        <Icon name="back" size={18} /> Back
      </button>
      <h3 className="title-m" style={{ marginTop: 4 }}>{heading}</h3>

      {step !== 'edit' ? (
        <div className="chips" style={{ marginTop: 12 }}>
          {shares.map(([label, share]) => {
            const value = Math.round(item.quantity * share * 1000) / 1000;
            return (
              <button key={label} type="button" className={`chip${sameUnit && Math.abs(quantity - value) < 1e-6 ? ' on' : ''}`} onClick={() => { onQuantity(value); onUnit(item.unit); }}>
                {label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="field-row">
        <div className="field">
          <label htmlFor="amt">Amount</label>
          <input id="amt" type="number" inputMode="decimal" min={0} step="any" value={Number.isFinite(quantity) ? quantity : ''} onChange={(e) => onQuantity(Number(e.target.value))} />
        </div>
        <div className="field">
          <label htmlFor="amt-unit">Unit</label>
          <UnitSelect id="amt-unit" value={unit} onChange={onUnit} suggested={item.unit} />
        </div>
      </div>
      {step !== 'edit' && sameUnit ? (
        <input
          className="range"
          type="range"
          min={0}
          max={item.quantity}
          step={item.quantity / 20 || 0.05}
          value={Math.min(quantity, item.quantity)}
          onChange={(e) => onQuantity(Number(e.target.value))}
          aria-label="How much"
        />
      ) : null}

      {step === 'ate' ? (
        <>
          <div className="label" style={{ marginTop: 18 }}>Meal</div>
          <div className="chips" style={{ marginTop: 8 }}>
            {(['breakfast', 'lunch', 'dinner', 'snack'] as MealSlot[]).map((m) => (
              <button key={m} type="button" className={`chip${meal === m ? ' on' : ''}`} onClick={() => onMeal(m)}>
                {m[0].toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
          <FastingReminder style={{ marginTop: 16 }} />
          <button type="button" className="btn block" style={{ marginTop: 20 }} onClick={onConsume} disabled={busy || !ok}>
            Log {formatAmount(quantity || 0, unit)}
          </button>
        </>
      ) : step === 'gone' ? (
        <>
          <p className="fine" style={{ marginTop: 16 }}>None of these touch your diary. You did not eat it.</p>
          <div className="stack-btns">
            <button type="button" className="btn secondary block" onClick={() => onRemove('other_person')} disabled={busy || !ok}>Someone else had it</button>
            <button type="button" className="btn secondary block" onClick={() => onRemove('used_up')} disabled={busy || !ok}>Used up</button>
            <button type="button" className="btn danger block" onClick={() => onRemove('wasted')} disabled={busy || !ok}>Threw it out</button>
          </div>
        </>
      ) : (
        <>
          <div className="field">
            <label htmlFor="amt-date">Use by</label>
            <div className="date-row">
              <input id="amt-date" type="date" value={expiry} onChange={(e) => onExpiry(e.target.value)} />
              {expiry ? <button type="button" className="link-btn" onClick={() => onExpiry('')}>No date</button> : null}
            </div>
          </div>
          <p className="fine" style={{ marginTop: 6 }}>{expiry ? 'You get a warning before this date.' : 'With no date, it never shows as going off.'}</p>
          <button type="button" className="btn block" style={{ marginTop: 20 }} onClick={onCorrect} disabled={busy || !(quantity > 0)}>
            Save
          </button>
        </>
      )}
    </div>
  );
}

/** "I have this, what can I make?" Ready ones first; a quiet failure never blocks logging. */
function UsedIn({ foodId, name }: { foodId: string; name: string }) {
  const [data, setData] = useState<RecipesForFood | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    api.get<RecipesForFood>(`/api/recipes/for-food/${foodId}`).then((r) => live && setData(r)).catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [foodId]);
  const shown = useMemo(() => (data ? [...data.recipes].sort((a, b) => Number(b.canMakeNow) - Number(a.canMakeNow) || a.gaps - b.gaps).slice(0, 4) : []), [data]);
  if (failed || (data && data.recipes.length === 0)) return null;
  return (
    <div style={{ marginTop: 22 }}>
      <div className="section" style={{ marginTop: 0 }}>
        <h2>Cook with {name.toLowerCase()}</h2>
        {data && data.total > shown.length ? <span className="aside">{data.total} recipes</span> : null}
      </div>
      {!data ? <div className="skeleton" style={{ height: 120 }} /> : (
        <div className="list">
          {shown.map((r) => (
            <Link key={r.id} to={`/recipes/${r.id}`} className="list-row">
              <span className="grow">
                <span className="t">{r.name}</span>
                <span className="s">Uses {formatAmount(r.quantity, r.unit)}{r.totalMinutes ? ` · ${r.totalMinutes} min` : ''}{!r.canMakeNow && r.missing.length ? ` · needs ${r.missing.slice(0, 2).join(', ')}` : ''}</span>
              </span>
              {r.canMakeNow ? <span className="tag ok">Ready</span> : <span className="tag neutral">Need {r.gaps}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
