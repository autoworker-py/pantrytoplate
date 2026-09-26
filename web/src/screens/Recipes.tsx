import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { RecipeSummary } from '../lib/types';
import { FoodThumb } from '../fridge/Fridge';
import { Icon } from '../ui/Icon';
import { BackButton, Empty, Page, Sheet, errorText, useToast } from '../ui/kit';

type Filter = 'all' | 'ready' | 'quick' | 'light' | 'mine';
const FILTERS: Array<[Filter, string]> = [['all', 'Everything'], ['ready', 'Can make now'], ['quick', 'Under 20 min'], ['light', 'Under 400 kcal'], ['mine', 'Yours']];

interface ListResponse { recipes: RecipeSummary[]; dietHidden: number; dietTags: string[]; hasMore?: boolean; total?: number }

export default function Recipes() {
  const navigate = useNavigate();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [data, setData] = useState<ListResponse | null>(null);
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const params = useCallback((n: number) => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (filter === 'quick') p.set('maxMinutes', '20');
    if (filter === 'light') p.set('maxCalories', '400');
    if (filter === 'ready') p.set('maxGaps', '0');
    if (filter === 'mine') p.set('mine', '1');
    if (n > 0) p.set('page', String(n));
    return p.toString();
  }, [q, filter]);

  useEffect(() => {
    let live = true;
    const t = window.setTimeout(() => {
      api.get<ListResponse>(`/api/recipes?${params(0)}`)
        .then((d) => { if (live) { setData(d); setPage(0); setError(null); } })
        .catch((e) => live && setError(errorText(e, 'Could not load recipes.')));
    }, 200);
    return () => { live = false; window.clearTimeout(t); };
  }, [params]);

  async function loadMore() {
    setMore(true);
    try {
      const next = page + 1;
      const d = await api.get<ListResponse>(`/api/recipes?${params(next)}`);
      setData((cur) => {
        if (!cur) return d;
        const seen = new Set(cur.recipes.map((r) => r.id));
        return { ...cur, hasMore: d.hasMore, recipes: [...cur.recipes, ...d.recipes.filter((r) => !seen.has(r.id))] };
      });
      setPage(next);
    } catch (e) {
      toast(errorText(e, 'Could not load more recipes.'));
    } finally {
      setMore(false);
    }
  }

  const groups = useMemo(() => {
    const all = data?.recipes ?? [];
    return [
      { key: 'use', title: 'Use it up first', items: all.filter((r) => r.canMakeNow && r.usesExpiring.length) },
      { key: 'ready', title: 'Ready now', items: all.filter((r) => r.canMakeNow && !r.usesExpiring.length) },
      { key: 'near', title: 'One or two things away', items: all.filter((r) => !r.canMakeNow && r.gaps <= 2) },
      { key: 'rest', title: 'Needs a shop', items: all.filter((r) => !r.canMakeNow && r.gaps > 2) },
    ].filter((g) => g.items.length);
  }, [data]);

  return (
    <Page
      left={<BackButton />}
      title="Recipes"
      right={<button type="button" className="icon-btn" aria-label="Import a recipe from a link" onClick={() => setImporting(true)}><Icon name="link" size={20} /></button>}
    >
      <div className="search">
        <Icon name="search" size={19} />
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search recipes, or an ingredient" aria-label="Search recipes" />
      </div>
      <div className="chips" style={{ marginTop: 12 }}>
        {FILTERS.map(([k, label]) => (
          <button key={k} type="button" className={`chip${filter === k ? ' on' : ''}`} onClick={() => setFilter(k)}>{label}</button>
        ))}
      </div>

      {data && data.dietHidden > 0 ? (
        <div className="banner" style={{ marginTop: 14 }}>
          {data.dietHidden} {data.dietHidden === 1 ? 'recipe is' : 'recipes are'} hidden by your {data.dietTags.join(' and ')} setting. Recipes you added are always shown. <Link to="/settings" className="link-btn">Change it</Link>
        </div>
      ) : null}
      {error ? <div className="banner error" style={{ marginTop: 14 }}>{error}</div> : null}

      {!data ? (
        <div style={{ marginTop: 20 }}>{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 64, marginBottom: 10 }} />)}</div>
      ) : data.recipes.length === 0 ? (
        filter === 'mine' && !q ? (
          <Empty title="No recipes of your own yet" action={<button type="button" className="btn small" onClick={() => setImporting(true)}>Import one from a link</button>}>Paste a link from any recipe site and it is matched against your pantry.</Empty>
        ) : (
          <Empty title="Nothing matches">{q ? `No recipe mentions “${q}”.` : 'Try a different filter.'}</Empty>
        )
      ) : (
        <>
          {groups.map((g) => (
            <section key={g.key}>
              <div className="section"><h2>{g.title}</h2><span className="aside">{g.items.length}</span></div>
              <div className="list">
                {g.items.map((r) => <RecipeRow key={r.id} r={r} onOpen={() => navigate(`/recipes/${r.id}`)} />)}
              </div>
            </section>
          ))}
          {data.hasMore ? (
            <div className="more">
              <span className="fine">Showing {data.recipes.length} of {data.total ?? 'more'}</span>
              <button type="button" className="btn secondary" onClick={() => void loadMore()} disabled={more}>{more ? 'Loading…' : 'Show more recipes'}</button>
            </div>
          ) : null}
        </>
      )}

      {importing ? <ImportSheet onClose={() => setImporting(false)} onDone={(id, message) => { setImporting(false); toast(message); navigate(`/recipes/${id}`); }} /> : null}
    </Page>
  );
}

function RecipeRow({ r, onOpen }: { r: RecipeSummary; onOpen: () => void }) {
  const kcal = r.nutrition?.caloriesPerServing ? `${Math.round(r.nutrition.caloriesPerServing)} kcal` : null;
  const line = r.usesExpiring.length
    ? `Uses ${r.usesExpiring.slice(0, 2).join(', ').toLowerCase()}`
    : !r.canMakeNow && r.missing.length
      ? `Needs ${r.missing.slice(0, 2).join(', ').toLowerCase()}${r.missing.length > 2 ? ` +${r.missing.length - 2}` : ''}`
      : r.description ?? '';
  return (
    <button type="button" className="list-row recipe-row" onClick={onOpen}>
      <span className="minutes" aria-label={r.totalMinutes ? `${r.totalMinutes} minutes` : 'Time unknown'}>
        <span className="num">{r.totalMinutes ?? '–'}</span>
        <span className="u">min</span>
      </span>
      <span className="grow">
        <span className="t">{r.name}{r.isMine ? <span className="tag info" style={{ marginLeft: 8 }}>Yours</span> : null}</span>
        <span className="s">{[line, kcal].filter(Boolean).join(' · ')}</span>
      </span>
      {r.canMakeNow ? <span className="tag ok">Ready</span> : <span className={`tag ${r.gaps <= 2 ? 'soon' : 'neutral'}`}>Need {r.gaps}</span>}
    </button>
  );
}

interface ImportPreview {
  name: string;
  description: string | null;
  servings: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  ingredients: Array<{ raw: string; quantity: number; unit: string; name: string; matchedFoodId: string | null; matchedFoodName: string | null }>;
}

/**
 * Import is read first, saved second: the page's ingredients are matched
 * against the foods the app knows, and the ones it does not are listed as new
 * before anything is written. New ones become private foods of your own.
 */
function ImportSheet({ onClose, onDone }: { onClose: () => void; onDone: (id: string, message: string) => void }) {
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function read() {
    setBusy(true);
    setError(null);
    try {
      const d = await api.post<{ preview: ImportPreview }>('/api/recipes/import/preview', { url: url.trim() });
      setPreview(d.preview);
    } catch (e) {
      setError(errorText(e, 'Could not read that link.'));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const d = await api.post<{ recipe: { id: string; name: string }; newFoods: string[]; ingredientCount: number }>('/api/recipes/import', { url: url.trim() });
      onDone(d.recipe.id, `Imported ${d.recipe.name}${d.newFoods.length ? `. ${d.newFoods.length} new ${d.newFoods.length === 1 ? 'food' : 'foods'} added to your catalogue.` : '.'}`);
    } catch (e) {
      setError(errorText(e, 'Could not import that recipe.'));
      setBusy(false);
    }
  }

  const matched = preview?.ingredients.filter((i) => i.matchedFoodId) ?? [];
  const fresh = preview?.ingredients.filter((i) => !i.matchedFoodId) ?? [];

  return (
    <Sheet title={preview ? preview.name : 'Import a recipe'} sub={preview ? `${preview.ingredients.length} ingredients · serves ${preview.servings}` : 'Paste a link from a recipe site. It stays in your own book; nobody else sees it.'} onClose={onClose} wide>
      {error ? <div className="banner error" style={{ marginTop: 10 }}>{error}</div> : null}
      {!preview ? (
        <>
          <div className="field">
            <label htmlFor="imp-url">Recipe link</label>
            <input id="imp-url" type="url" inputMode="url" autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          </div>
          <button type="button" className="btn block" style={{ marginTop: 18 }} onClick={read} disabled={busy || url.trim().length < 8}>{busy ? 'Reading the page…' : 'Read it'}</button>
        </>
      ) : (
        <>
          {fresh.length ? (
            <>
              <div className="section"><h2>New to the app</h2><span className="aside">{fresh.length}</span></div>
              <p className="fine">These become foods of your own. They look like this on your shelf, and you can say what they count as later.</p>
              <div className="list" style={{ marginTop: 8 }}>
                {fresh.map((i) => (
                  <div key={i.raw} className="list-row">
                    <span className="thumb"><FoodThumb name={i.name} category={null} size={30} /></span>
                    <span className="grow"><span className="t">{i.name}</span><span className="s">{i.raw}</span></span>
                    <span className="tag info">New</span>
                  </div>
                ))}
              </div>
            </>
          ) : null}
          <div className="section"><h2>Foods the app knows</h2><span className="aside">{matched.length}</span></div>
          <div className="list">
            {matched.map((i) => (
              <div key={i.raw} className="list-row">
                <span className="thumb"><FoodThumb name={i.matchedFoodName ?? i.name} category={null} size={30} /></span>
                <span className="grow"><span className="t">{i.matchedFoodName}</span><span className="s">{i.raw}</span></span>
                <Icon name="check" size={18} className="warm" />
              </div>
            ))}
          </div>
          <button type="button" className="btn block" style={{ marginTop: 20 }} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save to my recipes'}</button>
          <button type="button" className="btn ghost block" onClick={() => setPreview(null)} disabled={busy}>Use a different link</button>
        </>
      )}
    </Sheet>
  );
}
