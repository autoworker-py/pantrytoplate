import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '../lib/api';
import type { DayDiary, DiaryEntry, EntryDetail, MealSlot } from '../lib/types';
import { formatAmount } from '../lib/format';
import { MacroDonut } from '../components/MacroDonut';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { Icon } from '../components/Icon';
import { EatOutSheet } from './EatOut';

const MEAL_LABEL: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
};

/**
 * Local calendar date, not UTC. toISOString() would roll the date backwards for
 * anyone west of Greenwich and show them yesterday's diary.
 */
function isoDate(date: Date) {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export default function Nutrition() {
  const [day, setDay] = useState(() => new Date());
  const [diary, setDiary] = useState<DayDiary | null>(null);
  const [week, setWeek] = useState<Array<{ date: string; totalCalories: number }>>([]);
  const [openEntry, setOpenEntry] = useState<string | null>(null);
  const [eatingOut, setEatingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const [today, history] = await Promise.all([
        api.get<DayDiary>(`/api/consumption/today?date=${isoDate(day)}`),
        api.get<{ days: Array<{ date: string; totalCalories: number }> }>('/api/consumption/history?days=7'),
      ]);
      setDiary(today);
      setWeek(history.days);
    } catch {
      setError('Could not load your diary.');
    }
  }, [day]);

  useEffect(() => {
    void load();
  }, [load]);

  const shiftDay = (days: number) => {
    const next = new Date(day);
    next.setDate(next.getDate() + days);
    if (next > new Date()) return;
    setDay(next);
  };

  if (error) return <div className="banner error">{error}</div>;
  if (!diary) return <div className="empty">Loading…</div>;

  const isToday = isoDate(day) === isoDate(new Date());
  const maxWeek = Math.max(1, ...week.map((d) => d.totalCalories));

  return (
    <>
      <div className="row" style={{ marginBottom: 8 }}>
        <h1 style={{ margin: 0 }}>Diary</h1>
        <button type="button" className="btn-sm" onClick={() => setEatingOut(true)}>
          + Add food
        </button>
      </div>

      <div className="daynav">
        <button type="button" className="btn-secondary btn-sm" onClick={() => shiftDay(-1)} aria-label="Previous day">
          <Icon name="arrow-left" size={18} />
        </button>
        <strong>
          {isToday
            ? 'Today'
            : day.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
        </strong>
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={() => shiftDay(1)}
          disabled={isToday}
          aria-label="Next day"
        >
          <Icon name="arrow-right" size={18} />
        </button>
      </div>

      <div className="card">
        <MacroDonut
          protein={diary.macroSplit.protein}
          carbs={diary.macroSplit.carbs}
          fat={diary.macroSplit.fat}
          calories={diary.totalCalories}
        />

        <div style={{ marginTop: 16 }}>
          <div className="row" style={{ marginBottom: 6 }}>
            <span className="muted">
              {diary.totalCalories} of {diary.targets.calories} kcal
            </span>
            <span className="muted">
              {diary.caloriesRemaining >= 0
                ? `${diary.caloriesRemaining} left`
                : `${Math.abs(diary.caloriesRemaining)} over`}
            </span>
          </div>
          <div className={`bar ${diary.caloriesRemaining < 0 ? 'over' : ''}`}>
            <span style={{ width: `${Math.min(100, (diary.totalCalories / diary.targets.calories) * 100)}%` }} />
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          {(
            [
              ['Protein', diary.macros.protein, diary.targets.protein],
              ['Carbs', diary.macros.carbs, diary.targets.carbs],
              ['Fat', diary.macros.fat, diary.targets.fat],
            ] as const
          ).map(([label, value, target]) => (
            <div className="macro-row" key={label}>
              <span className="muted">{label}</span>
              <div className={`bar ${value > target ? 'over' : ''}`}>
                <span style={{ width: `${Math.min(100, target > 0 ? (value / target) * 100 : 0)}%` }} />
              </div>
              <span className="muted">
                {Math.round(value)}/{target}g
              </span>
            </div>
          ))}
        </div>

        {diary.unknownCalorieEntries > 0 ? (
          <p className="muted" style={{ margin: '10px 0 0' }}>
            {diary.unknownCalorieEntries} entr{diary.unknownCalorieEntries === 1 ? 'y has' : 'ies have'} no
            nutrition data, so {diary.unknownCalorieEntries === 1 ? 'it is' : 'they are'} not counted above.
          </p>
        ) : null}
      </div>

      {diary.entryCount === 0 ? (
        <div className="empty">
          <div className="big"><Icon name="spike" size={40} /></div>
          <p>Nothing logged {isToday ? 'yet today' : 'that day'}.</p>
          {isToday ? (
            <button type="button" onClick={() => setEatingOut(true)}>
              Add something you ate
            </button>
          ) : null}
        </div>
      ) : (
        diary.meals
          .filter((meal) => meal.entries.length > 0)
          .map((meal) => (
            <div key={meal.slot}>
              <div className="meal-head">
                <span>{MEAL_LABEL[meal.slot]}</span>
                <span>{meal.calories} kcal</span>
              </div>
              <div className="card tight">
                <ul className="list">
                  {meal.entries.map((entry) => (
                    <EntryRow key={entry.id} entry={entry} onOpen={() => setOpenEntry(entry.id)} />
                  ))}
                </ul>
              </div>
            </div>
          ))
      )}

      <h2 style={{ marginTop: 22 }}>Last 7 days</h2>
      <div className="card">
        <div className="week">
          {week.map((entry) => (
            <div key={entry.date} title={`${entry.totalCalories} kcal`}>
              <div
                className={`col ${entry.date === isoDate(new Date()) ? 'today' : ''}`}
                style={{ height: `${Math.max(3, (entry.totalCalories / maxWeek) * 100)}%` }}
              />
              <span>{new Date(`${entry.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
            </div>
          ))}
        </div>
      </div>

      {openEntry ? (
        <EntrySheet
          entryId={openEntry}
          onClose={() => setOpenEntry(null)}
          onUndone={(message) => {
            setOpenEntry(null);
            toast(message);
            void load();
          }}
        />
      ) : null}

      {eatingOut ? (
        <EatOutSheet
          onClose={() => setEatingOut(false)}
          onLogged={(message) => {
            setEatingOut(false);
            toast(message);
            void load();
          }}
        />
      ) : null}
    </>
  );
}

function EntryRow({ entry, onOpen }: { entry: DiaryEntry; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        className="btn-ghost row"
        style={{ width: '100%', padding: 0, color: 'inherit' }}
        onClick={onOpen}
      >
        <div className="grow stack" style={{ textAlign: 'left' }}>
          <div className="truncate">
            {entry.kind === 'meal' ? <Icon name="skillet" size={15} className="inline-icon" /> : null}
            {entry.name}
          </div>
          <div className="muted">
            {entry.kind === 'meal'
              ? `${entry.ingredientCount} ingredient${entry.ingredientCount === 1 ? '' : 's'} · tap to see them`
              : formatAmount(entry.quantity, entry.unit)}
            {entry.source === 'eating_out' ? ' · not from your pantry' : ''}
          </div>
        </div>
        <div className="muted">{entry.calories === null ? '—' : `${entry.calories} kcal`}</div>
      </button>
    </li>
  );
}

/** Tap an entry: exactly where those calories came from, and an undo. */
function EntrySheet({
  entryId,
  onClose,
  onUndone,
}: {
  entryId: string;
  onClose: () => void;
  onUndone: (message: string) => void;
}) {
  const [entry, setEntry] = useState<EntryDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ entry: EntryDetail }>(`/api/consumption/${entryId}`)
      .then((data) => setEntry(data.entry))
      .catch(() => setError('Could not load that entry.'));
  }, [entryId]);

  async function undo() {
    setBusy(true);
    try {
      const data = await api.delete<{
        result: {
          name: string;
          restoredToPantry: { quantity: number; unit: string } | null;
          restoredItems: Array<{ name: string }>;
        };
      }>(`/api/consumption/${entryId}`);

      const { result } = data;
      onUndone(
        result.restoredItems.length > 1
          ? `Undone. ${result.restoredItems.length} ingredients put back in your pantry.`
          : result.restoredToPantry
            ? `Undone. ${result.name} is back at ${formatAmount(
                result.restoredToPantry.quantity,
                result.restoredToPantry.unit,
              )}.`
            : `Undone. ${result.name} removed from your diary.`,
      );
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not undo that.');
      setBusy(false);
    }
  }

  return (
    <Sheet title={entry?.name ?? 'Entry'} onClose={onClose}>
      {error ? <div className="banner error">{error}</div> : null}
      {!entry ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <p className="muted">
            {entry.kind === 'meal'
              ? `Cooked · ${entry.mealSlot}`
              : `${formatAmount(entry.quantity, entry.unit)} · ${entry.mealSlot}`}
            {entry.source === 'eating_out' ? ' · not from your pantry' : ''}
          </p>

          <div className="stat" style={{ marginBottom: 14 }}>
            <div>
              <div className="value">{entry.calories ?? '—'}</div>
              <div className="label">kcal</div>
            </div>
            <div>
              <div className="value">{entry.macros.protein ?? '—'}</div>
              <div className="label">protein g</div>
            </div>
            <div>
              <div className="value">{entry.macros.carbs ?? '—'}</div>
              <div className="label">carbs g</div>
            </div>
            <div>
              <div className="value">{entry.macros.fat ?? '—'}</div>
              <div className="label">fat g</div>
            </div>
          </div>

          {entry.nutritionBasis ? (
            <p className="muted">Worked out from {entry.nutritionBasis}.</p>
          ) : (
            <div className="banner info">
              We have no nutrition data for this food, so it is not counted in your totals.
            </div>
          )}

          {entry.recipe ? (
            <>
              <h3 style={{ marginTop: 16 }}>What went into it</h3>
              <p className="muted" style={{ marginTop: -4 }}>
                {entry.recipe.ingredients.length} ingredients, taken from your pantry when you cooked it.
              </p>
              <ul className="list">
                {entry.recipe.ingredients.map((ingredient) => (
                  <li key={ingredient.name} className="row">
                    <div className="grow truncate">{ingredient.name}</div>
                    <div className="muted">
                      {formatAmount(ingredient.quantity, ingredient.unit)}
                      {ingredient.calories === null ? '' : ` · ${ingredient.calories} kcal`}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="muted">
                {entry.recipe.name} — {entry.recipe.totalCalories} kcal in total.
              </p>
            </>
          ) : null}

          <button type="button" className="btn-secondary btn-block" onClick={undo} disabled={busy}>
            {entry.kind === 'meal'
              ? 'Undo the whole meal — put everything back'
              : entry.canUndo
                ? 'Undo — put it back in the pantry'
                : 'Undo — remove from diary'}
          </button>
        </>
      )}
    </Sheet>
  );
}
