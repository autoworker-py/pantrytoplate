import { useMemo, useState } from 'react';
import type { InventoryItem } from '../../lib/types';
import { FoodThumb, drawnAs, expiryTag } from '../../fridge/Fridge';
import { Icon } from '../../ui/Icon';
import { tick } from '../../lib/native';
import { CUISINES, FEELS, FROM, SMALL_PRINT, type From, type Order } from './options';

const FROM_HINT: Record<From, string> = {
  only: 'Nothing to buy: only what is in your kitchen.',
  mostly: 'Your kitchen first, with a couple of things to buy at most.',
  anything: 'Any recipe at all. Whatever is missing can go on your list.',
};

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * The order, written on a ticket. Everything is optional: a blank ticket is a
 * real order ("surprise me"), and every mark on it narrows what comes back.
 */
export function Ticket({
  order,
  onChange,
  pantry,
  caloriesLeft,
  dietTags,
  printedAt,
}: {
  order: Order;
  onChange: (next: Order) => void;
  pantry: InventoryItem[] | null;
  caloriesLeft: number | null;
  dietTags: string[];
  printedAt: string;
}) {
  const set = <K extends keyof Order>(key: K, value: Order[K]) => onChange({ ...order, [key]: value });
  const [openRegion, setOpenRegion] = useState<string | null>(null);

  const toggle = (key: 'feels' | 'dishes' | 'include', value: string) => {
    tick();
    const list = order[key] as string[];
    onChange({ ...order, [key]: list.some((v) => same(v, value)) ? list.filter((v) => !same(v, value)) : [...list, value] });
  };

  /** first tap marks a group and opens its cuisines; tapping it again while open takes it off */
  const tapRegion = (region: string) => {
    tick();
    const dishes = CUISINES.find((c) => c.region === region)?.dishes ?? [];
    if (!order.regions.includes(region)) {
      onChange({ ...order, regions: [...order.regions, region] });
      setOpenRegion(region);
    } else if (openRegion !== region) {
      setOpenRegion(region);
    } else {
      onChange({ ...order, regions: order.regions.filter((r) => r !== region), dishes: order.dishes.filter((d) => !dishes.includes(d)) });
      setOpenRegion(null);
    }
  };

  // what to use up: the soonest-dated food, as it sits on the shelf
  const useUp = useMemo(
    // never anything past its date: the kitchen does not cook expired food
    () => (pantry ?? []).filter((i) => i.expiryStatus !== 'expired' && i.daysUntilExpiration !== null && i.daysUntilExpiration >= 0 && i.daysUntilExpiration <= 4 && i.quantity > 0).slice(0, 6),
    [pantry],
  );
  const pantryNames = useMemo(() => [...new Set((pantry ?? []).map((i) => i.food.name))], [pantry]);
  const open = CUISINES.find((c) => c.region === openRegion && order.regions.includes(c.region));

  return (
    <div className="ticket">
      <header className="t-head">
        <b>Order</b>
        <span className="num">{printedAt}</span>
      </header>

      <label className="t-want">
        <span className="t-label">What are you after?</span>
        <textarea
          rows={2}
          maxLength={240}
          value={order.want}
          onChange={(e) => set('want', e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          enterKeyHint="done"
          placeholder="Something cozy that isn’t too heavy"
        />
      </label>

      <fieldset className="t-group">
        <legend className="t-label">How should it feel?</legend>
        <div className="t-tags">
          {FEELS.map((feel) => {
            const on = order.feels.includes(feel);
            return (
              <button key={feel} type="button" className={`t-tag${on ? ' inked' : ''}`} aria-pressed={on} onClick={() => toggle('feels', feel)}>
                {feel}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="t-group">
        <legend className="t-label">Cuisine</legend>
        <div className="t-tags">
          <button
            type="button"
            className={`t-tag${order.regions.length ? '' : ' inked'}`}
            aria-pressed={!order.regions.length}
            onClick={() => {
              tick();
              onChange({ ...order, regions: [], dishes: [] });
              setOpenRegion(null);
            }}
          >
            Any
          </button>
          {CUISINES.map(({ region, dishes }) => {
            const on = order.regions.includes(region);
            const picked = order.dishes.filter((d) => dishes.includes(d)).length;
            return (
              <button key={region} type="button" className={`t-tag${on ? ' inked' : ''}${on && openRegion === region ? ' open' : ''}`} aria-pressed={on} aria-expanded={on ? openRegion === region : undefined} onClick={() => tapRegion(region)}>
                {region}
                {picked ? <span className="t-count num">{picked}</span> : null}
              </button>
            );
          })}
        </div>
        {open ? (
          <div className="t-tags t-sub" aria-label={`${open.region} cuisines`}>
            {open.dishes.map((dish) => {
              const on = order.dishes.includes(dish);
              return (
                <button key={dish} type="button" className={`t-tag small${on ? ' inked' : ''}`} aria-pressed={on} onClick={() => toggle('dishes', dish)}>
                  {dish}
                </button>
              );
            })}
          </div>
        ) : null}
      </fieldset>

      {useUp.length ? (
        <fieldset className="t-group">
          <legend className="t-label">Use it up</legend>
          <div className="t-foods">
            {useUp.map((item) => {
              const on = order.include.some((v) => same(v, item.food.name));
              const tag = expiryTag(item);
              return (
                <button key={item.id} type="button" className={`t-food${on ? ' inked' : ''}`} aria-pressed={on} onClick={() => toggle('include', item.food.name)}>
                  <FoodThumb {...drawnAs(item.food)} quantity={item.quantity} unit={item.unit} isLeftover={item.isLeftover} size={30} />
                  <span className="t-food-name">{item.food.name}</span>
                  {tag ? <span className={`t-due${tag.tone === 'red' ? ' red' : ''}`}>{tag.text}</span> : null}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <div className="t-group">
        <label className="t-label" htmlFor="t-include">Must include</label>
        <Foods
          id="t-include"
          values={order.include}
          suggestions={pantryNames}
          placeholder="Add a food"
          onAdd={(v) => set('include', [...order.include, v])}
          onRemove={(v) => set('include', order.include.filter((x) => !same(x, v)))}
        />
      </div>

      <div className="t-group">
        <label className="t-label" htmlFor="t-leave">Leave out</label>
        <Foods
          id="t-leave"
          values={order.leaveOut}
          suggestions={pantryNames}
          placeholder="Mushrooms, coriander…"
          onAdd={(v) => set('leaveOut', [...order.leaveOut, v])}
          onRemove={(v) => set('leaveOut', order.leaveOut.filter((x) => !same(x, v)))}
          struck
        />
      </div>

      <div className="t-group">
        <span className="t-label" id="t-from">Cook from</span>
        <div className="t-switch" role="radiogroup" aria-labelledby="t-from">
          {FROM.map(([key, label]) => (
            <button key={key} type="button" role="radio" aria-checked={order.from === key} className={order.from === key ? 'inked' : ''} onClick={() => { tick(); set('from', key); }}>
              {label}
            </button>
          ))}
        </div>
        <p className="t-hint">{FROM_HINT[order.from]}</p>
      </div>

      <div className="t-rule">Small print</div>
      <div className="t-lines">
        <Line label="Meal" value={order.meal} options={SMALL_PRINT.meal} onChange={(v) => set('meal', v)} />
        <Line label="Time" value={order.time} options={SMALL_PRINT.time} onChange={(v) => set('time', v)} />
        <Line label="Serves" value={order.serves} options={SMALL_PRINT.serves} onChange={(v) => set('serves', v)} />
        <Line label="Skill" value={order.skill} options={SMALL_PRINT.skill} onChange={(v) => set('skill', v)} />
        <Line label="Kit" value={order.kit} options={SMALL_PRINT.kit} onChange={(v) => set('kit', v)} />
        {order.feels.includes('Spicy') ? <Line label="Heat" value={order.heat} options={SMALL_PRINT.heat} onChange={(v) => set('heat', v)} /> : null}
        <Line
          label="Calories"
          value={order.calories}
          options={[
            ['any', 'Don’t mind'],
            ['fit', caloriesLeft !== null && caloriesLeft > 0 ? `Fit the ${caloriesLeft.toLocaleString()} left today` : 'Fit what’s left today'],
            ['light', 'Light, under 500'],
            ['hearty', 'Hearty'],
          ]}
          onChange={(v) => set('calories', v as Order['calories'])}
        />
        <Line
          label="Diet"
          value={order.diet}
          options={[['', dietTags.length ? `As in Settings: ${dietTags.join(', ')}` : 'Anything goes'], ...SMALL_PRINT.diet.map((d): [string, string] => [d, d])]}
          onChange={(v) => set('diet', v)}
        />
      </div>
    </div>
  );
}

/** Foods written onto the ticket: typed or picked from what the pantry knows. */
function Foods({
  id,
  values,
  suggestions,
  placeholder,
  onAdd,
  onRemove,
  struck = false,
}: {
  id: string;
  values: string[];
  suggestions: string[];
  placeholder: string;
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
  /** leave-out foods are printed crossed through */
  struck?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const value = draft.trim().replace(/,$/, '');
    if (value && !values.some((v) => same(v, value))) onAdd(value);
    setDraft('');
  };
  return (
    <div className="t-foodfield">
      {values.map((value) => (
        <span key={value} className={`t-token${struck ? ' struck' : ''}`}>
          <span>{value}</span>
          <button type="button" aria-label={`Take ${value} off`} onClick={() => onRemove(value)}>
            <Icon name="close" size={13} stroke={2.2} />
          </button>
        </span>
      ))}
      <input
        id={id}
        list={`${id}-known`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder={values.length ? 'Another' : placeholder}
        enterKeyHint="done"
        autoCapitalize="none"
      />
      <datalist id={`${id}-known`}>
        {suggestions.map((s) => <option key={s} value={s} />)}
      </datalist>
    </div>
  );
}

/** A receipt line, "TIME ........ UNDER 30 MIN", that opens the phone's own picker. */
function Line({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly (string | [string, string])[];
  onChange: (value: string) => void;
}) {
  const pairs = options.map((o): [string, string] => (typeof o === 'string' ? [o, o] : o));
  const shown = pairs.find(([v]) => v === value)?.[1] ?? value;
  return (
    <label className="t-line">
      <span className="k">{label}</span>
      <span className="dots" aria-hidden="true" />
      <span className="v">
        <span className="vt">{shown}</span>
        <Icon name="down" size={12} stroke={2.4} />
      </span>
      <select value={value} onChange={(e) => { tick(); onChange(e.target.value); }} aria-label={label}>
        {pairs.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </label>
  );
}
