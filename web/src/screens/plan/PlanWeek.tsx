import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { done } from '../../lib/native';
import type { RecipeSummary } from '../../lib/types';
import { BackButton, Page, Sheet, errorText, useToast } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import { ProPreview } from '../pro/ProPreview';
import { PlannerDemo } from '../pro/demos';
import '../order/order.css';
import './plan.css';

/*
 * Plan my week: the coming week on one strip of receipt paper, a line a day.
 * Tap a day to give it a dinner; other meals tuck in under it. Whatever the
 * plan needs and the pantry doesn't have goes on the shopping list by itself,
 * and comes off again with the meal (the server keeps the two in step).
 */

type Slot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
interface PlanEntry {
  id: string;
  recipeId: string;
  recipeName: string;
  /** the calendar day, YYYY-MM-DD */
  plannedFor: string;
  servings: number;
  mealSlot: Slot;
  cooked: boolean;
  totalMinutes: number | null;
}

const SLOTS: Slot[] = ['dinner', 'lunch', 'breakfast', 'snack'];
const SLOT_ORDER: Record<Slot, number> = { breakfast: 0, lunch: 1, snack: 2, dinner: 3 };
const SLOT_NAME: Record<Slot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };
/** this week and the three after: as far ahead as the shopping list looks */
const WEEKS_AHEAD = 3;

/** the person's own calendar day, never UTC's */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10);
}
/** a calendar day read as itself, whatever the zone */
const said = (day: string, options: Intl.DateTimeFormatOptions) => new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { ...options, timeZone: 'UTC' });
const shortDay = (day: string) => `${said(day, { weekday: 'short' })} ${Number(day.slice(8))}`;
const longDay = (day: string) => said(day, { weekday: 'long', day: 'numeric', month: 'long' });

export default function PlanWeek() {
  const { user } = useAuth();
  const [locked, setLocked] = useState(false);
  return (
    <Page left={<BackButton />} title="Plan my week" className="plan-page">
      {user?.plus === false || locked ? <PlannerPreview /> : <Planner onLocked={() => setLocked(true)} />}
    </Page>
  );
}

function PlannerPreview() {
  return (
    <ProPreview
      name="Plan my week"
      demo={<PlannerDemo />}
      title={<>Plan the week.<br />Shop once.</>}
      lead="Pick a meal for each day. What you don’t have goes on your shopping list by itself."
      points={['The whole week on one receipt', 'Uses what’s in your pantry first', 'Take a meal off and its shopping goes too']}
      cta="Start 7-day free trial"
    />
  );
}

function Planner({ onLocked }: { onLocked: () => void }) {
  const toast = useToast();
  const now = useMemo(today, []);
  const [week, setWeek] = useState(0);
  const from = addDays(now, week * 7);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(from, i)), [from]);
  const [entries, setEntries] = useState<PlanEntry[] | null>(null);
  const [toBuy, setToBuy] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState<{ day: string; slot: Slot } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api.get<{ entries: PlanEntry[]; toBuy: number }>(`/api/planning/plan?from=${from}&days=7`);
      setEntries(d.entries);
      setToBuy(d.toBuy);
      setError(null);
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'plus_required') onLocked();
      else setError(errorText(cause, 'The plan could not be loaded. Try again.'));
    }
  }, [from, onLocked]);

  useEffect(() => {
    setEntries(null);
    void load();
  }, [load]);

  const byDay = useMemo(() => {
    const map = new Map<string, PlanEntry[]>();
    for (const entry of entries ?? []) map.set(entry.plannedFor, [...(map.get(entry.plannedFor) ?? []), entry]);
    for (const list of map.values()) list.sort((a, b) => SLOT_ORDER[a.mealSlot] - SLOT_ORDER[b.mealSlot]);
    return map;
  }, [entries]);

  async function add(recipe: RecipeSummary, day: string, slot: Slot) {
    try {
      const before = toBuy;
      const d = await api.post<{ toBuy: number }>('/api/planning/plan', { recipeId: recipe.id, plannedFor: day, mealSlot: slot });
      setPicking(null);
      done();
      const more = d.toBuy - before;
      toast(`${recipe.name} on ${said(day, { weekday: 'long' })}.${more > 0 ? ` ${more} more on your shopping list.` : ''}`);
      await load();
    } catch (cause) {
      toast(errorText(cause, 'It could not be added. Try again.'));
    }
  }

  async function remove(entry: PlanEntry) {
    try {
      await api.delete(`/api/planning/plan/${entry.id}`);
      setOpen(null);
      toast(`${entry.recipeName} is off the plan, and its shopping is off your list.`, {
        label: 'Undo',
        run: () => {
          void api
            .post('/api/planning/plan', { recipeId: entry.recipeId, plannedFor: entry.plannedFor, mealSlot: entry.mealSlot, servings: entry.servings })
            .then(load)
            .catch(() => toast('It could not be put back.'));
        },
      });
      await load();
    } catch (cause) {
      toast(errorText(cause, 'It could not be taken off. Try again.'));
    }
  }

  const last = days[6]!;
  const range = `${shortDay(from)} – ${shortDay(last)} ${said(last, { month: 'short' })}`;

  return (
    <>
      <div className="ticket-stage plan-stage">
        <div className="ticket plan-receipt">
          <div className="t-head">
            <b>My week</b>
            <span>{range}</span>
          </div>
          {error ? (
            <p className="t-hint plan-error">{error}</p>
          ) : (
            days.map((day) => {
              const meals = byDay.get(day) ?? [];
              const dinner = meals.find((m) => m.mealSlot === 'dinner');
              const others = meals.filter((m) => m !== dinner);
              const label = day === now ? 'Today' : shortDay(day);
              return (
                <div key={day} className={`plan-day${day === now ? ' today' : ''}`}>
                  <button
                    type="button"
                    className="t-line"
                    disabled={entries === null}
                    aria-label={dinner ? `${longDay(day)}: ${dinner.recipeName}` : `${longDay(day)}: pick a dinner`}
                    onClick={() => (dinner ? setOpen(day) : setPicking({ day, slot: 'dinner' }))}
                  >
                    <span className="k">{label}</span>
                    <span className="dots" />
                    <span className={`v${dinner ? '' : ' unset'}${dinner?.cooked ? ' cooked' : ''}`}>
                      <span className="vt">{entries === null ? '…' : dinner ? dinner.recipeName : '+ pick dinner'}</span>
                    </span>
                  </button>
                  {others.map((meal) => (
                    <button key={meal.id} type="button" className="t-line plan-extra" aria-label={`${longDay(day)}, ${SLOT_NAME[meal.mealSlot]}: ${meal.recipeName}`} onClick={() => setOpen(day)}>
                      <span className="k">{SLOT_NAME[meal.mealSlot]}</span>
                      <span className="dots" />
                      <span className={`v${meal.cooked ? ' cooked' : ''}`}><span className="vt">{meal.recipeName}</span></span>
                    </button>
                  ))}
                </div>
              );
            })
          )}
          <div className="t-rule">Shopping</div>
          <Link to="/shopping" className="t-line plan-buy">
            <span className="k">To buy</span>
            <span className="dots" />
            <span className="v num">{toBuy}</span>
          </Link>
          <p className="t-hint">{toBuy ? 'On your shopping list, ready for the shop.' : 'Plan a meal and what you don’t have goes on your list.'}</p>
        </div>
      </div>

      <div className="btn-row plan-weeks">
        <button type="button" className="btn secondary" disabled={week === 0} onClick={() => setWeek((w) => w - 1)}>
          <Icon name="back" size={18} /> Earlier
        </button>
        <button type="button" className="btn secondary" disabled={week === WEEKS_AHEAD} onClick={() => setWeek((w) => w + 1)}>
          Later <Icon name="chevron" size={18} />
        </button>
      </div>

      {picking ? <PickSheet day={picking.day} slot={picking.slot} onPick={(recipe, slot) => void add(recipe, picking.day, slot)} onClose={() => setPicking(null)} /> : null}
      {open ? (
        <DaySheet
          day={open}
          meals={byDay.get(open) ?? []}
          onRemove={(entry) => void remove(entry)}
          onAdd={(slot) => {
            setOpen(null);
            setPicking({ day: open, slot });
          }}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}

/** One day's meals: open one, take one off, or add another. */
function DaySheet({
  day,
  meals,
  onRemove,
  onAdd,
  onClose,
}: {
  day: string;
  meals: PlanEntry[];
  onRemove: (entry: PlanEntry) => void;
  onAdd: (slot: Slot) => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const hasDinner = meals.some((m) => m.mealSlot === 'dinner');
  return (
    <Sheet title={longDay(day)} onClose={onClose}>
      <div className="group">
        {meals.map((meal) => (
          <div key={meal.id} className="list-row">
            <button type="button" className="grow plan-open" onClick={() => navigate(`/recipes/${meal.recipeId}`)}>
              <span className="t">{meal.recipeName}</span>
              <span className="s">
                {SLOT_NAME[meal.mealSlot]} · serves {meal.servings}
                {meal.totalMinutes ? ` · ${meal.totalMinutes} min` : ''}
                {meal.cooked ? ' · cooked' : ''}
              </span>
            </button>
            <button type="button" className="icon-btn" aria-label={`Take ${meal.recipeName} off the plan`} onClick={() => onRemove(meal)}>
              <Icon name="trash" size={19} />
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="btn secondary block" style={{ marginTop: 16 }} onClick={() => onAdd(hasDinner ? 'lunch' : 'dinner')}>
        <Icon name="plus" size={18} /> Add a meal
      </button>
    </Sheet>
  );
}

/** Choosing a recipe for a day: what's ready to cook comes first. */
function PickSheet({
  day,
  slot,
  onPick,
  onClose,
}: {
  day: string;
  slot: Slot;
  onPick: (recipe: RecipeSummary, slot: Slot) => void;
  onClose: () => void;
}) {
  const [meal, setMeal] = useState<Slot>(slot);
  const [q, setQ] = useState('');
  const [recipes, setRecipes] = useState<RecipeSummary[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ limit: '40' });
      if (q.trim()) params.set('q', q.trim());
      api
        .get<{ recipes: RecipeSummary[] }>(`/api/recipes?${params.toString()}`)
        .then((d) => live && (setRecipes(d.recipes), setFailed(false)))
        .catch(() => live && setFailed(true));
    }, q ? 250 : 0);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [q]);

  return (
    <Sheet title={longDay(day)} sub="Anything you don’t have goes on your shopping list." onClose={onClose}>
      <div className="chips" role="radiogroup" aria-label="Meal">
        {SLOTS.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={meal === s} className={`chip${meal === s ? ' on' : ''}`} onClick={() => setMeal(s)}>
            {SLOT_NAME[s]}
          </button>
        ))}
      </div>
      <div className="search" style={{ marginTop: 12 }}>
        <Icon name="search" size={19} />
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search recipes, or an ingredient" aria-label="Search recipes" />
      </div>
      <div className="group plan-pick">
        {failed ? (
          <p className="muted" style={{ padding: '14px 0' }}>Recipes could not be loaded. Check your connection.</p>
        ) : recipes === null ? (
          <>
            <div className="skeleton" style={{ height: 52, marginTop: 10 }} />
            <div className="skeleton" style={{ height: 52, marginTop: 8 }} />
            <div className="skeleton" style={{ height: 52, marginTop: 8 }} />
          </>
        ) : recipes.length === 0 ? (
          <p className="muted" style={{ padding: '14px 0' }}>No recipes match that.</p>
        ) : (
          recipes.map((recipe) => (
            <button key={recipe.id} type="button" className="list-row" onClick={() => onPick(recipe, meal)}>
              <span className="grow">
                <span className="t">{recipe.name}</span>
                <span className="s">
                  {recipe.canMakeNow ? 'Ready to cook' : `${recipe.gaps} to buy`}
                  {recipe.totalMinutes ? ` · ${recipe.totalMinutes} min` : ''}
                </span>
              </span>
              <Icon name="plus" size={18} className="faint" />
            </button>
          ))
        )}
      </div>
    </Sheet>
  );
}
