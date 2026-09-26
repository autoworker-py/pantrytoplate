import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { CookPreview, InventoryItem, RecipeSummary } from '../lib/types';
import { formatAmount } from '../lib/format';
import { Fridge } from '../fridge/Fridge';
import { Icon } from '../ui/Icon';
import { Empty, Logo, Page, errorText, useToast } from '../ui/kit';
import { CookSheet, NO_ADJUSTMENTS, previewPath } from './cooking';
import { firstDoorThisSession } from './door';

/** "3 eggs", "2 cups spinach", "30 g cheddar": what goes on the tag above the item */
export function takesLabel(quantity: number, unit: string, name: string): string {
  // the tag sits over the thing itself, so its last word is enough: "30 g cheese"
  const words = name.toLowerCase().split(/\s+/);
  const noun = words[words.length - 1] ?? name.toLowerCase();
  if (unit === 'count') {
    const plural = quantity === 1 || /s$/.test(noun) ? noun : `${noun}s`;
    return `${formatAmount(quantity, unit)} ${plural}`;
  }
  return `${formatAmount(quantity, unit)} ${noun}`;
}

/** The one line that says why this recipe is tonight's. */
function whyLine(r: RecipeSummary, inventory: InventoryItem[]): { text: string; urgent: boolean } {
  if (r.usesExpiring.length) {
    const first = r.usesExpiring[0];
    const lot = inventory.find((i) => i.food.name === first);
    const d = lot?.daysUntilExpiration;
    if (d !== null && d !== undefined && d < 0) return { text: `Uses the ${first.toLowerCase()}, which is past its date.`, urgent: true };
    const when = d === 0 ? 'today' : d === 1 ? 'tomorrow' : d !== null && d !== undefined && d > 1 ? `in ${d} days` : 'soon';
    return { text: `Uses the ${first.toLowerCase()}, which goes off ${when}.`, urgent: d !== undefined && d !== null && d <= 1 };
  }
  if (r.canMakeNow) return { text: r.reasons[0] ?? 'You have everything for this.', urgent: false };
  return { text: `Needs ${r.missing.slice(0, 2).join(' and ').toLowerCase()}${r.missing.length > 2 ? ` and ${r.missing.length - 2} more` : ''}.`, urgent: false };
}

export default function Cook() {
  const navigate = useNavigate();
  const toast = useToast();
  const [recipes, setRecipes] = useState<RecipeSummary[] | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[] | null>(null);
  const [index, setIndex] = useState(0);
  const [preview, setPreview] = useState<CookPreview | null>(null);
  const [cooking, setCooking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [swap, setSwap] = useState(0);
  const [door] = useState(firstDoorThisSession);

  const load = useCallback(async (fresh = false) => {
    try {
      const get = fresh ? api.getFresh : api.get;
      const [r, inv] = await Promise.all([
        get<{ recipes: RecipeSummary[] }>('/api/recipes?limit=30'),
        get<{ items: InventoryItem[] }>('/api/inventory?sort=expiration'),
      ]);
      // tonight means cookable tonight; near-misses only when nothing is
      const ready = r.recipes.filter((x) => x.canMakeNow);
      setRecipes(ready.length ? ready : r.recipes.filter((x) => x.gaps <= 2));
      setInventory(inv.items);
      setError(null);
    } catch (cause) {
      setError(errorText(cause, 'Could not load tonight’s ideas.'));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const current = recipes && recipes.length ? recipes[index % recipes.length] : null;

  useEffect(() => {
    if (!current) { setPreview(null); return; }
    let live = true;
    api
      .get<{ preview: CookPreview }>(previewPath(current.id, NO_ADJUSTMENTS))
      .then((d) => live && setPreview(d.preview))
      .catch(() => live && setPreview(null));
    return () => { live = false; };
  }, [current, swap]);

  const fridgeItems = useMemo(() => (inventory ?? []).filter((i) => i.storageLocation === 'fridge'), [inventory]);
  const zoneOf = useMemo(() => new Map((inventory ?? []).map((i) => [i.id, i.storageLocation])), [inventory]);

  // lift and glow: each lot the recipe draws from, labelled with what it takes
  const { highlight, fromCupboard } = useMemo(() => {
    const map = new Map<string, string>();
    const cupboard: string[] = [];
    if (preview && current && preview.id === current.id) {
      for (const ing of preview.ingredients) {
        let inFridge = false;
        for (const d of ing.plan.deductions) {
          if (zoneOf.get(d.inventoryItemId) === 'fridge') {
            inFridge = true;
            if (!map.has(d.inventoryItemId)) map.set(d.inventoryItemId, takesLabel(ing.requiredQuantity, ing.requiredUnit, ing.name));
          }
        }
        if (!inFridge && ing.status === 'ok') cupboard.push(ing.name.toLowerCase());
      }
    }
    return { highlight: map, fromCupboard: cupboard };
  }, [preview, current, zoneOf]);

  const why = current && inventory ? whyLine(current, inventory) : null;
  const facts = current
    ? [current.totalMinutes ? `${current.totalMinutes} min` : null, current.nutrition?.caloriesPerServing ? `${Math.round(current.nutrition.caloriesPerServing)} kcal` : null, `serves ${current.servings}`].filter(Boolean).join(' · ')
    : '';

  async function addGaps() {
    if (!current) return;
    try {
      const data = await api.post<{ added: Array<{ name: string }> }>(`/api/shopping-list/from-recipe/${current.id}`, {});
      toast(data.added.length ? `Added ${data.added.map((a) => a.name).join(', ')} to your list.` : 'Already on your list.');
    } catch (cause) {
      toast(errorText(cause, 'Could not update your list.'));
    }
  }

  return (
    <Page
      fixed
      left={<Link to="/settings" className="icon-btn" aria-label="Settings"><Icon name="gear" size={20} /></Link>}
      center={<Logo />}
      right={<Link to="/recipes" className="pill-btn">All recipes</Link>}
      className="cook-page"
    >
      {error ? <div className="pad" style={{ marginBottom: 10 }}><div className="banner error">{error} <button type="button" className="link-btn" onClick={() => void load(true)}>Try again</button></div></div> : null}

      <Fridge
        zone="fridge"
        mode="cook"
        items={fridgeItems}
        highlight={highlight}
        scrollToLit
        animateDoor={door}
        empty={inventory ? <span className="fine">Nothing in the fridge. Tonight’s ideas come from the cupboard.</span> : null}
      />

      <section className="tonight" aria-live="polite">
        {!recipes ? (
          <div className="skeleton" style={{ height: 196, borderRadius: 24 }} />
        ) : !current ? (
          <Empty title="Nothing to cook yet" action={<Link to="/add" className="btn small">Put food away</Link>}>
            Add what is in your kitchen and tonight’s ideas will come from it.
          </Empty>
        ) : (
          <div className="tonight-card" key={current.id}>
            <button type="button" className="tonight-title" onClick={() => navigate(`/recipes/${current.id}`)}>
              <h2>{current.name}</h2>
              <Icon name="chevron" size={18} />
            </button>
            {why ? <p className={`why${why.urgent ? ' urgent' : ''}`}>{why.urgent ? <i aria-hidden="true" /> : null}{why.text}</p> : null}
            <p className="facts">{facts}{recipes.length > 1 ? <span className="count"> · {index % recipes.length + 1} of {recipes.length}</span> : null}</p>
            {fromCupboard.length ? <p className="plus">Plus {fromCupboard.slice(0, 3).join(', ')}{fromCupboard.length > 3 ? ` and ${fromCupboard.length - 3} more` : ''} from the cupboard.</p> : null}
            <div className="btn-row" style={{ marginTop: 14 }}>
              {current.canMakeNow ? (
                <button type="button" className="btn" disabled={!preview || preview.id !== current.id || preview.blocked} onClick={() => setCooking(true)}>Cook this</button>
              ) : (
                <button type="button" className="btn" onClick={addGaps}>Add {current.gaps} to list</button>
              )}
              <button type="button" className="btn secondary" style={{ flex: '0 0 116px' }} onClick={() => setIndex((i) => i + 1)} disabled={recipes.length < 2}>Another</button>
            </div>
          </div>
        )}
      </section>

      {cooking && preview ? (
        <CookSheet
          preview={preview}
          adjustments={NO_ADJUSTMENTS}
          onClose={() => setCooking(false)}
          onCooked={() => {
            setCooking(false);
            setSwap((n) => n + 1);
            void load(true);
          }}
        />
      ) : null}
    </Page>
  );
}
