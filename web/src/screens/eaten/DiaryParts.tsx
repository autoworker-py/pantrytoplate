import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { done } from '../../lib/native';
import type { EntryDetail, MealSlot, ReceiptLine, WaterDay } from '../../lib/types';
import type { UnitSystem } from '../../components/BodyInputs';
import { Icon } from '../../ui/Icon';
import { Sheet, errorText, useToast } from '../../ui/kit';
import '../order/order.css';
import './eaten.css';

/*
 * The Eaten screen's newer parts: a line for water, for people who track it,
 * and a meal eaten out as a receipt whose lines can each be eaten less of.
 */

const MEAL: Record<MealSlot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------- water ---------- */

const GLASS: Record<UnitSystem, number> = { metric: 250, imperial: 237 };
const BOTTLE = 500;

export function formatWater(ml: number, system: UnitSystem): string {
  if (system === 'imperial') return `${Math.round(ml / 29.5735)} fl oz`;
  return `${(ml / 1000).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })} L`;
}

/** One line under the day: how much, a blue bar, and + for a glass (hold it for a bottle). */
export function WaterLine({ day, today, system }: { day: string; today: boolean; system: UnitSystem }) {
  const toast = useToast();
  const [water, setWater] = useState<WaterDay | null>(null);
  const [open, setOpen] = useState(false);
  const held = useRef<number | null>(null);
  const bottled = useRef(false);

  const load = useCallback(() => {
    api.getFresh<WaterDay>(`/api/water/day?date=${day}`).then(setWater).catch(() => setWater(null));
  }, [day]);
  useEffect(load, [load]);

  async function drink(ml: number, what: string) {
    try {
      const d = await api.post<{ entry: { id: string }; day: WaterDay }>('/api/water', { ml });
      setWater(d.day);
      done();
      toast(`${what}. ${formatWater(d.day.ml, system)} of ${formatWater(d.day.goalMl, system)}.`, {
        label: 'Undo',
        run: () => {
          void api.delete<WaterDay>(`/api/water/${d.entry.id}`).then(setWater).catch(() => toast('That could not be undone.'));
        },
      });
    } catch (cause) {
      toast(errorText(cause, 'Water could not be added. Try again.'));
    }
  }

  // a press that lasts half a second is a bottle; the click that follows it is then ignored
  const press = () => {
    bottled.current = false;
    held.current = window.setTimeout(() => {
      held.current = null;
      bottled.current = true;
      void drink(BOTTLE, 'A bottle of water');
    }, 500);
  };
  const release = () => {
    if (held.current) window.clearTimeout(held.current);
    held.current = null;
  };
  const tap = () => {
    if (bottled.current) {
      bottled.current = false;
      return;
    }
    void drink(GLASS[system], 'A glass of water');
  };

  if (!water) return null;
  const said = `${formatWater(water.ml, system)} of ${formatWater(water.goalMl, system)}`;
  return (
    <section className="water-line" aria-label="Water">
      <button type="button" className="water-top" onClick={() => setOpen(true)}>
        <span className="t">Water</span>
        <span className="v num">{said}</span>
      </button>
      <div className="water-row">
        <div className="meter thin water-meter" role="img" aria-label={`${said} of water`}>
          <span style={{ width: `${Math.min(100, water.goalMl ? (water.ml / water.goalMl) * 100 : 0)}%` }} />
        </div>
        {today ? (
          <button
            type="button"
            className="water-add"
            aria-label="Add a glass of water. Hold for a bottle."
            onPointerDown={press}
            onPointerUp={release}
            onPointerLeave={release}
            onPointerCancel={release}
            onContextMenu={(e) => e.preventDefault()}
            onClick={tap}
          >
            <Icon name="plus" size={20} stroke={2.2} />
          </button>
        ) : null}
      </div>
      {open ? (
        <WaterSheet
          water={water}
          system={system}
          today={today}
          onDrink={(ml, what) => void drink(ml, what)}
          onChange={setWater}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </section>
  );
}

function WaterSheet({
  water,
  system,
  today,
  onDrink,
  onChange,
  onClose,
}: {
  water: WaterDay;
  system: UnitSystem;
  today: boolean;
  onDrink: (ml: number, what: string) => void;
  onChange: (water: WaterDay) => void;
  onClose: () => void;
}) {
  const toast = useToast();
  async function takeBack(id: string) {
    try {
      onChange(await api.delete<WaterDay>(`/api/water/${id}`));
    } catch (cause) {
      toast(errorText(cause, 'That could not be taken back.'));
    }
  }
  async function setGoal(goalMl: number) {
    try {
      await api.patch('/api/settings', { waterGoalMl: goalMl });
      onChange({ ...water, goalMl });
    } catch (cause) {
      toast(errorText(cause, 'The goal could not be changed.'));
    }
  }
  return (
    <Sheet title="Water" sub={`${formatWater(water.ml, system)} of ${formatWater(water.goalMl, system)}`} onClose={onClose}>
      {today ? (
        <div className="btn-row">
          <button type="button" className="btn secondary" onClick={() => onDrink(GLASS[system], 'A glass of water')}>Add a glass</button>
          <button type="button" className="btn secondary" onClick={() => onDrink(BOTTLE, 'A bottle of water')}>Add a bottle</button>
        </div>
      ) : null}
      <div className="group" style={{ marginTop: 14 }}>
        {water.entries.length ? (
          water.entries.map((glass) => (
            <div key={glass.id} className="list-row">
              <span className="grow">
                <span className="t num">{formatWater(glass.ml, system)}</span>
                <span className="s">{new Date(glass.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
              </span>
              <button type="button" className="icon-btn" aria-label={`Take back ${formatWater(glass.ml, system)}`} onClick={() => void takeBack(glass.id)}>
                <Icon name="trash" size={18} />
              </button>
            </div>
          ))
        ) : (
          <p className="muted" style={{ padding: '14px 0' }}>No water logged that day.</p>
        )}
      </div>
      <div className="water-goal">
        <span className="t">Daily goal</span>
        <div className="stepper">
          <button type="button" className="icon-btn" aria-label="Lower the goal" disabled={water.goalMl <= 500} onClick={() => void setGoal(water.goalMl - 250)}>
            <Icon name="minus" size={18} />
          </button>
          <span className="num">{formatWater(water.goalMl, system)}</span>
          <button type="button" className="icon-btn" aria-label="Raise the goal" disabled={water.goalMl >= 6000} onClick={() => void setGoal(water.goalMl + 250)}>
            <Icon name="plus" size={18} />
          </button>
        </div>
      </div>
      <p className="fine" style={{ marginTop: 10 }}>Most adults need about 2 to 3 litres a day from drinks, more in the heat or after exercise.</p>
    </Sheet>
  );
}

/* ---------- a meal eaten out, as its receipt ---------- */

const SHARES: Array<[number, string]> = [[1, 'All'], [0.75, '¾'], [0.5, '½'], [0.25, '¼'], [0, 'None']];
const SHARE_SAID: Record<number, string> = { 1: 'all', 0.75: 'three quarters', 0.5: 'half', 0.25: 'a quarter', 0: 'none' };
const SHARE_SHORT: Record<number, string> = { 0.75: '¾', 0.5: '½', 0.25: '¼', 0: 'none' };

/**
 * Each item is a line on the receipt. Tap one, say how much of it you ate,
 * and send the rest to the pantry or the bin; a line you left is crossed out
 * and stamped.
 */
export function MealReceipt({ entry, onChanged }: { entry: EntryDetail & { lines: ReceiptLine[] }; onChanged: () => void }) {
  const toast = useToast();
  const [picked, setPicked] = useState<string | null>(null);
  const [share, setShare] = useState(1);
  const [busy, setBusy] = useState(false);
  const line = entry.lines.find((l) => l.id === picked) ?? null;
  const eaten = entry.lines.reduce((sum, l) => sum + (l.calories ?? 0), 0);
  const time = new Date(entry.consumedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  async function apply(target: ReceiptLine, ate: number, rest: 'pantry' | 'bin') {
    const before = { ate: target.share, rest: target.restTo ?? 'pantry' };
    setBusy(true);
    try {
      await api.post(`/api/consumption/${target.id}/eat-less`, { ate, rest });
      done();
      setPicked(null);
      const name = target.name.toLowerCase();
      toast(
        ate === 1 ? `All of the ${name} counts again.` : `${cap(name)}: ${SHARE_SAID[ate]} eaten, the rest ${rest === 'pantry' ? 'in your fridge' : 'in the bin'}.`,
        {
          label: 'Undo',
          run: () => {
            void api.post(`/api/consumption/${target.id}/eat-less`, before).then(onChanged).catch(() => toast('That could not be undone.'));
          },
        },
      );
      onChanged();
    } catch (cause) {
      toast(errorText(cause, 'That could not be changed. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="ticket meal-receipt">
        <div className="t-head">
          <b>{MEAL[entry.mealSlot]}</b>
          <span>{time}</span>
        </div>
        {entry.lines.map((l) => (
          <div key={l.id} className="receipt-item">
            <button
              type="button"
              className={`t-line receipt-line${l.id === picked ? ' picked' : ''}${l.share === 0 ? ' left' : ''}`}
              aria-pressed={l.id === picked}
              onClick={() => {
                setPicked(l.id === picked ? null : l.id);
                setShare(l.share);
              }}
            >
              <span className="k">{l.name}</span>
              <span className="dots" />
              <span className="v num">{l.fullCalories === null ? '–' : Math.round(l.fullCalories)}</span>
            </button>
            {l.share < 1 ? (
              <p className="receipt-note">
                ate {SHARE_SHORT[l.share] ?? `${Math.round(l.share * 100)}%`}
                <span className={`stamp${l.restTo === 'pantry' ? ' kept' : ''}`}>{l.restTo === 'pantry' ? 'Pantry' : 'Bin'}</span>
              </p>
            ) : null}
          </div>
        ))}
        <div className="t-line receipt-total">
          <span className="k">Eaten</span>
          <span className="dots" />
          <span className="v num">{Math.round(eaten).toLocaleString()} kcal</span>
        </div>
      </div>

      {line ? (
        <div className="receipt-pick">
          <div className="label">{cap(line.name.toLowerCase())}: how much did you eat?</div>
          <div className="chips" role="radiogroup" aria-label="How much you ate" style={{ marginTop: 8 }}>
            {SHARES.map(([value, label]) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={share === value}
                className={`chip${share === value ? ' on' : ''}`}
                disabled={busy}
                onClick={() => {
                  setShare(value);
                  if (value === 1 && line.share !== 1) void apply(line, 1, 'pantry');
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {share < 1 ? (
            <div className="receipt-rest">
              <span className="label">The rest</span>
              <button type="button" className="btn secondary" disabled={busy} onClick={() => void apply(line, share, 'pantry')}>
                <Icon name="pantry" size={18} /> Pantry
              </button>
              <button type="button" className="btn secondary" disabled={busy} onClick={() => void apply(line, share, 'bin')}>
                <Icon name="bin" size={18} /> Bin
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="fine receipt-hint">Tap a line to say you ate less of it.</p>
      )}
    </>
  );
}
