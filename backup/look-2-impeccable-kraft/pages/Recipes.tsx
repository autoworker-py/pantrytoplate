import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, api } from '../lib/api';
import type { Ad, RecipeSummary } from '../lib/types';
import { AdCard } from '../components/AdCard';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { Icon } from '../components/Icon';

type Filter = 'all' | 'quick' | 'light' | 'nogaps' | 'mine';

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'Everything' },
  { key: 'nogaps', label: 'Can make now' },
  { key: 'mine', label: 'Your recipes' },
  { key: 'quick', label: 'Under 20 min' },
  { key: 'light', label: 'Under 400 kcal' },
];

export default function Recipes() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [recipes, setRecipes] = useState<RecipeSummary[] | null>(null);
  /** recipes the diet filter removed, so a short list is never unexplained */
  const [diet, setDiet] = useState<{ hidden: number; tags: string[] }>({ hidden: 0, tags: [] });
  const [ads, setAds] = useState<Ad[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const navigate = useNavigate();

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (filter === 'quick') params.set('maxMinutes', '20');
    if (filter === 'light') params.set('maxCalories', '400');
    if (filter === 'nogaps') params.set('maxGaps', '0');
    if (filter === 'mine') params.set('mine', '1');

    try {
      const [list, adResult] = await Promise.all([
        api.get<{ recipes: RecipeSummary[]; dietHidden: number; dietTags: string[] }>(
          `/api/recipes?${params.toString()}`,
        ),
        api.get<{ ads: Ad[] }>('/api/ads?slot=recipes'),
      ]);
      setRecipes(list.recipes);
      setDiet({ hidden: list.dietHidden ?? 0, tags: list.dietTags ?? [] });
      setAds(adResult.ads);
    } catch {
      setError('Could not load recipes.');
    }
  }, [query, filter]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function addGaps(recipe: { id: string; name: string }) {
    try {
      const data = await api.post<{ added: Array<{ name: string }> }>(
        `/api/shopping-list/from-recipe/${recipe.id}`,
        {},
      );
      toast(
        data.added.length === 0
          ? 'Already on your list.'
          : `Added ${data.added.map((a) => a.name).join(', ')} to your shopping list.`,
      );
    } catch {
      toast('Could not update the shopping list.');
    }
  }

  if (error) return <div className="banner error">{error}</div>;

  /**
   * Every section is a slice of the same ranked list, split by how many
   * ingredients are missing. Previously the near-miss shelf came from a
   * separate capped query, so the seventh recipe you were one item short of
   * appeared under "missing a few things" — which read as a bug, because it was.
   */
  const useItUp = recipes?.filter((r) => r.canMakeNow && r.usesExpiring.length > 0) ?? [];
  const ready = recipes?.filter((r) => r.canMakeNow && r.usesExpiring.length === 0) ?? [];
  const nearly = recipes?.filter((r) => !r.canMakeNow && r.gaps <= 2) ?? [];
  const rest = recipes?.filter((r) => !r.canMakeNow && r.gaps > 2) ?? [];

  return (
    <>
      <div className="row" style={{ marginBottom: 10 }}>
        <h1 style={{ margin: 0 }}>Recipes</h1>
        <button type="button" className="btn-secondary btn-sm" onClick={() => setImporting(true)}>
          Import a link
        </button>
      </div>

      <div className="field">
        <input
          type="search"
          placeholder="Search recipes — try “omelette”"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className="filters">
        {FILTERS.map((option) => (
          <button
            key={option.key}
            type="button"
            className={filter === option.key ? 'active' : ''}
            onClick={() => setFilter(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {diet.hidden > 0 ? (
        <div className="banner info">
          {diet.hidden} recipe{diet.hidden === 1 ? '' : 's'} hidden by your{' '}
          {diet.tags.join(' and ')} setting. Recipes you added yourself are always shown.{' '}
          <Link to="/settings">Change it</Link>
        </div>
      ) : null}

      {!recipes ? (
        <div className="empty">Loading…</div>
      ) : recipes.length === 0 && filter === 'mine' && !query ? (
        <div className="empty">
          <div className="big"><Icon name="book" size={40} /></div>
          <p>You have not added any recipes of your own yet.</p>
          <button type="button" className="btn" onClick={() => setImporting(true)}>
            Import one from a link
          </button>
        </div>
      ) : recipes.length === 0 ? (
        <div className="empty">
          <div className="big"><Icon name="search" size={40} /></div>
          <p>Nothing matches{query ? ` “${query}”` : ' those filters'}.</p>
        </div>
      ) : (
        <>
          {useItUp.length > 0 ? (
            <>
              <h2>Use it up first</h2>
              {useItUp.map((recipe) => (
                <RecipeCard key={recipe.id} recipe={recipe} />
              ))}
            </>
          ) : null}

          {ready.length > 0 ? (
            <>
              <h2 style={{ marginTop: useItUp.length > 0 ? 20 : 0 }}>You can make these now</h2>
              {ready.map((recipe) => (
                <RecipeCard key={recipe.id} recipe={recipe} />
              ))}
            </>
          ) : null}

          {ads.map((ad) => (
            <AdCard key={ad.id} ad={ad} />
          ))}

          {nearly.length > 0 ? (
            <>
              <h2 style={{ marginTop: 20 }}>
                {nearly.length === 1 ? 'One item away' : 'One or two items away'}
              </h2>
              {nearly.map((recipe) => (
                <div className="card" key={recipe.id}>
                  <div className="row top">
                    <div className="grow">
                      <h3 style={{ marginBottom: 2 }}>
                        <Link to={`/recipes/${recipe.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                          {recipe.name}
                        </Link>
                        {recipe.isMine ? <MineBadge /> : null}
                      </h3>
                      <p className="muted" style={{ margin: 0 }}>
                        Missing {recipe.missing.join(', ')}
                        {recipe.totalMinutes ? ` \u00b7 ${recipe.totalMinutes} min` : ''}
                      </p>
                    </div>
                    <span className="pill warn">Need {recipe.gaps}</span>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    style={{ marginTop: 10 }}
                    onClick={() => addGaps(recipe)}
                  >
                    + Add {recipe.gaps === 1 ? 'it' : 'them'} to shopping list
                  </button>
                </div>
              ))}
            </>
          ) : null}

          {rest.length > 0 ? (
            <>
              <h2 style={{ marginTop: 20 }}>Missing three or more</h2>
              {rest.map((recipe) => (
                <RecipeCard key={recipe.id} recipe={recipe} />
              ))}
            </>
          ) : null}
        </>
      )}

      {importing ? (
        <ImportSheet
          onClose={() => setImporting(false)}
          onImported={(recipeId, message) => {
            setImporting(false);
            toast(message);
            // you imported it to read it — go straight there
            navigate(`/recipes/${recipeId}`);
          }}
        />
      ) : null}
    </>
  );
}

/**
 * Marks a recipe as one you put there yourself. Worth saying out loud: the app
 * ships with a few hundred recipes, so without it your own import is just
 * another row in a list you did not write.
 */
export function MineBadge() {
  return (
    <span className="pill mine" style={{ marginLeft: 8, verticalAlign: 'middle' }}>
      Your recipe
    </span>
  );
}

function RecipeCard({ recipe }: { recipe: RecipeSummary }) {
  const meta = [
    recipe.totalMinutes ? `${recipe.totalMinutes} min` : null,
    recipe.nutrition?.caloriesPerServing ? `${recipe.nutrition.caloriesPerServing} kcal` : null,
    recipe.nutrition?.proteinPerServing ? `${recipe.nutrition.proteinPerServing}g protein` : null,
  ].filter(Boolean);

  return (
    <Link
      to={`/recipes/${recipe.id}`}
      className="card"
      style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}
    >
      <div className="row top">
        <div className="grow">
          <h3 style={{ marginBottom: 2 }}>
            {recipe.name}
            {recipe.isMine ? <MineBadge /> : null}
          </h3>
          <p className="muted" style={{ margin: 0 }}>
            {meta.join(' · ')}
          </p>
        </div>
        <span className={`pill ${recipe.canMakeNow ? '' : recipe.gaps <= 2 ? 'warn' : 'danger'}`}>
          {recipe.canMakeNow ? 'Ready' : `Need ${recipe.gaps}`}
        </span>
      </div>

      {recipe.usesExpiring.length > 0 ? (
        <div className="reason-note">Uses {recipe.usesExpiring.join(', ')} before it goes off</div>
      ) : null}

      {!recipe.canMakeNow && recipe.missing.length > 0 ? (
        <p className="muted" style={{ margin: '8px 0 0' }}>
          Missing: {recipe.missing.slice(0, 4).join(', ')}
          {recipe.missing.length > 4 ? `, +${recipe.missing.length - 4} more` : ''}
        </p>
      ) : null}
    </Link>
  );
}

/** Paste a link: we read the structured recipe data the page already publishes. */
function ImportSheet({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (recipeId: string, message: string) => void;
}) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const data = await api.post<{
        recipe: { id: string; name: string };
        ingredientCount: number;
        newFoods: string[];
      }>('/api/recipes/import', { url: url.trim() });

      onImported(
        data.recipe.id,
        `Imported ${data.recipe.name} — ${data.ingredientCount} ingredients` +
          (data.newFoods.length > 0 ? `, ${data.newFoods.length} new to your catalog.` : '.'),
      );
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not import that link.');
      setBusy(false);
    }
  }

  return (
    <Sheet title="Import a recipe" onClose={onClose}>
      <p className="muted">
        Paste a link from a recipe site. We read the structured recipe data the page publishes — ingredients,
        times and method — and match the ingredients to your pantry.
      </p>

      {error ? <div className="banner error">{error}</div> : null}

      <div className="field">
        <label htmlFor="url">Recipe link</label>
        <input
          id="url"
          type="url"
          inputMode="url"
          placeholder="https://…"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
      </div>

      <button type="button" className="btn-block" onClick={run} disabled={busy || url.trim().length < 8}>
        {busy ? 'Reading the page…' : 'Import'}
      </button>
      <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
        Saved to your collection only — nobody else using this app sees it. We will open it once it is in.
      </p>
    </Sheet>
  );
}
