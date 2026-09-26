import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Food } from '../lib/types';

/**
 * "This is really…"
 *
 * A scanned product is its own catalog row - a particular jar, with a barcode.
 * Recipes ask for the ingredient, not the jar, so something has to say which
 * ingredient this jar counts as. The app infers it from the name, and that
 * inference is a guess: good enough to offer, never good enough to apply
 * silently.
 *
 * So the guess is always shown and always correctable, here, before the thing
 * is added - not discovered three weeks later when a recipe insists you have no
 * olive oil while you are holding a bottle of it.
 */
export function CountsAs({
  food,
  onChanged,
  autoOpen = false,
}: {
  food: Pick<Food, 'id' | 'name' | 'barcode'> & { countsAs?: { id: string; name: string; source: string | null } | null };
  onChanged: (next: { id: string; name: string } | null) => void;
  /** open straight into the picker when nothing was inferred */
  autoOpen?: boolean;
}) {
  const guessed = food.countsAs ?? null;
  const [editing, setEditing] = useState(autoOpen && !guessed);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<Food[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing || query.trim().length < 2) {
      setOptions([]);
      return;
    }
    const timer = window.setTimeout(() => {
      api
        .get<{ foods: Food[] }>(`/api/foods/search?q=${encodeURIComponent(query)}&limit=12`)
        // a jar cannot count as another jar; only generic ingredients qualify
        .then((data) => setOptions(data.foods.filter((f) => !f.barcode).slice(0, 8)))
        .catch(() => setOptions([]));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [editing, query]);

  async function save(canonicalId: string | null, next: { id: string; name: string } | null) {
    setBusy(true);
    setError(null);
    try {
      await api.put(`/api/foods/${food.id}/counts-as`, { canonicalId });
      setEditing(false);
      setQuery('');
      onChanged(next);
    } catch {
      setError('Could not save that. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className="counts-as">
        <div className="row">
          <div className="grow">
            {guessed ? (
              <>
                <span className="ticket-name">Counts as {guessed.name}</span>
                <span className="ticket-print">
                  {guessed.source === 'user'
                    ? 'You chose this.'
                    : 'Worked out from the name. Recipes asking for it will use this.'}
                </span>
              </>
            ) : (
              <>
                <span className="ticket-name">Not linked to an ingredient</span>
                <span className="ticket-print">
                  Recipes will not count this towards anything until you say what it is.
                </span>
              </>
            )}
          </div>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setEditing(true)}>
            {guessed ? 'Change' : 'Set it'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="counts-as">
      <label htmlFor={`counts-as-${food.id}`}>This is really…</label>
      <input
        id={`counts-as-${food.id}`}
        value={query}
        placeholder="Olive oil, butter, cheddar…"
        onChange={(event) => setQuery(event.target.value)}
        autoComplete="off"
      />

      {options.length > 0 ? (
        <div className="suggestions">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              disabled={busy}
              onClick={() => void save(option.id, { id: option.id, name: option.name })}
            >
              {option.name}
            </button>
          ))}
        </div>
      ) : null}

      {error ? <p className="error tight">{error}</p> : null}

      <div className="btn-row" style={{ marginTop: 8 }}>
        {guessed ? (
          <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => void save(null, null)}>
            Not an ingredient
          </button>
        ) : null}
        <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
