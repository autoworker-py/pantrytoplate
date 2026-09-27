import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { Food } from '../lib/types';
import { formatAmount } from '../lib/format';
import { FoodThumb } from '../fridge/Fridge';
import { UnitSelect } from '../components/UnitSelect';
import { Icon } from '../ui/Icon';
import { BackButton, Page, Sheet, Stepper, errorText, useToast } from '../ui/kit';
import { NewFoodSheet, TypeFlow } from './AddFood';

/*
 * A recipe of your own, the way you make it: what goes in and how much, and
 * the steps if you want them. It is matched against your pantry like any
 * other, and its calories are worked out from the ingredients.
 */

interface Ingredient {
  key: string;
  food: Food;
  quantity: number;
  unit: string;
}

/** A sensible first amount: a hundred of a weight or volume, one of anything counted. */
const firstAmount = (food: Food) => (['g', 'ml'].includes(food.defaultUnit) ? 100 : 1);

export default function RecipeNew() {
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = useState('');
  const [servings, setServings] = useState(2);
  const [minutes, setMinutes] = useState('');
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [method, setMethod] = useState('');
  const [finding, setFinding] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const [amount, setAmount] = useState<Ingredient | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const steps = method.split('\n').map((line) => line.trim()).filter(Boolean);
  const ready = name.trim().length > 0 && ingredients.length > 0;

  function picked(food: Food) {
    setFinding(false);
    setCreating(null);
    setAmount({ key: `${food.id}-${Date.now()}`, food, quantity: firstAmount(food), unit: food.defaultUnit });
  }

  function keep(next: Ingredient) {
    setIngredients((all) => (all.some((i) => i.key === next.key) ? all.map((i) => (i.key === next.key ? next : i)) : [...all, next]));
    setAmount(null);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const d = await api.post<{ recipe: { id: string; name: string } }>('/api/recipes', {
        name: name.trim(),
        servings,
        prepMinutes: Number(minutes) > 0 ? Math.round(Number(minutes)) : null,
        // the server asks for a method; with no steps written, a blank keeps the Method section away
        instructions: steps.length ? steps.map((step, i) => `${i + 1}. ${step}`).join('\n') : ' ',
        ingredients: ingredients.map((i) => ({ foodReferenceId: i.food.id, quantityRequired: i.quantity, unitRequired: i.unit })),
      });
      toast(`${d.recipe.name} is in your recipes.`);
      navigate(`/recipes/${d.recipe.id}`, { replace: true });
    } catch (cause) {
      setError(errorText(cause, 'Could not save that recipe.'));
      setBusy(false);
    }
  }

  return (
    <Page left={<BackButton fallback="/recipes" />} title="New recipe">
      {error ? <div className="banner error">{error}</div> : null}

      <div className="field" style={{ marginTop: 4 }}>
        <label htmlFor="r-name">Name</label>
        <input id="r-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Grandma’s chilli" autoComplete="off" />
      </div>
      <div className="recipe-basics">
        <div className="field">
          <span className="label">Serves</span>
          <Stepper value={servings} onChange={setServings} min={1} max={24} label="servings" />
        </div>
        <div className="field">
          <label htmlFor="r-min">Time (min)</label>
          <input id="r-min" type="number" inputMode="numeric" min={0} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="30" />
        </div>
      </div>

      <div className="section">
        <h2>Ingredients</h2>
        <span className="aside">{ingredients.length ? ingredients.length : 'At least one'}</span>
      </div>
      {ingredients.length ? (
        <div className="list">
          {ingredients.map((i) => (
            <button key={i.key} type="button" className="list-row" onClick={() => setAmount(i)}>
              <span className="thumb"><FoodThumb name={i.food.name} category={i.food.category} unit={i.unit} size={32} /></span>
              <span className="grow">
                <span className="t">{i.food.name}</span>
                <span className="s">{i.food.brand ?? i.food.category ?? 'Your food'}</span>
              </span>
              <span className="num">{formatAmount(i.quantity, i.unit)}</span>
            </button>
          ))}
        </div>
      ) : null}
      <button type="button" className="btn outline block" style={{ marginTop: 12 }} onClick={() => setFinding(true)}>
        <Icon name="plus" size={18} /> Add an ingredient
      </button>

      <div className="section">
        <h2>Method</h2>
        <span className="aside">Optional</span>
      </div>
      <div className="field" style={{ marginTop: 0 }}>
        <textarea aria-label="Method, one step per line" value={method} onChange={(e) => setMethod(e.target.value)} placeholder={'One step per line.\nSoften the onions.\nAdd the tomatoes and simmer for 20 minutes.'} rows={6} />
      </div>
      <p className="fine" style={{ marginTop: 8 }}>Calories are worked out from the ingredients once it is saved.</p>

      <div className="cook-bar">
        <button type="button" className="btn" onClick={() => void save()} disabled={!ready || busy}>
          {busy ? 'Saving…' : ready ? 'Save recipe' : !name.trim() ? 'Name it to save' : 'Add an ingredient to save'}
        </button>
      </div>

      {finding ? (
        <Sheet title="Add an ingredient" onClose={() => setFinding(false)}>
          <div style={{ marginTop: 10 }}>
            <TypeFlow
              onPick={(p) => picked(p.food)}
              onCreate={(typed) => { setFinding(false); setCreating(typed); }}
              placeholder="Onion, chicken thighs, rice…"
              hint="Search every food the app knows, or add one of your own."
            />
          </div>
        </Sheet>
      ) : null}
      {creating !== null ? <NewFoodSheet initialName={creating} onClose={() => setCreating(null)} onCreated={(food) => picked(food)} /> : null}
      {amount ? (
        <AmountSheet
          ingredient={amount}
          editing={ingredients.some((i) => i.key === amount.key)}
          onClose={() => setAmount(null)}
          onSave={keep}
          onRemove={() => { setIngredients((all) => all.filter((i) => i.key !== amount.key)); setAmount(null); }}
        />
      ) : null}
    </Page>
  );
}

function AmountSheet({
  ingredient,
  editing,
  onClose,
  onSave,
  onRemove,
}: {
  ingredient: Ingredient;
  editing: boolean;
  onClose: () => void;
  onSave: (next: Ingredient) => void;
  onRemove: () => void;
}) {
  const [quantity, setQuantity] = useState(ingredient.quantity);
  const [unit, setUnit] = useState(ingredient.unit);
  return (
    <Sheet title={ingredient.food.name} sub="How much goes in, for the whole recipe." onClose={onClose}>
      <div className="field-row" style={{ marginTop: 6 }}>
        <div className="field">
          <label htmlFor="ing-q">Amount</label>
          <input id="ing-q" type="number" inputMode="decimal" min={0} step="any" autoFocus value={Number.isFinite(quantity) ? quantity : ''} onChange={(e) => setQuantity(Number(e.target.value))} />
        </div>
        <div className="field">
          <label htmlFor="ing-u">Unit</label>
          <UnitSelect id="ing-u" value={unit} onChange={setUnit} suggested={ingredient.food.defaultUnit} />
        </div>
      </div>
      <button type="button" className="btn block" style={{ marginTop: 20 }} disabled={!(quantity > 0)} onClick={() => onSave({ ...ingredient, quantity, unit })}>
        {editing ? 'Save' : 'Add to recipe'}
      </button>
      {editing ? (
        <button type="button" className="btn ghost danger-ink block" onClick={onRemove}>
          <Icon name="trash" size={18} /> Take it out
        </button>
      ) : null}
    </Sheet>
  );
}
