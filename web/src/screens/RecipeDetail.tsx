import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { CookPreview, IngredientMatch } from '../lib/types';
import { formatAmount } from '../lib/format';
import { FoodThumb } from '../fridge/Fridge';
import { Icon } from '../ui/Icon';
import { BackButton, Page, Stepper, errorText, useToast } from '../ui/kit';
import { CookMode, CookSheet, NO_ADJUSTMENTS, parseSteps, previewPath, type Adjustments } from './cooking';

const STATUS: Record<IngredientMatch['status'], { text: string; tone: string }> = {
  ok: { text: 'Have it', tone: 'ok' },
  short: { text: 'Short', tone: 'soon' },
  missing: { text: 'Missing', tone: 'red' },
  unknown_conversion: { text: 'Check units', tone: 'info' },
};

export default function RecipeDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [adj, setAdj] = useState<Adjustments>(NO_ADJUSTMENTS);
  const [preview, setPreview] = useState<CookPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [cookMode, setCookMode] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async (fresh = false) => {
    try {
      const path = previewPath(id, adj);
      const data = fresh ? await api.getFresh<{ preview: CookPreview }>(path) : await api.get<{ preview: CookPreview }>(path);
      setPreview(data.preview);
      setError(null);
    } catch (cause) {
      setError(errorText(cause, 'Could not load this recipe.'));
    }
  }, [id, adj]);

  useEffect(() => { void load(); }, [load]);

  const steps = useMemo(() => (preview ? parseSteps(preview.instructions) : []), [preview]);
  const gaps = preview ? preview.ingredients.filter((i) => i.status !== 'ok') : [];
  const swapped = new Set(Object.values(adj.swaps));
  const servings = adj.servings ?? preview?.servingsCooked ?? 1;

  async function addGaps() {
    try {
      const data = await api.post<{ added: Array<{ name: string }> }>(`/api/shopping-list/from-recipe/${id}`, { servings });
      toast(data.added.length ? `Added ${data.added.length} ${data.added.length === 1 ? 'thing' : 'things'} to your shopping list.` : 'Everything was already on your list.');
    } catch (cause) {
      toast(errorText(cause, 'Could not update your list.'));
    }
  }

  async function rate(value: number) {
    setRating(value);
    try {
      await api.put(`/api/planning/ratings/${id}`, { rating: value });
      toast(value >= 4 ? `Rated ${value} of 5. It will come up sooner.` : `Rated ${value} of 5.`);
    } catch {
      toast('Could not save that rating.');
    }
  }

  async function remove() {
    try {
      await api.delete(`/api/recipes/${id}`);
      toast(`Deleted ${preview?.name}. Meals you cooked from it stay in your diary.`);
      navigate('/recipes', { replace: true });
    } catch (cause) {
      toast(errorText(cause, 'Could not delete that recipe.'));
    }
  }

  return (
    <Page
      left={<BackButton fallback="/recipes" />}
      right={steps.length ? <button type="button" className="pill-btn" onClick={() => setCookMode(true)}><Icon name="timer" size={17} /> Cook mode</button> : null}
      className="recipe-page"
    >
      {error ? <div className="banner error">{error}</div> : null}
      {!preview ? (
        !error ? <RecipeSkeleton /> : null
      ) : (
        <>
          <header className="recipe-hero">
            {preview.isMine ? <span className="tag info">{preview.source === 'imported' ? 'You imported this' : 'Your recipe'}</span> : null}
            <h1 className="title-xl">{preview.name}</h1>
            {preview.description ? <p className="muted">{preview.description}</p> : null}
            <div className="meta-row">
              {preview.totalMinutes ? <span><Icon name="clock" size={16} /> {preview.totalMinutes} min</span> : null}
              {preview.nutrition?.caloriesPerServing ? <span><Icon name="flame" size={16} /> {Math.round(preview.nutrition.caloriesPerServing)} kcal</span> : null}
              {preview.nutrition?.proteinPerServing ? <span>{Math.round(preview.nutrition.proteinPerServing)} g protein</span> : null}
              {preview.difficulty ? <span className="cap">{preview.difficulty}</span> : null}
            </div>
          </header>

          {preview.usesExpiring.length ? (
            <div className="banner warm" style={{ marginTop: 16 }}>Uses {preview.usesExpiring.join(', ').toLowerCase()} before {preview.usesExpiring.length === 1 ? 'it goes' : 'they go'} off.</div>
          ) : null}
          {Object.keys(adj.swaps).length ? (
            <div className="banner" style={{ marginTop: 12 }}>
              <strong>Swapped for tonight.</strong> The recipe itself is unchanged.{' '}
              <button type="button" className="link-btn" onClick={() => setAdj((a) => ({ ...a, swaps: {} }))}>Put {Object.keys(adj.swaps).length === 1 ? 'it' : 'them'} back</button>
            </div>
          ) : null}

          <div className="section">
            <h2>Ingredients</h2>
            <Stepper value={servings} onChange={(v) => setAdj((a) => ({ ...a, servings: v }))} min={1} max={24} label="servings" format={(v) => `${v} ${v === 1 ? 'serving' : 'servings'}`} />
          </div>

          <div className="ingredients">
            {preview.ingredients.map((ing) => {
              const s = STATUS[ing.status];
              return (
                <div className={`ing${ing.status === 'ok' ? '' : ' gap'}`} key={ing.recipeIngredientId}>
                  <div className="ing-row">
                    <span className="thumb"><FoodThumb name={ing.name} category={null} size={32} /></span>
                    <span className="grow">
                      <span className="t">{ing.name}{swapped.has(ing.foodReferenceId) ? <span className="tag info" style={{ marginLeft: 8 }}>Swapped</span> : null}</span>
                      <span className="s">
                        {formatAmount(ing.requiredQuantity, ing.requiredUnit)}
                        {ing.status === 'short' ? ` · short ${formatAmount(ing.shortfall, ing.requiredUnit)}` : ing.status === 'ok' ? ` · you have ${formatAmount(ing.available, ing.requiredUnit)}` : ''}
                        {ing.note ? ` · ${ing.note}` : ''}
                      </span>
                    </span>
                    <span className={`tag ${s.tone}`}>{s.text}</span>
                    <button type="button" className="icon-btn plain leave" aria-label={`Leave ${ing.name} out`} onClick={() => setAdj((a) => ({ ...a, exclude: [...a.exclude, ing.foodReferenceId] }))}>
                      <Icon name="close" size={16} />
                    </button>
                  </div>
                  {ing.status === 'unknown_conversion' ? (
                    <p className="ing-note">You have some, but in a unit the app will not guess a conversion for. Check the amount in your pantry before cooking.</p>
                  ) : null}
                  {ing.substitutes.length ? (
                    <div className="swaps">
                      <span className="fine">Or use what you have, just for tonight:</span>
                      {ing.substitutes.map((o) => (
                        <button key={o.substituteId} type="button" className="swap-opt" onClick={() => setAdj((a) => ({ ...a, swaps: { ...a.swaps, [ing.foodReferenceId]: o.substituteId } }))}>
                          <span className="grow">
                            <span className="t">{formatAmount(o.quantity, o.unit)} {o.substituteName}{o.enough ? '' : <span className="tag soon" style={{ marginLeft: 8 }}>Not quite enough</span>}</span>
                            {o.note ? <span className="s">{o.note}</span> : null}
                          </span>
                          <span className="link-btn">Use this</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {ing.options.length > 1 ? (
                    <div className="swaps">
                      <span className="fine">Use which one?</span>
                      <div className="chips">
                        {ing.options.map((o) => (
                          <button key={o.inventoryItemId} type="button" className={`chip${o.chosen ? ' on' : ''}`} onClick={() => setAdj((a) => ({ ...a, choices: { ...a.choices, [ing.foodReferenceId]: o.inventoryItemId } }))}>
                            {o.name} · {formatAmount(o.quantity, o.unit)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {preview.excludedIngredients.length ? (
            <div className="left-out">
              <span className="fine">Left out tonight. Calories are without {preview.excludedIngredients.length === 1 ? 'it' : 'them'}:</span>
              <div className="chips" style={{ marginTop: 8 }}>
                {preview.excludedIngredients.map((x) => (
                  <button key={x.foodReferenceId} type="button" className="chip" onClick={() => setAdj((a) => ({ ...a, exclude: a.exclude.filter((e) => e !== x.foodReferenceId) }))}>
                    <Icon name="plus" size={15} /> {x.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {preview.estimatedCalories !== null ? (
            <p className="fine" style={{ marginTop: 14 }}>About {Math.round(preview.estimatedCalories)} kcal in all, {Math.round(preview.estimatedCalories / servings)} a serving.</p>
          ) : null}

          <div className="cook-bar">
            {preview.blocked ? (
              <button type="button" className="btn" onClick={addGaps}>Add {gaps.length} to shopping list</button>
            ) : (
              <>
                <button type="button" className="btn" onClick={() => setConfirming(true)}>Cook this</button>
                {gaps.length ? <button type="button" className="btn secondary" onClick={addGaps}>Add {gaps.length} to list</button> : null}
              </>
            )}
          </div>

          {steps.length ? (
            <>
              <div className="section"><h2>Method</h2><span className="aside">{steps.length} steps</span></div>
              <ol className="method">
                {steps.map((step, i) => <li key={`${i}-${step.slice(0, 16)}`}><span className="n num">{i + 1}</span><span>{step}</span></li>)}
              </ol>
            </>
          ) : null}

          <div className="section"><h2>Cooked it?</h2></div>
          <div className="stars" role="group" aria-label="Rate this recipe">
            {[1, 2, 3, 4, 5].map((v) => (
              <button key={v} type="button" className={`star${rating !== null && v <= rating ? ' on' : ''}`} aria-label={`Rate ${v} out of 5`} onClick={() => void rate(v)}>
                <Icon name="star" size={28} />
              </button>
            ))}
          </div>
          <p className="fine" style={{ marginTop: 6 }}>What you rate well comes up first.</p>

          {preview.isMine ? (
            deleting ? (
              <div className="banner error" style={{ marginTop: 22 }}>
                Delete {preview.name}? Meals you already cooked from it stay in your diary.
                <div className="btn-row" style={{ marginTop: 10 }}>
                  <button type="button" className="btn small danger" onClick={remove}>Delete it</button>
                  <button type="button" className="btn small ghost" onClick={() => setDeleting(false)}>Keep it</button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn ghost danger-ink" style={{ marginTop: 18 }} onClick={() => setDeleting(true)}><Icon name="trash" size={18} /> Delete this recipe</button>
            )
          ) : null}
        </>
      )}

      {confirming && preview ? (
        <CookSheet preview={preview} adjustments={adj} onClose={() => setConfirming(false)} onCooked={() => { setConfirming(false); void load(true); }} />
      ) : null}
      {cookMode && preview ? <CookMode name={preview.name} steps={steps} onClose={() => setCookMode(false)} /> : null}
    </Page>
  );
}

function RecipeSkeleton() {
  return (
    <div>
      <div className="skeleton" style={{ height: 34, width: '80%', marginTop: 8 }} />
      <div className="skeleton" style={{ height: 18, width: '60%', marginTop: 12 }} />
      <div className="skeleton" style={{ height: 240, marginTop: 28 }} />
    </div>
  );
}
