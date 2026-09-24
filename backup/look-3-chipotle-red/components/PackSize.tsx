/**
 * "How big is one pack of this?"
 *
 * Asked once, the first time a food is added, and never again. It is the
 * question that makes every later shortcut honest: "full pack" means nothing
 * until the app knows what a pack of this actually weighs, and a guess drawn
 * from the category is a starting point to correct rather than an answer.
 *
 * Once answered, the shortcuts replace the question — the whole point of the
 * product is that entering a food is a one-time cost.
 */
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Icon } from './Icon';

export interface Pack {
  foodReferenceId: string;
  name: string;
  defaultUnit: string;
  grams: number | null;
  estimated: boolean;
  known: boolean;
}

/** Look up a food's pack size, or null while unknown / not applicable. */
export function usePack(foodReferenceId: string | null | undefined) {
  const [pack, setPack] = useState<Pack | null>(null);

  useEffect(() => {
    if (!foodReferenceId) {
      setPack(null);
      return;
    }
    let live = true;
    api
      .get<Pack>(`/api/foods/${foodReferenceId}/pack`)
      .then((result) => live && setPack(result))
      .catch(() => live && setPack(null));
    return () => {
      live = false;
    };
  }, [foodReferenceId]);

  return pack;
}

export function PackSize({
  pack,
  quantity,
  unit,
  onPick,
  onSaved,
}: {
  pack: Pack | null;
  quantity: number;
  unit: string;
  onPick: (quantity: number, unit: string) => void;
  /** the pack size has been taught, so the parent can refresh its shortcuts */
  onSaved: (grams: number) => void;
}) {
  const [entry, setEntry] = useState('');
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // a fresh food means a fresh question
  useEffect(() => {
    setEntry(pack?.grams ? String(pack.grams) : '');
    setDismissed(false);
  }, [pack?.foodReferenceId, pack?.grams]);

  if (!pack) return null;

  async function teach() {
    const grams = Number(entry);
    if (!(grams > 0) || !pack) return;
    setBusy(true);
    try {
      await api.post(`/api/foods/${pack.foodReferenceId}/conversions`, {
        fromUnit: 'package',
        toUnit: 'g',
        multiplier: grams,
      });
      onSaved(grams);
      onPick(grams, 'g');
    } finally {
      setBusy(false);
    }
  }

  // Known size: offer it as a shortcut and get out of the way.
  if (pack.known && pack.grams) {
    return (
      <div className="chip-row">
        <button
          type="button"
          className={`chip ${quantity === pack.grams && unit === 'g' ? 'chip-on' : ''}`}
          onClick={() => onPick(pack.grams!, 'g')}
        >
          Full pack · {pack.grams} g
        </button>
        <button type="button" className="chip" onClick={() => onPick(Math.round(pack.grams! / 2), 'g')}>
          Half
        </button>
        <button type="button" className="chip" onClick={() => onPick(1, pack.defaultUnit)}>
          One {pack.defaultUnit}
        </button>
      </div>
    );
  }

  if (dismissed) return null;

  // Unknown: ask, once.
  return (
    <div className="prompt-card">
      <div className="prompt-head">
        <span className="prompt-icon"><Icon name="box" size={22} /></span>
        <div>
          <strong>How big is one pack?</strong>
          <p className="muted">
            {pack.estimated && pack.grams
              ? `We guessed about ${pack.grams} g from its category. Correct it once and we will remember.`
              : 'Tell us once and “full pack” works everywhere afterwards.'}
          </p>
        </div>
      </div>

      <div className="prompt-row">
        <input
          type="number"
          min={0}
          step="any"
          inputMode="decimal"
          placeholder={pack.grams ? String(pack.grams) : 'e.g. 500'}
          value={entry}
          onChange={(event) => setEntry(event.target.value)}
          aria-label="Pack size in grams"
        />
        <span className="unit-suffix">g</span>
        <button type="button" onClick={teach} disabled={busy || !(Number(entry) > 0)}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>

      <button type="button" className="btn-ghost btn-sm" onClick={() => setDismissed(true)}>
        Skip for now
      </button>
    </div>
  );
}
