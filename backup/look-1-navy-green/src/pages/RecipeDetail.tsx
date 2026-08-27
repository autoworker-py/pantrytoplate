import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, api } from '../lib/api';
import type { CookPreview, MealSlot } from '../lib/types';
import { formatAmount } from '../lib/format';
import { IngredientPill } from '../components/StatusPill';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';

/**
 * Removing a recipe you added.
 *
 * Confirmed rather than instant, because the button sits next to "cook this"
 * and the two are not equally recoverable. The delete is soft on the server —
 * meals already in your diary keep this recipe's name — but from here it is
 * gone for good, so it should read that way.
 */
function DeleteRecipe({ id, name, onDeleted }: { id: string; name: string; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function run() {
    setBusy(true);
    try {
      await api.delete(`/api/recipes/${id}`);
      onDeleted();
    } catch {
      toast('Could not delete that recipe.');
      setBusy(false);
      setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        className="btn-ghost btn-sm"
        style={{ float: 'right', color: 'var(--red)' }}
        onClick={() => setConfirming(true)}
      >
        Delete
      </button>
    );
  }

  return (
    <div className="banner error">
      Delete {name} from your recipes? Meals you already cooked from it stay in your diary.
      <div className="btn-row" style={{ marginTop: 8 }}>
        <button type="button" className="btn-sm" style={{ background: 'var(--red)' }} onClick={run} disabled={busy}>
          Delete it
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setConfirming(false)} disabled={busy}>
          Keep it
        </button>
      </div>
    </div>
  );
}

export default function RecipeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [preview, setPreview] = useState<CookPreview | null>(null);
  const [servings, setServings] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [cooking, setCooking] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  /** ingredient food id -> the pantry item the user picked */
  const [choices, setChoices] = useState<Record<string, string>>({});
  /** ingredients the user does not want in this cook */
  const [excluded, setExcluded] = useState<string[]>([]);
  /**
   * Stand-ins chosen for tonight only. Deliberately not remembered: using oil
   * because the butter ran out says nothing about the recipe.
   */
  const [swaps, setSwaps] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const params = new URLSearchParams();
      if (servings) params.set('servings', String(servings));
      const picked = Object.entries(choices).map(([food, lot]) => `${food}:${lot}`).join(',');
      if (picked) params.set('choices', picked);
      if (excluded.length > 0) params.set('exclude', excluded.join(','));
      const swapped = Object.entries(swaps).map(([from, to]) => `${from}:${to}`).join(',');
      if (swapped) params.set('swap', swapped);

      const data = await api.get<{ preview: CookPreview }>(
        `/api/recipes/${id}/cook-preview${params.toString() ? `?${params}` : ''}`,
      );
      setPreview(data.preview);
      if (servings === null) setServings(data.preview.servingsCooked);
    } catch {
      setError('Could not load this recipe.');
    }
  }, [id, servings, choices, excluded, swaps]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addGapsToList() {
    try {
      const data = await api.post<{ added: Array<{ name: string }> }>(`/api/shopping-list/from-recipe/${id}`, {
        servings,
      });
      toast(
        data.added.length === 0
          ? 'Everything was already on your list.'
          : `Added ${data.added.length} item${data.added.length === 1 ? '' : 's'} to your shopping list.`,
      );
    } catch {
      toast('Could not update the shopping list.');
    }
  }

  if (error) return <div className="banner error">{error}</div>;
  if (!preview) return <div className="empty">Loading…</div>;

  const gaps = preview.ingredients.filter((ingredient) => ingredient.status !== 'ok');

  // after a swap the row *is* the stand-in, so a row is "swapped" when its food
  // is one we asked for in place of something else
  const swappedNames: Record<string, string> = {};
  for (const substituteId of Object.values(swaps)) swappedNames[substituteId] = substituteId;
  const activeSwaps = Object.entries(swaps);

  return (
    <>
      <button type="button" className="btn-ghost btn-sm" onClick={() => navigate(-1)}>
        ← Back
      </button>

      <h1 style={{ marginTop: 8 }}>{preview.name}</h1>
      {preview.isMine ? (
        <DeleteRecipe
          id={preview.id}
          name={preview.name}
          onDeleted={() => {
            toast(`Deleted ${preview.name}.`);
            navigate('/recipes');
          }}
        />
      ) : null}
      {preview.isMine ? (
        <p className="muted" style={{ margin: '0 0 6px' }}>
          <span className="pill mine">Your recipe</span>{' '}
          {preview.source === 'imported' ? 'You imported this one.' : 'You wrote this one.'}
        </p>
      ) : null}
      <p className="muted">{preview.description}</p>

      <div className="btn-row" style={{ marginBottom: 14 }}>
        {preview.totalMinutes ? <span className="pill neutral">{preview.totalMinutes} min</span> : null}
        {preview.difficulty ? <span className="pill neutral">{preview.difficulty}</span> : null}
        {preview.nutrition?.caloriesPerServing ? (
          <span className="pill neutral">{preview.nutrition.caloriesPerServing} kcal a serving</span>
        ) : null}
        {preview.nutrition?.proteinPerServing ? (
          <span className="pill neutral">{preview.nutrition.proteinPerServing}g protein</span>
        ) : null}
      </div>

      {activeSwaps.length > 0 ? (
        <div className="banner info">
          <strong>Swapped for tonight.</strong> The recipe is unchanged — next time it will ask for the
          original again.
          <button
            type="button"
            className="btn-ghost btn-sm"
            style={{ marginTop: 8 }}
            onClick={() => setSwaps({})}
          >
            Put {activeSwaps.length === 1 ? 'it' : 'them'} back
          </button>
        </div>
      ) : null}

      {preview.usesExpiring.length > 0 ? (
        <div className="banner success">
          Good choice — this uses {preview.usesExpiring.join(', ')} before it goes off.
        </div>
      ) : null}

      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <label htmlFor="servings" style={{ margin: 0 }}>
            Servings
          </label>
          <div className="btn-row">
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => setServings(Math.max(1, (servings ?? preview.servings) - 1))}
            >
              −
            </button>
            <strong style={{ minWidth: 24, textAlign: 'center' }}>{servings ?? preview.servings}</strong>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => setServings((servings ?? preview.servings) + 1)}
            >
              +
            </button>
          </div>
        </div>

        <ul className="list">
          {preview.ingredients.map((ingredient) => (
            <li key={ingredient.recipeIngredientId}>
              <div className="row">
                <div className="grow">
                  <div className="truncate">
                    {ingredient.name}
                    {swappedNames[ingredient.foodReferenceId] ? (
                      <span className="pill mine" style={{ marginLeft: 6 }}>swapped</span>
                    ) : null}
                  </div>
                  <div className="muted">
                    needs {formatAmount(ingredient.requiredQuantity, ingredient.requiredUnit)}
                    {ingredient.status === 'short'
                      ? ` · short ${formatAmount(ingredient.shortfall, ingredient.requiredUnit)}`
                      : ingredient.status === 'ok'
                        ? ` · you have ${formatAmount(ingredient.available, ingredient.requiredUnit)}`
                        : ''}
                  </div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <IngredientPill status={ingredient.status} />
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    title={`Leave ${ingredient.name} out`}
                    aria-label={`Leave ${ingredient.name} out`}
                    onClick={() => setExcluded((current) => [...current, ingredient.foodReferenceId])}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/*
                * Out of butter but holding oil. Only ever a suggestion: swapping
                * one fat for another changes the dish, and that is the cook's
                * call, not the app's.
                */}
              {ingredient.substitutes.length > 0 ? (
                <div className="substitutes">
                  <span className="muted">Or use what you have — just for tonight:</span>
                  {ingredient.substitutes.map((option) => (
                    <button
                      key={option.substituteId}
                      type="button"
                      className="substitute tappable"
                      aria-pressed={false}
                      onClick={() =>
                        setSwaps((current) => ({ ...current, [ingredient.foodReferenceId]: option.substituteId }))
                      }
                    >
                      <div className="grow">
                        <strong>
                          {formatAmount(option.quantity, option.unit)} {option.substituteName}
                        </strong>
                        {option.enough ? null : <span className="pill warn">not quite enough</span>}
                        {option.note ? <div className="muted">{option.note}</div> : null}
                      </div>
                      <span className="swap-cta">Use this</span>
                    </button>
                  ))}
                </div>
              ) : null}

              {/*
                * Two jars open, both valid. Choosing for them silently is a
                * decision the app should not make alone.
                */}
              {ingredient.options.length > 1 ? (
                <div className="option-picker">
                  <span className="muted">Use which one?</span>
                  <div className="btn-row">
                    {ingredient.options.map((option) => (
                      <button
                        key={option.inventoryItemId}
                        type="button"
                        className={`btn-secondary btn-sm ${option.chosen ? 'active' : ''}`}
                        onClick={() =>
                          setChoices((current) => ({
                            ...current,
                            [ingredient.foodReferenceId]: option.inventoryItemId,
                          }))
                        }
                      >
                        {option.name} ({formatAmount(option.quantity, option.unit)})
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      {preview.excludedIngredients.length > 0 ? (
        <div className="card tight">
          <div className="muted" style={{ marginBottom: 6 }}>
            Left out — calories below are without {preview.excludedIngredients.length === 1 ? 'it' : 'them'}
          </div>
          <div className="btn-row">
            {preview.excludedIngredients.map((ingredient) => (
              <button
                key={ingredient.foodReferenceId}
                type="button"
                className="btn-secondary btn-sm"
                onClick={() =>
                  setExcluded((current) => current.filter((id) => id !== ingredient.foodReferenceId))
                }
              >
                + {ingredient.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {preview.estimatedCalories !== null ? (
        <p className="muted">
          About {preview.estimatedCalories} kcal in total (
          {Math.round(preview.estimatedCalories / (servings ?? preview.servings))} per serving).
        </p>
      ) : null}

      <div className="btn-row" style={{ marginBottom: 16 }}>
        <button type="button" className="grow" disabled={preview.blocked} onClick={() => setConfirming(true)}>
          {preview.blocked ? 'Missing ingredients' : 'Cook this'}
        </button>
        {gaps.length > 0 ? (
          <button type="button" className="btn-secondary" onClick={addGapsToList}>
            Add {gaps.length} to shopping list
          </button>
        ) : null}
      </div>

      <div className="row" style={{ marginBottom: 6 }}>
        <h2 style={{ margin: 0 }}>Method</h2>
        <button type="button" className="btn-secondary btn-sm" onClick={() => setCooking(true)}>
          Cook mode
        </button>
      </div>
      <div className="card">
        {preview.instructions.split('\n').map((line) => (
          <p key={line} style={{ marginBottom: 8 }}>
            {line}
          </p>
        ))}
      </div>

      {cooking ? (
        <CookMode
          name={preview.name}
          steps={preview.instructions.split('\n').filter(Boolean)}
          onClose={() => setCooking(false)}
        />
      ) : null}

      <h2 style={{ marginTop: 20 }}>Cooked it?</h2>
      <div className="card">
        <div className="rating-row">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              className={`star ${rating !== null && value <= rating ? 'on' : ''}`}
              aria-label={`Rate ${value} out of 5`}
              onClick={async () => {
                setRating(value);
                await api.put(`/api/planning/ratings/${preview.id}`, { rating: value }).catch(() => undefined);
                toast(`Rated ${value}/5 — this will show up higher next time.`);
              }}
            >
              ★
            </button>
          ))}
        </div>
        <p className="muted" style={{ margin: '6px 0 0' }}>
          Things you rate well come up first in suggestions.
        </p>
      </div>

      {confirming ? (
        <CookConfirmation
          preview={preview}
          servings={servings}
          choices={choices}
          excluded={excluded}
          swaps={swaps}
          onClose={() => setConfirming(false)}
          onCooked={(message) => {
            setConfirming(false);
            toast(message);
            void load();
          }}
        />
      ) : null}
    </>
  );
}

/**
 * Nothing is deducted until this screen is confirmed. It shows every line the
 * app is about to change, so a bad unit conversion gets caught by a human
 * rather than silently corrupting the pantry.
 */
function CookConfirmation({
  preview,
  servings,
  choices,
  excluded,
  swaps,
  onClose,
  onCooked,
}: {
  preview: CookPreview;
  servings: number | null;
  choices: Record<string, string>;
  excluded: string[];
  swaps: Record<string, string>;
  onClose: () => void;
  onCooked: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keep, setKeep] = useState(0);
  const [mealSlot, setMealSlot] = useState<MealSlot>(() => {
    const hour = new Date().getHours();
    if (hour < 11) return 'breakfast';
    if (hour < 15) return 'lunch';
    return 'dinner';
  });

  async function cook() {
    setBusy(true);
    setError(null);
    try {
      const data = await api.post<{
        result: {
          deductions: unknown[];
          caloriesLogged: number | null;
          ranOut: Array<{ name: string }>;
          leftovers: { servings: number } | null;
        };
      }>(
        `/api/recipes/${preview.id}/cook`,
        { servings, mealSlot, choices, exclude: excluded, keepServings: keep, swaps },
      );
      const ranOut = data.result.ranOut ?? [];
      const restock = ranOut.length > 0
        ? ` ${ranOut.map((item) => item.name).join(', ')} ran out — added to your shopping list.`
        : '';
      const kept = data.result.leftovers
        ? ` ${data.result.leftovers.servings} portion${data.result.leftovers.servings === 1 ? '' : 's'} in the fridge.`
        : '';
      onCooked(
        (data.result.caloriesLogged === null
          ? `Cooked ${preview.name}. Pantry updated.`
          : `Cooked ${preview.name}. Logged ${data.result.caloriesLogged} kcal.`) + kept + restock,
      );
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not cook this recipe.');
      setBusy(false);
    }
  }

  return (
    <Sheet title="Confirm what gets used" onClose={onClose}>
      <p className="muted">
        Cooking {preview.servingsCooked} serving{preview.servingsCooked === 1 ? '' : 's'} will deduct:
      </p>

      {error ? <div className="banner error">{error}</div> : null}

      <div style={{ marginBottom: 14 }}>
        {preview.ingredients.flatMap((ingredient) =>
          ingredient.plan.deductions.map((deduction) => (
            <div className="deduction" key={deduction.inventoryItemId + ingredient.recipeIngredientId}>
              <div>
                <div>{ingredient.name}</div>
                <div className="muted">
                  −{formatAmount(deduction.quantityDeducted, deduction.unit)}
                </div>
              </div>
              <div className="after" style={{ textAlign: 'right' }}>
                <div className="muted">{formatAmount(deduction.quantityBefore, deduction.unit)}</div>
                <div>
                  <span className="arrow">→ </span>
                  <strong>{formatAmount(deduction.quantityAfter, deduction.unit)}</strong>
                </div>
              </div>
            </div>
          )),
        )}
      </div>

      {preview.servingsCooked > 1 ? (
        <div className="field">
          <label htmlFor="keep">
            Keeping any? {keep > 0 ? `${preview.servingsCooked - keep} eaten now, ${keep} in the fridge` : 'Eating it all'}
          </label>
          <input
            id="keep"
            type="range"
            min={0}
            max={preview.servingsCooked - 1}
            step={1}
            value={keep}
            onChange={(event) => setKeep(Number(event.target.value))}
          />
          <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
            Portions you keep go in the fridge as their own item, so you can eat one later — and only what you
            eat now counts towards today.
          </p>
        </div>
      ) : null}

      <label htmlFor="cook-meal">Log it as</label>
      <div className="segmented" id="cook-meal">
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

      {preview.ingredients.some((i) => i.plan.unconvertibleLots.length > 0) ? (
        <div className="banner info">
          Some of your items are in units the app cannot convert, so they were left alone. Check the amounts above
          before confirming.
        </div>
      ) : null}

      <button type="button" className="btn-block" onClick={cook} disabled={busy}>
        {busy ? 'Updating pantry…' : 'Confirm and cook'}
      </button>
      <button type="button" className="btn-ghost btn-block" onClick={onClose} disabled={busy}>
        Cancel
      </button>
    </Sheet>
  );
}

/**
 * Cooking, not reading.
 *
 * A recipe page is for deciding; this is for standing at the hob with greasy
 * hands. One step at a time, big enough to read from a step back, the screen
 * kept awake, and any duration in the step turned into a timer you can start
 * without hunting for your phone's clock app.
 */
function CookMode({ name, steps, onClose }: { name: string; steps: string[]; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  // keep the screen on while cooking, where the browser allows it
  useEffect(() => {
    let sentinel: { release: () => Promise<void> } | null = null;
    const wakeLock = (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<never> } })
      .wakeLock;
    if (wakeLock) {
      wakeLock
        .request('screen')
        .then((lock) => {
          sentinel = lock as unknown as { release: () => Promise<void> };
        })
        .catch(() => undefined);
    }
    return () => {
      void sentinel?.release().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    if (secondsLeft === null) return;
    if (secondsLeft <= 0) {
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      setSecondsLeft(null);
      return;
    }
    const timer = window.setTimeout(() => setSecondsLeft((current) => (current === null ? null : current - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [secondsLeft]);

  const step = steps[index] ?? '';
  // "simmer 18 minutes", "bake 10-12 minutes", "rest 5 minutes"
  const minutes = step.match(/(\d+)(?:\s*[-–]\s*(\d+))?\s*minutes?/i);
  const timerMinutes = minutes ? Number(minutes[2] ?? minutes[1]) : null;

  return (
    <div className="cook-mode">
      <div className="row" style={{ marginBottom: 18 }}>
        <div className="grow truncate">
          <strong>{name}</strong>
          <div className="muted">
            Step {index + 1} of {steps.length}
          </div>
        </div>
        <button type="button" className="btn-ghost" onClick={onClose} aria-label="Leave cook mode">
          ✕
        </button>
      </div>

      <p className="cook-step">{step.replace(/^\d+\.\s*/, '')}</p>

      {secondsLeft !== null ? (
        <div className="cook-timer">
          {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
          <button type="button" className="btn-ghost btn-sm" onClick={() => setSecondsLeft(null)}>
            Stop
          </button>
        </div>
      ) : timerMinutes ? (
        <button type="button" className="btn-secondary" onClick={() => setSecondsLeft(timerMinutes * 60)}>
          Start {timerMinutes} minute timer
        </button>
      ) : null}

      <div className="cook-nav">
        <button
          type="button"
          className="btn-secondary"
          disabled={index === 0}
          onClick={() => setIndex((current) => current - 1)}
        >
          Back
        </button>
        {index < steps.length - 1 ? (
          <button type="button" onClick={() => setIndex((current) => current + 1)}>
            Next step
          </button>
        ) : (
          <button type="button" onClick={onClose}>
            Done
          </button>
        )}
      </div>
    </div>
  );
}
