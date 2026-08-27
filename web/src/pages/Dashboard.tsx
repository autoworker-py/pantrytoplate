import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type {
  CookedRecipe,
  Dashboard as DashboardData,
  Leftover,
  RunOutPrediction,
  WasteLogEntry,
  WastePattern,
} from '../lib/types';
import { Sheet } from '../components/Sheet';
import { Icon } from '../components/Icon';
import { formatAmount, expiryLabel } from '../lib/format';
import { ExpiryPill } from '../components/StatusPill';
import { AdCard } from '../components/AdCard';
import { useToast } from '../components/Toast';
import { notifyDigest, type Digest } from '../lib/notify';

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [dismissedStale, setDismissedStale] = useState<string[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [leftovers, setLeftovers] = useState<Leftover[]>([]);
  const [runningOut, setRunningOut] = useState<RunOutPrediction[]>([]);
  const [frequent, setFrequent] = useState<CookedRecipe[]>([]);
  const [patterns, setPatterns] = useState<WastePattern[]>([]);
  const [digest, setDigest] = useState<Digest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const load = () =>
    api
      .get<DashboardData>('/api/dashboard')
      .then(setData)
      .catch(() => setError('Could not load your pantry.'));

  useEffect(() => {
    void load();
    void Promise.all([
      api.get<{ leftovers: Leftover[] }>('/api/planning/leftovers').catch(() => ({ leftovers: [] })),
      api.get<{ predictions: RunOutPrediction[] }>('/api/planning/run-out').catch(() => ({ predictions: [] })),
      api.get<{ recipes: CookedRecipe[] }>('/api/planning/frequent').catch(() => ({ recipes: [] })),
      api.get<{ patterns: WastePattern[] }>('/api/reports/waste/patterns').catch(() => ({ patterns: [] })),
    ]).then(([left, out, freq, pat]) => {
      setLeftovers(left.leftovers);
      setRunningOut(out.predictions);
      setFrequent(freq.recipes);
      setPatterns(pat.patterns);
    });

    api
      .get<Digest>('/api/planning/digest')
      .then((data) => {
        setDigest(data);
        // at most once a day, and only if they allowed notifications
        notifyDigest(data);
      })
      .catch(() => setDigest(null));
  }, []);

  async function resolveStale(id: string, stillHaveIt: boolean, name: string) {
    setDismissedStale((current) => [...current, id]);
    if (stillHaveIt) return;
    try {
      await api.post(`/api/inventory/${id}/remove`, { reason: 'used_up' });
      toast(`${name} taken out of your pantry.`);
      void load();
    } catch {
      toast('Could not update that item.');
    }
  }

  if (error) return <div className="banner error">{error}</div>;
  if (!data) return <div className="empty">Loading…</div>;

  const stale = data.staleItems.filter((item) => !dismissedStale.includes(item.id));
  const target = data.today.targets.calories;

  return (
    <>
      {digest?.headline ? (
        <div className="digest">
          <strong>{digest.headline}</strong>
          {digest.rescueRecipes.length > 0 ? (
            <div className="btn-row" style={{ marginTop: 8 }}>
              {digest.rescueRecipes.slice(0, 2).map((recipe) => (
                <Link key={recipe.id} className="btn btn-secondary btn-sm" to={`/recipes/${recipe.id}`}>
                  {recipe.name}
                  {recipe.totalMinutes ? ` · ${recipe.totalMinutes} min` : ''}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="row" style={{ marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Today</h1>
        <Link className="btn btn-sm" to="/add">
          + Add food
        </Link>
      </div>

      <div className="card">
        <div className="stat">
          <div>
            <div className="value">{data.today.totalCalories}</div>
            <div className="label">kcal today</div>
          </div>
          <div>
            <div className="value">{data.inventoryCount}</div>
            <div className="label">items in pantry</div>
          </div>
          <div>
            <div className="value">{data.cookableCount}</div>
            <div className="label">recipes ready</div>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <div className={`bar ${data.today.caloriesRemaining < 0 ? 'over' : ''}`}>
            <span style={{ width: `${Math.min(100, (data.today.totalCalories / target) * 100)}%` }} />
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            <span className="muted">
              {data.today.caloriesRemaining >= 0
                ? `${data.today.caloriesRemaining} kcal left today`
                : `${Math.abs(data.today.caloriesRemaining)} kcal over`}
            </span>
            <Link to="/diary" className="muted">
              Diary <Icon name="arrow-right" size={15} />
            </Link>
          </div>
        </div>
      </div>

      {leftovers.length > 0 ? (
        <>
          <h2>In the fridge</h2>
          <div className="card">
            <ul className="list">
              {leftovers.map((portion) => (
                <li key={portion.id} className="row">
                  <div className="grow">
                    <div className="truncate">
                      <Icon name="bowl" size={15} className="inline-icon" /> {portion.name}
                    </div>
                    <div className="muted">
                      {portion.servings} portion{portion.servings === 1 ? '' : 's'}
                      {portion.caloriesPerServing ? ` · ${portion.caloriesPerServing} kcal each` : ''}
                    </div>
                  </div>
                  <Link className="btn btn-secondary btn-sm" to="/inventory">
                    Eat one
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}

      {/* The single most useful thing the app can say: cook this, it's dying. */}
      {data.useItUpRecipes.length > 0 ? (
        <>
          <h2>Use it up tonight</h2>
          <div className="card">
            <ul className="list">
              {data.useItUpRecipes.map((recipe) => (
                <li key={recipe.id} className="row">
                  <div className="grow">
                    <div className="truncate">{recipe.name}</div>
                    <div className="reason-note">Uses {recipe.usesExpiring.join(', ')}</div>
                  </div>
                  <Link className="btn btn-secondary btn-sm" to={`/recipes/${recipe.id}`}>
                    {recipe.totalMinutes ? `${recipe.totalMinutes} min` : 'Cook'}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}

      <h2>Eat these first</h2>
      {data.expiring.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Nothing expires in the next {data.expiryWarningDays} days.
          </p>
        </div>
      ) : (
        <div className="card">
          <ul className="list">
            {data.expiring.map((item) => (
              <li key={item.id} className="row">
                <div className="grow">
                  <div className="truncate">{item.name}</div>
                  <div className="muted">{formatAmount(item.quantity, item.unit)} left</div>
                </div>
                <ExpiryPill
                  status={item.expiryStatus}
                  label={expiryLabel(item.daysUntilExpiration, item.expiryStatus)}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Reconciliation: inventory drifts from reality, so ask rather than guess. */}
      {stale.length > 0 ? (
        <>
          <h2>Still got these?</h2>
          {stale.map((item) => (
            <div className="card tight" key={item.id}>
              <div className="row top">
                <div className="grow">
                  <div className="truncate">{item.name}</div>
                  <div className="muted">
                    {formatAmount(item.quantity, item.unit)} · untouched for {item.untouchedDays} days
                  </div>
                </div>
                <div className="btn-row">
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => resolveStale(item.id, true, item.name)}
                  >
                    Still here
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => resolveStale(item.id, false, item.name)}
                  >
                    All gone
                  </button>
                </div>
              </div>
            </div>
          ))}
        </>
      ) : null}

      {runningOut.length > 0 ? (
        <>
          <h2>About to run out</h2>
          <div className="card">
            <ul className="list">
              {runningOut.slice(0, 4).map((item) => (
                <li key={item.foodReferenceId} className="row">
                  <div className="grow">
                    <div className="truncate">{item.name}</div>
                    <div className="muted">
                      {formatAmount(item.remaining, item.unit)} left ·{' '}
                      {item.daysLeft === 0 ? 'today' : `about ${item.daysLeft} day${item.daysLeft === 1 ? '' : 's'}`}
                    </div>
                  </div>
                  {item.alreadyOnList ? (
                    <span className="pill">on your list</span>
                  ) : (
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={async () => {
                        await api.post('/api/shopping-list', {
                          name: item.name,
                          quantityNeeded: 1,
                          unit: item.unit,
                          foodReferenceId: item.foodReferenceId,
                        });
                        setRunningOut((current) =>
                          current.map((entry) =>
                            entry.foodReferenceId === item.foodReferenceId
                              ? { ...entry, alreadyOnList: true }
                              : entry,
                          ),
                        );
                        toast(`${item.name} added to your shopping list.`);
                      }}
                    >
                      + List
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
              Worked out from how fast you actually get through things.
            </p>
          </div>
        </>
      ) : null}

      {frequent.length > 0 ? (
        <>
          <h2>Cook it again</h2>
          <div className="card">
            <ul className="list">
              {frequent.slice(0, 4).map((recipe) => (
                <li key={recipe.recipeId} className="row">
                  <div className="grow">
                    <div className="truncate">{recipe.name}</div>
                    <div className="muted">
                      cooked {recipe.timesCooked} time{recipe.timesCooked === 1 ? '' : 's'}
                      {recipe.rating ? ` · you rated it ${recipe.rating}/5` : ''}
                    </div>
                  </div>
                  <Link className="btn btn-secondary btn-sm" to={`/recipes/${recipe.recipeId}`}>
                    Again
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}

      <h2>Cook right now</h2>
      <div className="card">
        {data.cookableNow.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Nothing is fully in stock yet. <Link to="/recipes">See what you are close to.</Link>
          </p>
        ) : (
          <ul className="list">
            {data.cookableNow.map((recipe) => (
              <li key={recipe.id} className="row">
                <div className="grow">
                  <div className="truncate">{recipe.name}</div>
                  <div className="muted">
                    {recipe.totalMinutes ? `${recipe.totalMinutes} min` : ''}
                    {recipe.nutrition?.caloriesPerServing
                      ? `${recipe.totalMinutes ? ' · ' : ''}${recipe.nutrition.caloriesPerServing} kcal a serving`
                      : ''}
                  </div>
                </div>
                <Link className="btn btn-secondary btn-sm" to={`/recipes/${recipe.id}`}>
                  Cook
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {data.ads.map((ad) => (
        <AdCard key={ad.id} ad={ad} />
      ))}

      <h2>Food you threw away</h2>
      <div className="card">
        {data.waste.wastedItems === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Nothing binned in the last 30 days. That is the whole point.
          </p>
        ) : (
          <>
            <div className="stat">
              <div>
                <div className="value">{data.waste.wastedItems}</div>
                <div className="label">binned in 30 days</div>
              </div>
              <div>
                <div className="value">{data.waste.perWeek}</div>
                <div className="label">a week</div>
              </div>
              {data.waste.byCategory[0] ? (
                <div>
                  <div className="value" style={{ fontSize: '1.05rem' }}>
                    {data.waste.byCategory[0].category}
                  </div>
                  <div className="label">most wasted</div>
                </div>
              ) : null}
            </div>

            {data.waste.topWasted.length > 0 ? (
              <ul className="list" style={{ marginTop: 12 }}>
                {data.waste.topWasted.map((item) => (
                  <li key={item.name} className="row">
                    <div className="grow truncate">{item.name}</div>
                    <div className="muted">
                      {item.times} time{item.times === 1 ? '' : 's'}
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}

        {patterns.length > 0 ? (
          <div className="banner info" style={{ marginTop: 12, marginBottom: 0 }}>
            {patterns[0]!.suggestion}
          </div>
        ) : null}

        <button
          type="button"
          className="btn-secondary btn-block"
          style={{ marginTop: 12 }}
          onClick={() => setShowLog(true)}
        >
          See the full log
        </button>
      </div>

      {showLog ? <WasteLog onClose={() => setShowLog(false)} /> : null}
    </>
  );
}

const REASON_LABEL: Record<string, string> = {
  wasted: 'Thrown out',
  other_person: 'Someone else',
  used_up: 'Used up',
};

/**
 * Everything that left the pantry, and why.
 *
 * Counts and dates rather than money: food prices move constantly and we do not
 * read receipts, so a pound figure would be a confident-looking guess. How often
 * you bin the same thing is true, and it is the number that changes what you buy.
 */
function WasteLog({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<WasteLogEntry[] | null>(null);
  const [filter, setFilter] = useState<'wasted' | 'all'>('wasted');

  useEffect(() => {
    const query = filter === 'wasted' ? '?reason=wasted' : '';
    api
      .get<{ entries: WasteLogEntry[] }>(`/api/reports/waste/log${query}`)
      .then((data) => setEntries(data.entries))
      .catch(() => setEntries([]));
  }, [filter]);

  return (
    <Sheet title="What left your pantry" onClose={onClose}>
      <div className="segmented">
        <button type="button" className={filter === 'wasted' ? 'active' : ''} onClick={() => setFilter('wasted')}>
          Thrown out
        </button>
        <button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
          Everything
        </button>
      </div>

      {!entries ? (
        <p className="muted">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="muted">
          {filter === 'wasted' ? 'Nothing thrown out. Good.' : 'Nothing has left your pantry yet.'}
        </p>
      ) : (
        <div>
          {entries.map((entry) => (
            <div className="waste-row" key={entry.id}>
              <div>
                <div>{entry.name}</div>
                <div className="muted">
                  {formatAmount(entry.quantity, entry.unit)}
                  {entry.category ? ` · ${entry.category}` : ''}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className={`waste-reason ${entry.reason}`}>
                  {REASON_LABEL[entry.reason] ?? entry.reason}
                </div>
                <div className="muted">
                  {new Date(entry.removedAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}
